"use server";

import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { field, fieldErrorsFrom, type FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import {
  commentMediaValues,
  deleteCommentMedia,
  EMPTY_COMMENT_MEDIA,
  hasCommentMedia,
  saveCommentMedia,
} from "@/lib/comment-media";
import { COMMENT_MAX } from "@/lib/constants";
import { db } from "@/lib/db/client";
import {
  notifications,
  places,
  postCommentLikes,
  postComments,
  reviewCommentLikes,
  reviewComments,
  reviews,
} from "@/lib/db/schema";
import { notifyMentions } from "@/lib/notify-mentions";
import { commentMediaKind, likeNotificationBody } from "@/lib/posts";
import { avatarIcon, isPushEnabled, sendPushTo, type PushPayload } from "@/lib/push";
import type { CommentLikesTable } from "@/lib/queries/comment-likes";
import { checkRateLimit } from "@/lib/rate-limit";

// Módulo "use server": só pode exportar função async, então as mensagens ficam privadas.
const BODY_ERROR = `Escreve alguma coisa (até ${COMMENT_MAX} caracteres), ou manda uma foto ou um áudio.`;
const TOO_MANY = "Calma, influencer.";
const SAVE_FAILED = "Não deu pra salvar. Tenta de novo.";
const REVIEW_NOT_FOUND = "Avaliação não encontrada.";
const PLACE_ARCHIVED = "Esse lugar está arquivado.";
const COMMENT_NOT_FOUND = "Resposta não encontrada.";
const NOT_YOURS = "Essa resposta não é sua.";
const LIKE_NOT_FOUND = "Esse comentário não existe mais.";

/**
 * Curtir, descurtir e curtir de novo o mesmo comentário apita uma vez por hora, senão
 * o coração vira brinquedo de spam (docs/08 #44).
 */
const LIKE_NOTIFY_LIMIT = { limit: 1, windowMs: 60 * 60_000 };
/** Resposta com foto ou áudio: 30 por hora por pessoa (texto não conta). */
const COMMENT_MEDIA_RATE_LIMIT = { limit: 30, windowMs: 60 * 60_000 };

// "Tem texto ou anexo" é regra da action: o texto sozinho pode vir vazio (docs/08 #52).
const commentSchema = z.object({
  reviewId: z.string().trim().min(1, REVIEW_NOT_FOUND),
  body: z.string().trim().max(COMMENT_MAX, BODY_ERROR),
});

/** A avaliação com o lugar junto: precisa do slug pra revalidar e do status pra barrar arquivado. */
async function findReviewWithPlace(reviewId: string) {
  const rows = await db
    .select({
      id: reviews.id,
      userId: reviews.userId,
      placeId: places.id,
      slug: places.slug,
      placeStatus: places.status,
    })
    .from(reviews)
    .innerJoin(places, eq(places.id, reviews.placeId))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Responde uma avaliação: texto, foto ou áudio (docs/08 #52). Qualquer membro responde
 * qualquer avaliação (nada é privado). O anexo passa pelas mesmas regras da mídia de
 * post (`src/lib/comment-media.ts`).
 */
export async function addComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await assertUser();

  const parsed = commentSchema.safeParse({
    reviewId: field(formData, "reviewId"),
    body: field(formData, "body"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const data = parsed.data;
  const withMedia = hasCommentMedia(formData);
  if (!data.body && !withMedia) return { ok: false, fieldErrors: { body: BODY_ERROR } };

  const review = await findReviewWithPlace(data.reviewId);
  if (!review) return { ok: false, error: REVIEW_NOT_FOUND };
  if (review.placeStatus !== "active") return { ok: false, error: PLACE_ARCHIVED };

  if (withMedia && !checkRateLimit(`comment-media:${user.id}`, COMMENT_MEDIA_RATE_LIMIT).ok) {
    return { ok: false, error: TOO_MANY };
  }
  const saved = withMedia ? await saveCommentMedia(formData) : null;
  if (saved && !saved.ok) return { ok: false, error: saved.error };
  const media = saved ? saved.media : EMPTY_COMMENT_MEDIA;

  try {
    await db.insert(reviewComments).values({
      id: nanoid(12),
      reviewId: review.id,
      userId: user.id,
      body: data.body,
      ...commentMediaValues(media),
    });
  } catch {
    // Sem linha no banco o anexo é lixo: apaga em vez de deixar órfão.
    await deleteCommentMedia(commentMediaValues(media));
    return { ok: false, error: SAVE_FAILED };
  }

  // Quem foi citado na resposta leva um push apontando pra ficha.
  if (data.body) {
    await notifyMentions({
      text: data.body,
      author: { id: user.id, name: user.name, avatarId: user.avatarId },
      where: "comment",
      url: `/lugares/${review.slug}#avaliacoes`,
      placeId: review.placeId,
    });
  }

  revalidatePath(`/lugares/${review.slug}`);
  return { ok: true };
}

/**
 * Apaga a resposta e o anexo dela. Quem escreveu, quem escreveu a avaliação (é a
 * thread dela) ou um admin (docs/05 — Permissões).
 */
export async function deleteComment(commentId: string): Promise<FormState> {
  const { user } = await assertUser();

  const rows = await db
    .select({
      id: reviewComments.id,
      userId: reviewComments.userId,
      photoId: reviewComments.photoId,
      audioId: reviewComments.audioId,
      reviewUserId: reviews.userId,
      slug: places.slug,
    })
    .from(reviewComments)
    .innerJoin(reviews, eq(reviews.id, reviewComments.reviewId))
    .innerJoin(places, eq(places.id, reviews.placeId))
    .where(eq(reviewComments.id, commentId))
    .limit(1);

  const comment = rows[0];
  if (!comment) return { ok: false, error: COMMENT_NOT_FOUND };

  const allowed =
    comment.userId === user.id || comment.reviewUserId === user.id || user.role === "admin";
  if (!allowed) return { ok: false, error: NOT_YOURS };

  await db.delete(reviewComments).where(eq(reviewComments.id, comment.id));
  await deleteCommentMedia(comment);

  revalidatePath(`/lugares/${comment.slug}`);
  return { ok: true };
}

/**
 * Liga/desliga a minha curtida num comentário (de post ou resposta de avaliação) e
 * devolve o estado novo. Qualquer membro curte qualquer comentário; na ida, quem escreveu
 * leva um push (`notifyCommentLiked`).
 */
export async function toggleCommentLike(
  kind: "review" | "post",
  commentId: string,
): Promise<FormState & { liked?: boolean; count?: number }> {
  const { user } = await assertUser();
  if (typeof commentId !== "string" || commentId === "") {
    return { ok: false, error: LIKE_NOT_FOUND };
  }

  if (kind === "post") {
    const rows = await db
      .select({
        id: postComments.id,
        userId: postComments.userId,
        body: postComments.body,
        photoId: postComments.photoId,
        audioId: postComments.audioId,
        postId: postComments.postId,
      })
      .from(postComments)
      .where(eq(postComments.id, commentId))
      .limit(1);
    const comment = rows[0];
    if (!comment) return { ok: false, error: LIKE_NOT_FOUND };

    const result = await flipLike(postCommentLikes, comment.id, user.id);
    if (result.liked) {
      await notifyCommentLiked({
        kind,
        comment,
        liker: user,
        url: `/feed#post-${comment.postId}`,
        placeId: null,
      });
    }
    revalidatePath("/feed");
    return { ok: true, ...result };
  }

  if (kind === "review") {
    const rows = await db
      .select({
        id: reviewComments.id,
        userId: reviewComments.userId,
        body: reviewComments.body,
        photoId: reviewComments.photoId,
        audioId: reviewComments.audioId,
        slug: places.slug,
        placeId: places.id,
      })
      .from(reviewComments)
      .innerJoin(reviews, eq(reviews.id, reviewComments.reviewId))
      .innerJoin(places, eq(places.id, reviews.placeId))
      .where(eq(reviewComments.id, commentId))
      .limit(1);
    const comment = rows[0];
    if (!comment) return { ok: false, error: LIKE_NOT_FOUND };

    const result = await flipLike(reviewCommentLikes, comment.id, user.id);
    if (result.liked) {
      await notifyCommentLiked({
        kind,
        comment,
        liker: user,
        url: `/lugares/${comment.slug}#avaliacoes`,
        placeId: comment.placeId,
      });
    }
    revalidatePath(`/lugares/${comment.slug}`);
    return { ok: true, ...result };
  }

  return { ok: false, error: LIKE_NOT_FOUND };
}

/**
 * "Fulano curtiu seu comentário": push só pra quem escreveu (docs/08 #44), abrindo no
 * post ou na ficha. Curtir o próprio comentário não apita, e o mesmo par (pessoa,
 * comentário) só apita uma vez por hora. Nunca lança: a curtida já está gravada.
 */
async function notifyCommentLiked(opts: {
  kind: "review" | "post";
  comment: {
    id: string;
    userId: string;
    body: string;
    photoId: string | null;
    audioId: string | null;
  };
  liker: { id: string; name: string; avatarId?: string | null };
  url: string;
  placeId: string | null;
}): Promise<void> {
  if (opts.comment.userId === opts.liker.id || !isPushEnabled()) return;
  if (!checkRateLimit(`like:${opts.liker.id}:${opts.comment.id}`, LIKE_NOTIFY_LIMIT).ok) return;

  try {
    const payload: PushPayload = {
      title: "E o narga?",
      body: likeNotificationBody(
        opts.liker.name,
        opts.kind,
        opts.comment.body,
        commentMediaKind(opts.comment),
      ),
      url: opts.url,
      icon: avatarIcon(opts.liker.avatarId),
      // Várias curtidas no mesmo comentário trocam o balão em vez de empilhar.
      tag: `like:${opts.comment.id}`,
    };
    const report = await sendPushTo([opts.comment.userId], payload);
    await db.insert(notifications).values({
      id: nanoid(12),
      kind: "like",
      title: payload.title,
      body: payload.body,
      url: payload.url,
      placeId: opts.placeId,
      createdBy: opts.liker.id,
      targetUserId: opts.comment.userId,
      sentCount: report.sent,
    });
  } catch {
    // Sem aviso desta vez; a curtida continua lá.
  }
}

/** Tira a curtida se já existe, senão põe; e conta como ficou. */
async function flipLike(table: CommentLikesTable, commentId: string, userId: string) {
  const mine = and(eq(table.commentId, commentId), eq(table.userId, userId));
  const existing = await db.select({ commentId: table.commentId }).from(table).where(mine).limit(1);

  if (existing[0]) {
    await db.delete(table).where(mine);
  } else {
    await db.insert(table).values({ commentId, userId }).onConflictDoNothing();
  }

  const counted = await db
    .select({ count: sql<number>`count(*)` })
    .from(table)
    .where(eq(table.commentId, commentId));

  return { liked: !existing[0], count: Number(counted[0]?.count ?? 0) };
}
