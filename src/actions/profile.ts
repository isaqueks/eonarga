"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { deleteImage, MAX_UPLOAD_BYTES, saveImage, sniffImageMime } from "@/lib/storage";

/** Avatar é bem menor que uma foto de lugar: 512 px de lado, thumb de 160. */
const AVATAR_MAX_SIZE = 512;
const AVATAR_THUMB_SIZE = 160;

const NOT_AN_IMAGE = "Isso não é uma imagem que eu reconheça.";
// O sharp que vem pronto só decodifica HEIF em AV1; HEIC de iPhone (HEVC) fica de fora.
// Na prática o Safari já converte pra JPEG no upload, mas se escapar um, avisa direito.
const HEIC_NOT_SUPPORTED = "Não consegui abrir essa foto. Tenta mandar em JPEG ou PNG.";

const avatarSchema = z.object({
  avatar: z
    .instanceof(File, { message: "Escolhe uma foto." })
    .refine((file) => file.size > 0, "Escolhe uma foto.")
    .refine((file) => file.size <= MAX_UPLOAD_BYTES, "Foto grande demais (máximo 10 MB)."),
});

/** Revalida as duas telas que mostram avatar. */
function revalidateAvatar() {
  revalidatePath("/perfil");
  revalidatePath("/galera");
}

/** Troca a foto de perfil. Devolve o id novo pra a UI não esperar a revalidação. */
export async function updateAvatar(
  _prevState: FormState & { avatarId?: string | null },
  formData: FormData,
): Promise<FormState & { avatarId?: string | null }> {
  const { user } = await assertUser();

  const parsed = avatarSchema.safeParse({ avatar: formData.get("avatar") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Foto inválida." };
  }

  const buffer = Buffer.from(await parsed.data.avatar.arrayBuffer());

  // O `Content-Type` do upload é chute do cliente: quem manda é o magic byte (docs/05).
  const mime = sniffImageMime(buffer);
  if (!mime) return { ok: false, error: NOT_AN_IMAGE };

  let saved;
  try {
    saved = await saveImage(buffer, { maxSize: AVATAR_MAX_SIZE, thumbSize: AVATAR_THUMB_SIZE });
  } catch {
    const heic = mime === "image/heic" || mime === "image/heif";
    return { ok: false, error: heic ? HEIC_NOT_SUPPORTED : NOT_AN_IMAGE };
  }

  const previous = user.avatarId;

  await db
    .update(users)
    .set({ avatarId: saved.id, updatedAt: new Date().toISOString() })
    .where(eq(users.id, user.id));

  // Só depois de o banco apontar pra foto nova é que a antiga vira lixo.
  if (previous && previous !== saved.id) await deleteImage(previous);

  revalidateAvatar();
  return { ok: true, avatarId: saved.id };
}

export async function removeAvatar(): Promise<FormState> {
  const { user } = await assertUser();
  if (!user.avatarId) return { ok: true };

  await db
    .update(users)
    .set({ avatarId: null, updatedAt: new Date().toISOString() })
    .where(eq(users.id, user.id));

  await deleteImage(user.avatarId);

  revalidateAvatar();
  return { ok: true };
}
