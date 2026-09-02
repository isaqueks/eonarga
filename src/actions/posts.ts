"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { field, fieldErrorsFrom, type FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { places, posts } from "@/lib/db/schema";
import { postInputSchema } from "@/lib/posts";
import { checkRateLimit } from "@/lib/rate-limit";
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
  if (hasPhoto && photo.size > MAX_UPLOAD_BYTES) {
    return { ok: false, fieldErrors: { photo: TOO_BIG } };
  }
  if (!hasPhoto && !input.body) {
    return { ok: false, fieldErrors: { body: EMPTY_POST } };
  }

  if (!checkRateLimit(`post:${user.id}`, POST_RATE_LIMIT).ok) {
    return { ok: false, error: TOO_MANY };
  }

  let saved: { id: string; width: number; height: number } | null = null;
  if (hasPhoto) {
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
