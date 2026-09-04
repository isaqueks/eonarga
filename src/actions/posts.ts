"use server";

import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { field, fieldErrorsFrom, type FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { COMMENT_MAX } from "@/lib/constants";
import { db } from "@/lib/db/client";
import { notifications, places, postComments, postReactions, posts } from "@/lib/db/schema";
import { commentNotificationBody, postInputSchema } from "@/lib/posts";
import { isPushEnabled, sendPushTo, type PushPayload } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";
import { isReactionEmoji } from "@/lib/reviews";
import { discardStagedImport, takeStagedImport } from "@/lib/staged-imports";
import { deleteImage, MAX_UPLOAD_BYTES, saveImage, sniffImageMime } from "@/lib/storage";

/** Foto de post é pra ver no celular, igual à foto de lugar. */
const PHOTO_MAX_SIZE = 1600;
const PHOTO_THUMB_SIZE = 400;

/** 20 posts por hora por pessoa. Não é moderação: é pra ninguém entupir o feed sem querer. */
const POST_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

// Módulo "use server": só exporta função async, então as mensagens ficam privadas.
const EMPTY_POST = "Manda uma foto ou escreve alguma coisa.";
const PLACE_NOT_FOUND = "Lugar não encontrado.";
const PLACE_ARCHIVED = "Esse lugar está arquivado.";
const TOO_BIG = "Foto grande demais (máximo 10 MB).";
const NOT_AN_IMAGE = "Isso não é uma imagem que eu reconheça.";
// O sharp que vem pronto só decodifica HEIF em AV1; HEIC de iPhone (HEVC) fica de fora.
const HEIC_NOT_SUPPORTED = "Não consegui abrir essa foto. Tenta mandar em JPEG ou PNG.";
const TOO_MANY = "Calma, influencer.";
const IMPORT_EXPIRED = "A foto importada venceu. Importa de novo.";
const SAVE_FAILED = "Não deu pra salvar. Tenta de novo.";
const POST_NOT_FOUND = "Não achei esse post.";
const NOT_YOURS = "Só quem postou (ou admin) pode apagar.";

/**
 * Publica um post no feed: foto e/ou texto, sempre com quem postou e de onde
 * (docs/01 — Feed).
 *
 * "De onde" é um lugar cadastrado ou um ponto solto (GPS / toque no mapa). Com lugar,
 * `lat/lng` e endereço vêm do próprio lugar — o que o cliente mandou não conta, senão
 * dava pra gravar um post "no Sebo do João" com coordenada de Curitiba.
 *
 * A foto é reprocessada pelo sharp (webp, sem EXIF) antes de tocar o disco — ver
 * `src/lib/storage.ts` e docs/05, "Upload malicioso".
 */
export async function createPost(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { user } = await assertUser();

  const placeId = field(formData, "placeId").trim();
  let place: { id: string; lat: number; lng: number; address: string | null } | null = null;

  if (placeId !== "") {
    const found = await db.query.places.findFirst({
      where: eq(places.id, placeId),
      columns: { id: true, status: true, lat: true, lng: true, address: true },
    });
    if (!found) return { ok: false, error: PLACE_NOT_FOUND };
    if (found.status !== "active") return { ok: false, error: PLACE_ARCHIVED };
    place = { id: found.id, lat: found.lat, lng: found.lng, address: found.address };
  }

  const parsed = postInputSchema.safeParse({
    body: field(formData, "body"),
    placeId,
    lat: place ? place.lat : field(formData, "lat"),
    lng: place ? place.lng : field(formData, "lng"),
    address: place ? (place.address ?? "") : field(formData, "address"),
  });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    // Erro de coordenada não tem campo visível na tela: sobe como erro do formulário.
    const error = fieldErrors.lat ?? fieldErrors.lng;
    return { ok: false, ...(error ? { error } : {}), fieldErrors };
  }
  const input = parsed.data;

  const photo = formData.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;
  // Foto importada do Instagram: já está no storage, "no palco" (docs/08 #37).
  const importedPhotoId = field(formData, "importedPhotoId").trim();
  if (hasPhoto && photo.size > MAX_UPLOAD_BYTES) {
    return { ok: false, fieldErrors: { photo: TOO_BIG } };
  }
  if (!hasPhoto && !importedPhotoId && !input.body) {
    return { ok: false, fieldErrors: { body: EMPTY_POST } };
  }

  if (!checkRateLimit(`post:${user.id}`, POST_RATE_LIMIT).ok) {
    return { ok: false, error: TOO_MANY };
  }

  let saved: { id: string; width: number; height: number } | null = null;
  let source: { url: string; author: string | null } | null = null;
  if (!hasPhoto && importedPhotoId) {
    const staged = takeStagedImport(importedPhotoId, user.id);
    if (!staged) return { ok: false, fieldErrors: { photo: IMPORT_EXPIRED } };
    saved = { id: staged.id, width: staged.width, height: staged.height };
    source = { url: staged.sourceUrl, author: staged.sourceAuthor };
  }
  if (hasPhoto) {
    // Mandou foto própria por cima da importada: a importada vira lixo.
    if (importedPhotoId) await discardStagedImport(importedPhotoId, user.id);
    const buffer = Buffer.from(await photo.arrayBuffer());

    // O `Content-Type` do upload é chute do cliente: quem manda é o magic byte (docs/05).
    const mime = sniffImageMime(buffer);
    if (!mime) return { ok: false, fieldErrors: { photo: NOT_AN_IMAGE } };

    try {
      saved = await saveImage(buffer, { maxSize: PHOTO_MAX_SIZE, thumbSize: PHOTO_THUMB_SIZE });
    } catch {
      const heic = mime === "image/heic" || mime === "image/heif";
      return { ok: false, fieldErrors: { photo: heic ? HEIC_NOT_SUPPORTED : NOT_AN_IMAGE } };
    }
  }

  try {
    await db.insert(posts).values({
      id: nanoid(12),
      userId: user.id,
      body: input.body,
      photoId: saved?.id ?? null,
      photoWidth: saved?.width ?? null,
      photoHeight: saved?.height ?? null,
      placeId: place?.id ?? null,
      lat: input.lat,
      lng: input.lng,
      address: input.address,
      sourceUrl: source?.url ?? null,
      sourceAuthor: source?.author ?? null,
    });
  } catch {
    // Sem linha no banco a foto é lixo: apaga os arquivos em vez de deixar órfão.
    if (saved) await deleteImage(saved.id);
    return { ok: false, error: SAVE_FAILED };
  }

  revalidatePath("/feed");
  redirect("/feed");
}

/** Apaga o post e a foto dele. Só quem postou, ou admin. */
export async function deletePost(postId: string): Promise<FormState> {
  const { user } = await assertUser();
  if (typeof postId !== "string" || postId === "") {
    return { ok: false, error: POST_NOT_FOUND };
  }

  const rows = await db
    .select({ id: posts.id, userId: posts.userId, photoId: posts.photoId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  const post = rows[0];
  if (!post) return { ok: false, error: POST_NOT_FOUND };
  if (post.userId !== user.id && user.role !== "admin") {
    return { ok: false, error: NOT_YOURS };
  }

  await db.delete(posts).where(eq(posts.id, post.id));
  // Só depois de a linha sumir é que o arquivo vira lixo.
  if (post.photoId) await deleteImage(post.photoId);

  revalidatePath("/feed");
  return { ok: true };
}

// --- Reações e comentários -----------------------------------------------------

const BAD_EMOJI = "Esse emoji não existe por aqui.";
const COMMENT_BODY_ERROR = `Escreve alguma coisa (até ${COMMENT_MAX} caracteres).`;
const COMMENT_NOT_FOUND = "Comentário não encontrado.";
const COMMENT_NOT_YOURS = "Esse comentário não é seu.";

const commentSchema = z.object({
  postId: z.string().trim().min(1, POST_NOT_FOUND),
  body: z.string().trim().min(1, COMMENT_BODY_ERROR).max(COMMENT_MAX, COMMENT_BODY_ERROR),
});

async function findPost(postId: string) {
  if (typeof postId !== "string" || postId === "") return null;
  const rows = await db
    .select({ id: posts.id, userId: posts.userId, placeId: posts.placeId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * "Fulano comentou no seu post": push só pra quem postou (docs/08 #34). Fica no
 * histórico do admin como as chamadas, com a contagem de aparelhos que receberam.
 * O toque na notificação abre o feed na âncora do post.
 */
async function notifyPostAuthor(
  post: { id: string; userId: string; placeId: string | null },
  commenter: { id: string; name: string },
  comment: string,
) {
  const payload: PushPayload = {
    title: "E o narga?",
    body: commentNotificationBody(commenter.name, comment),
    url: `/feed#post-${post.id}`,
    // Vários comentários no mesmo post trocam o balão em vez de empilhar.
    tag: `comment:${post.id}`,
  };

  const report = await sendPushTo([post.userId], payload);

  await db.insert(notifications).values({
    id: nanoid(12),
    kind: "comment",
    title: payload.title,
    body: payload.body,
    url: payload.url,
    placeId: post.placeId,
    createdBy: commenter.id,
    targetUserId: post.userId,
    sentCount: report.sent,
  });
}

/** Liga/desliga uma reação minha no post e devolve o estado novo daquele emoji. */
export async function togglePostReaction(
  postId: string,
  emoji: string,
): Promise<FormState & { reacted?: boolean; count?: number }> {
  const { user } = await assertUser();

  if (!isReactionEmoji(emoji)) return { ok: false, error: BAD_EMOJI };

  const post = await findPost(postId);
  if (!post) return { ok: false, error: POST_NOT_FOUND };

  const mine = and(
    eq(postReactions.postId, post.id),
    eq(postReactions.userId, user.id),
    eq(postReactions.emoji, emoji),
  );

  const existing = await db.query.postReactions.findFirst({ where: mine });

  if (existing) {
    await db.delete(postReactions).where(mine);
  } else {
    await db
      .insert(postReactions)
      .values({ postId: post.id, userId: user.id, emoji })
      .onConflictDoNothing();
  }

  const counted = await db
    .select({ count: sql<number>`count(*)` })
    .from(postReactions)
    .where(and(eq(postReactions.postId, post.id), eq(postReactions.emoji, emoji)));

  revalidatePath("/feed");
  return { ok: true, reacted: !existing, count: Number(counted[0]?.count ?? 0) };
}

/** Comenta num post. Qualquer membro comenta qualquer post (nada é privado). */
export async function addPostComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await assertUser();

  const parsed = commentSchema.safeParse({
    postId: field(formData, "postId"),
    body: field(formData, "body"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const data = parsed.data;

  const post = await findPost(data.postId);
  if (!post) return { ok: false, error: POST_NOT_FOUND };

  await db.insert(postComments).values({
    id: nanoid(12),
    postId: post.id,
    userId: user.id,
    body: data.body,
  });

  // Comentar no próprio post não apita. E push que falhar não derruba o comentário:
  // ele já está gravado, o aviso é bônus.
  if (post.userId !== user.id && isPushEnabled()) {
    try {
      await notifyPostAuthor(post, { id: user.id, name: user.name }, data.body);
    } catch {
      // Sem aviso desta vez; o comentário continua no feed.
    }
  }

  revalidatePath("/feed");
  return { ok: true };
}

/**
 * Apaga o comentário. Quem escreveu, quem postou (é a thread do post) ou um admin
 * (docs/05 — Permissões).
 */
export async function deletePostComment(commentId: string): Promise<FormState> {
  const { user } = await assertUser();
  if (typeof commentId !== "string" || commentId === "") {
    return { ok: false, error: COMMENT_NOT_FOUND };
  }

  const rows = await db
    .select({
      id: postComments.id,
      userId: postComments.userId,
      postUserId: posts.userId,
    })
    .from(postComments)
    .innerJoin(posts, eq(posts.id, postComments.postId))
    .where(eq(postComments.id, commentId))
    .limit(1);

  const comment = rows[0];
  if (!comment) return { ok: false, error: COMMENT_NOT_FOUND };

  const allowed =
    comment.userId === user.id || comment.postUserId === user.id || user.role === "admin";
  if (!allowed) return { ok: false, error: COMMENT_NOT_YOURS };

  await db.delete(postComments).where(eq(postComments.id, comment.id));

  revalidatePath("/feed");
  return { ok: true };
}
