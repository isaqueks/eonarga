"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { photos, places } from "@/lib/db/schema";
import { countPhotosForPlace, MAX_PHOTOS_PER_PLACE } from "@/lib/queries/photos";
import { deleteImage, MAX_UPLOAD_BYTES, saveImage, sniffImageMime } from "@/lib/storage";

/** Foto de lugar é pra ver na tela do celular, não pra imprimir: 1600 px basta. */
const PHOTO_MAX_SIZE = 1600;
const PHOTO_THUMB_SIZE = 400;

const NOT_AN_IMAGE = "Isso não é uma imagem que eu reconheça.";
// O sharp que vem pronto só decodifica HEIF em AV1; HEIC de iPhone (HEVC) fica de fora.
const HEIC_NOT_SUPPORTED = "Não consegui abrir essa foto. Tenta mandar em JPEG ou PNG.";
const PLACE_NOT_FOUND = "Lugar não encontrado.";
const PLACE_ARCHIVED = "Esse lugar está arquivado.";
const TOO_MANY = "Esse lugar já tem foto demais.";
const PHOTO_NOT_FOUND = "Não achei essa foto.";
const NOT_YOURS = "Só quem mandou a foto (ou admin) pode apagar.";
const SAVE_FAILED = "Não deu pra salvar. Tenta de novo.";

const uploadSchema = z.object({
  placeId: z.string().trim().min(1, PLACE_NOT_FOUND),
  photo: z
    .instanceof(File, { message: "Escolhe uma foto." })
    .refine((file) => file.size > 0, "Escolhe uma foto.")
    .refine((file) => file.size <= MAX_UPLOAD_BYTES, "Foto grande demais (máximo 10 MB)."),
});

/** A ficha e o recorte público mostram as mesmas fotos. */
function revalidatePlace(slug: string) {
  revalidatePath(`/lugares/${slug}`);
  revalidatePath(`/p/${slug}`);
}

/**
 * Manda uma foto pro lugar. O arquivo é reprocessado pelo sharp (webp, sem EXIF) antes
 * de tocar o disco — ver `src/lib/storage.ts` e docs/05, "Upload malicioso".
 *
 * A linha de `photos` reusa o id gerado pelo storage: um id, dois arquivos, uma linha.
 */
export async function uploadPlacePhoto(
  _prevState: FormState & { photoId?: string },
  formData: FormData,
): Promise<FormState & { photoId?: string }> {
  const { user } = await assertUser();

  const parsed = uploadSchema.safeParse({
    placeId: formData.get("placeId"),
    photo: formData.get("photo"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Foto inválida." };
  }

  const place = await db.query.places.findFirst({
    where: eq(places.id, parsed.data.placeId),
    columns: { id: true, slug: true, status: true },
  });
  if (!place) return { ok: false, error: PLACE_NOT_FOUND };
  if (place.status !== "active") return { ok: false, error: PLACE_ARCHIVED };

  if ((await countPhotosForPlace(place.id)) >= MAX_PHOTOS_PER_PLACE) {
    return { ok: false, error: TOO_MANY };
  }

  const buffer = Buffer.from(await parsed.data.photo.arrayBuffer());

  // O `Content-Type` do upload é chute do cliente: quem manda é o magic byte (docs/05).
  const mime = sniffImageMime(buffer);
  if (!mime) return { ok: false, error: NOT_AN_IMAGE };

  let saved;
  try {
    saved = await saveImage(buffer, { maxSize: PHOTO_MAX_SIZE, thumbSize: PHOTO_THUMB_SIZE });
  } catch {
    const heic = mime === "image/heic" || mime === "image/heif";
    return { ok: false, error: heic ? HEIC_NOT_SUPPORTED : NOT_AN_IMAGE };
  }

  try {
    await db.insert(photos).values({
      id: saved.id,
      placeId: place.id,
      uploadedBy: user.id,
      width: saved.width,
      height: saved.height,
    });
  } catch {
    // Sem linha no banco a foto é lixo: apaga os arquivos em vez de deixar órfão.
    await deleteImage(saved.id);
    return { ok: false, error: SAVE_FAILED };
  }

  revalidatePlace(place.slug);
  return { ok: true, photoId: saved.id };
}

/** Apaga a foto e os dois arquivos. Só quem mandou, ou admin. */
export async function deletePhoto(photoId: string): Promise<FormState> {
  const { user } = await assertUser();
  if (typeof photoId !== "string" || photoId === "") {
    return { ok: false, error: PHOTO_NOT_FOUND };
  }

  const rows = await db
    .select({ uploadedBy: photos.uploadedBy, slug: places.slug })
    .from(photos)
    .innerJoin(places, eq(places.id, photos.placeId))
    .where(eq(photos.id, photoId))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, error: PHOTO_NOT_FOUND };
  if (row.uploadedBy !== user.id && user.role !== "admin") {
    return { ok: false, error: NOT_YOURS };
  }

  await db.delete(photos).where(eq(photos.id, photoId));
  // Só depois de a linha sumir é que os arquivos viram lixo.
  await deleteImage(photoId);

  revalidatePlace(row.slug);
  return { ok: true };
}
