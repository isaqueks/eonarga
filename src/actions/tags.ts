"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { placeTags, places } from "@/lib/db/schema";
import { tagListSchema } from "@/lib/tags";

const NOT_FOUND = "Lugar não encontrado.";
const PLACE_ARCHIVED = "Esse lugar está arquivado.";
const SAVE_FAILED = "Não deu pra salvar as tags. Tenta de novo.";

/**
 * Substitui o conjunto de tags do lugar. Qualquer membro mexe — tag é dado do lugar,
 * não opinião de ninguém (docs/05: "Editar 'Tem narga?', dicas... de qualquer lugar").
 * Devolve a lista canônica (normalizada, sem repetida, em ordem alfabética).
 */
export async function setPlaceTags(
  placeId: string,
  tags: string[],
): Promise<FormState & { tags?: string[] }> {
  const { user } = await assertUser();

  const place = await db.query.places.findFirst({
    where: eq(places.id, placeId),
    columns: { id: true, slug: true, status: true },
  });
  if (!place) return { ok: false, error: NOT_FOUND };
  if (place.status !== "active") return { ok: false, error: PLACE_ARCHIVED };

  // Entrada vem de um input livre: campo em branco é desistência, não erro.
  const raw = Array.isArray(tags)
    ? tags.filter((t) => typeof t === "string" && t.trim() !== "")
    : [];
  const parsed = tagListSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? SAVE_FAILED };
  }
  const wanted = parsed.data;

  await db.delete(placeTags).where(eq(placeTags.placeId, place.id));
  if (wanted.length > 0) {
    await db
      .insert(placeTags)
      .values(wanted.map((tag) => ({ placeId: place.id, tag, createdBy: user.id })))
      .onConflictDoNothing();
  }

  revalidatePath(`/lugares/${place.slug}`);
  revalidatePath("/");
  revalidatePath("/mapa");
  revalidatePath("/role");

  return { ok: true, tags: wanted };
}
