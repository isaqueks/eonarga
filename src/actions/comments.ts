"use server";

import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { field, fieldErrorsFrom, type FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { COMMENT_MAX } from "@/lib/constants";
import { db } from "@/lib/db/client";
import {
  places,
  postCommentLikes,
  postComments,
  reviewCommentLikes,
  reviewComments,
  reviews,
} from "@/lib/db/schema";
import { notifyMentions } from "@/lib/notify-mentions";
import type { CommentLikesTable } from "@/lib/queries/comment-likes";

// Módulo "use server": só pode exportar função async, então as mensagens ficam privadas.
const BODY_ERROR = `Escreve alguma coisa (até ${COMMENT_MAX} caracteres).`;
const REVIEW_NOT_FOUND = "Avaliação não encontrada.";
const PLACE_ARCHIVED = "Esse lugar está arquivado.";
const COMMENT_NOT_FOUND = "Resposta não encontrada.";
const NOT_YOURS = "Essa resposta não é sua.";
const LIKE_NOT_FOUND = "Esse comentário não existe mais.";

const commentSchema = z.object({
  reviewId: z.string().trim().min(1, REVIEW_NOT_FOUND),
  body: z.string().trim().min(1, BODY_ERROR).max(COMMENT_MAX, BODY_ERROR),
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

/** Responde uma avaliação. Qualquer membro responde qualquer avaliação (nada é privado). */
export async function addComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await assertUser();

  const parsed = commentSchema.safeParse({
    reviewId: field(formData, "reviewId"),
    body: field(formData, "body"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const data = parsed.data;

  const review = await findReviewWithPlace(data.reviewId);
  if (!review) return { ok: false, error: REVIEW_NOT_FOUND };
  if (review.placeStatus !== "active") return { ok: false, error: PLACE_ARCHIVED };

  await db.insert(reviewComments).values({
    id: nanoid(12),
    reviewId: review.id,
    userId: user.id,
    body: data.body,
  });

  // Quem foi citado na resposta leva um push apontando pra ficha.
  await notifyMentions({
    text: data.body,
    author: { id: user.id, name: user.name, avatarId: user.avatarId },
    where: "comment",
    url: `/lugares/${review.slug}#avaliacoes`,
    placeId: review.placeId,
  });

  revalidatePath(`/lugares/${review.slug}`);
  return { ok: true };
}

/**
 * Apaga a resposta. Quem escreveu, quem escreveu a avaliação (é a thread dela) ou
 * um admin (docs/05 — Permissões).
 */
export async function deleteComment(commentId: string): Promise<FormState> {
  const { user } = await assertUser();

  const rows = await db
    .select({
      id: reviewComments.id,
      userId: reviewComments.userId,
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

  revalidatePath(`/lugares/${comment.slug}`);
  return { ok: true };
}

/**
 * Liga/desliga a minha curtida num comentário (de post ou resposta de avaliação) e
 * devolve o estado novo. Qualquer membro curte qualquer comentário; não notifica ninguém.
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
      .select({ id: postComments.id })
      .from(postComments)
      .where(eq(postComments.id, commentId))
      .limit(1);
    if (!rows[0]) return { ok: false, error: LIKE_NOT_FOUND };

    const result = await flipLike(postCommentLikes, rows[0].id, user.id);
    revalidatePath("/feed");
    return { ok: true, ...result };
  }

  if (kind === "review") {
    const rows = await db
      .select({ id: reviewComments.id, slug: places.slug })
      .from(reviewComments)
      .innerJoin(reviews, eq(reviews.id, reviewComments.reviewId))
      .innerJoin(places, eq(places.id, reviews.placeId))
      .where(eq(reviewComments.id, commentId))
      .limit(1);
    if (!rows[0]) return { ok: false, error: LIKE_NOT_FOUND };

    const result = await flipLike(reviewCommentLikes, rows[0].id, user.id);
    revalidatePath(`/lugares/${rows[0].slug}`);
    return { ok: true, ...result };
  }

  return { ok: false, error: LIKE_NOT_FOUND };
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
