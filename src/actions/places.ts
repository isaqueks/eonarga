"use server";

import { and, eq, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { field, fieldErrorsFrom, type FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { categories, HAS_NARGA, places, userPlaceStatus } from "@/lib/db/schema";
import { isAllowedMapsUrl } from "@/lib/maps-link";
import { slugify } from "@/lib/slug";

const NOT_FOUND = "Lugar não encontrado.";
const NOT_OWNER = "Só quem cadastrou (ou admin) muda nome, categoria e posição.";
const NOT_OWNER_ARCHIVE = "Só quem cadastrou (ou admin) pode arquivar.";
const SAVE_FAILED = "Não deu pra salvar. Tenta de novo.";

/** Coordenada float: comparar com `===` depois do round-trip pelo form é pedir pra dar ruim. */
const COORD_EPSILON = 1e-7;

const nullIfEmpty = (v: string) => (v === "" ? null : v);

const coordField = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v !== "" && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max, message)
    .transform(Number);

/** Aceita "@fulano", "fulano" ou a URL do perfil; guarda só o handle. */
const instagramField = z
  .string()
  .trim()
  .transform((v) =>
    v
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/[/?#].*$/, "")
      .replace(/^@/, ""),
  )
  .refine(
    (v) => v === "" || /^[A-Za-z0-9._]{1,30}$/.test(v),
    "Instagram inválido: só letras, números, ponto e _",
  )
  .transform(nullIfEmpty);

const websiteField = z
  .string()
  .trim()
  // Quem digita "sebo.com.br" quer dizer https://sebo.com.br.
  .transform((v) => (v === "" || /^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    if (v === "") return true;
    try {
      const url = new URL(v);
      return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Site inválido. Cola o endereço completo.")
  .transform(nullIfEmpty);

const googleMapsUrlField = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    try {
      return isAllowedMapsUrl(new URL(v));
    } catch {
      return false;
    }
  }, "Esse link não é do Google Maps.")
  .transform(nullIfEmpty);

const priceLevelField = z
  .string()
  .trim()
  .refine((v) => v === "" || ["1", "2", "3", "4"].includes(v), "Faixa de preço inválida")
  .transform((v) => (v === "" ? null : Number(v)));

const placeSchema = z.object({
  name: z.string().trim().min(2, "Nome curto demais").max(80, "Nome comprido demais (máximo 80)"),
  categoryId: z.string().trim().min(1, "Escolhe uma categoria"),
  lat: coordField(90, "Marca o lugar no mapa"),
  lng: coordField(180, "Marca o lugar no mapa"),
  address: z
    .string()
    .trim()
    .max(200, "Endereço comprido demais (máximo 200)")
    .transform(nullIfEmpty),
  description: z
    .string()
    .trim()
    .max(280, "Descrição comprida demais (máximo 280)")
    .transform(nullIfEmpty),
  tips: z.string().trim().max(1000, "Dicas compridas demais (máximo 1000)").transform(nullIfEmpty),
  instagram: instagramField,
  website: websiteField,
  priceLevel: priceLevelField,
  hasNarga: z.enum(HAS_NARGA, { message: "Responde se tem narga" }),
  googleMapsUrl: googleMapsUrlField,
  googlePlaceId: z.string().trim().max(200, "Place id comprido demais").transform(nullIfEmpty),
});

type PlaceInput = z.infer<typeof placeSchema>;

function readPlaceForm(formData: FormData) {
  return {
    name: field(formData, "name"),
    categoryId: field(formData, "categoryId"),
    lat: field(formData, "lat"),
    lng: field(formData, "lng"),
    address: field(formData, "address"),
    description: field(formData, "description"),
    tips: field(formData, "tips"),
    instagram: field(formData, "instagram"),
    website: field(formData, "website"),
    priceLevel: field(formData, "priceLevel"),
    hasNarga: field(formData, "hasNarga") || "unknown",
    googleMapsUrl: field(formData, "googleMapsUrl"),
    googlePlaceId: field(formData, "googlePlaceId"),
  };
}

/** Slug livre a partir do nome: "sebo-do-joao", "sebo-do-joao-2", ... */
async function nextFreeSlug(base: string): Promise<string> {
  // O slug só tem [a-z0-9-], então não há curinga de LIKE pra escapar.
  const rows = await db
    .select({ slug: places.slug })
    .from(places)
    .where(like(places.slug, `${base}%`));
  const taken = new Set(rows.map((r) => r.slug));

  if (!taken.has(base)) return base;
  for (let i = 2; i <= 500; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

function revalidatePlaceLists() {
  revalidatePath("/");
  revalidatePath("/mapa");
  revalidatePath("/role");
}

function isOwnerOrAdmin(place: { createdBy: string }, user: { id: string; role: string }): boolean {
  return place.createdBy === user.id || user.role === "admin";
}

function sameCoord(a: number, b: number): boolean {
  return Math.abs(a - b) < COORD_EPSILON;
}

async function categoryExists(categoryId: string): Promise<boolean> {
  const found = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
    columns: { id: true },
  });
  return Boolean(found);
}

/** Cadastra o lugar. Colisão de slug ganha sufixo; corrida no índice único vira nova tentativa. */
export async function createPlace(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await assertUser();

  const parsed = placeSchema.safeParse(readPlaceForm(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const data = parsed.data;

  if (!(await categoryExists(data.categoryId))) {
    return { ok: false, fieldErrors: { categoryId: "Categoria não encontrada." } };
  }

  const base = slugify(data.name);
  let slug: string | null = null;

  for (let attempt = 0; attempt < 5 && slug === null; attempt++) {
    const candidate = await nextFreeSlug(base);
    try {
      await db.insert(places).values({
        id: nanoid(12),
        slug: candidate,
        name: data.name,
        categoryId: data.categoryId,
        description: data.description,
        tips: data.tips,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        googleMapsUrl: data.googleMapsUrl,
        googlePlaceId: data.googlePlaceId,
        instagram: data.instagram,
        website: data.website,
        priceLevel: data.priceLevel,
        hasNarga: data.hasNarga,
        status: "active",
        createdBy: user.id,
      });
      slug = candidate;
    } catch {
      // Provavelmente outro cadastro pegou o slug entre o SELECT e o INSERT: tenta de novo.
    }
  }

  if (slug === null) return { ok: false, error: SAVE_FAILED };

  revalidatePlaceLists();
  redirect(`/lugares/${slug}`);
}

/**
 * Edita o lugar. Qualquer membro mexe em "tem narga", dicas, endereço, descrição,
 * links e preço; nome, categoria e posição só o dono ou um admin (docs/05).
 * O slug nunca muda: link já mandado no grupo continua valendo.
 */
export async function updatePlace(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await assertUser();

  const id = field(formData, "id").trim();
  if (!id) return { ok: false, error: NOT_FOUND };

  const place = await db.query.places.findFirst({ where: eq(places.id, id) });
  if (!place) return { ok: false, error: NOT_FOUND };

  const parsed = placeSchema.safeParse(readPlaceForm(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const data: PlaceInput = parsed.data;

  const privileged = isOwnerOrAdmin(place, user);
  if (!privileged) {
    const mudouRestrito =
      data.name !== place.name ||
      data.categoryId !== place.categoryId ||
      !sameCoord(data.lat, place.lat) ||
      !sameCoord(data.lng, place.lng);
    if (mudouRestrito) return { ok: false, error: NOT_OWNER };
  }

  if (
    privileged &&
    data.categoryId !== place.categoryId &&
    !(await categoryExists(data.categoryId))
  ) {
    return { ok: false, fieldErrors: { categoryId: "Categoria não encontrada." } };
  }

  await db
    .update(places)
    .set({
      // Sem privilégio esses quatro são iguais aos atuais (checado acima).
      name: privileged ? data.name : place.name,
      categoryId: privileged ? data.categoryId : place.categoryId,
      lat: privileged ? data.lat : place.lat,
      lng: privileged ? data.lng : place.lng,
      description: data.description,
      tips: data.tips,
      address: data.address,
      googleMapsUrl: data.googleMapsUrl,
      googlePlaceId: data.googlePlaceId,
      instagram: data.instagram,
      website: data.website,
      priceLevel: data.priceLevel,
      hasNarga: data.hasNarga,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(places.id, place.id));

  revalidatePath(`/lugares/${place.slug}`);
  revalidatePlaceLists();
  redirect(`/lugares/${place.slug}`);
}

/** Arquiva: some do ranking e do mapa, mas as avaliações continuam lá. */
export async function archivePlace(id: string): Promise<FormState> {
  const { user } = await assertUser();

  const place = await db.query.places.findFirst({ where: eq(places.id, id) });
  if (!place) return { ok: false, error: NOT_FOUND };
  if (!isOwnerOrAdmin(place, user)) return { ok: false, error: NOT_OWNER_ARCHIVE };

  await db
    .update(places)
    .set({ status: "archived", updatedAt: new Date().toISOString() })
    .where(eq(places.id, place.id));

  revalidatePath(`/lugares/${place.slug}`);
  revalidatePlaceLists();
  redirect("/");
}

export async function unarchivePlace(id: string): Promise<FormState> {
  const { user } = await assertUser();

  const place = await db.query.places.findFirst({ where: eq(places.id, id) });
  if (!place) return { ok: false, error: NOT_FOUND };
  if (!isOwnerOrAdmin(place, user)) return { ok: false, error: NOT_OWNER_ARCHIVE };

  await db
    .update(places)
    .set({ status: "active", updatedAt: new Date().toISOString() })
    .where(eq(places.id, place.id));

  revalidatePath(`/lugares/${place.slug}`);
  revalidatePlaceLists();
  redirect(`/lugares/${place.slug}`);
}

/** "Quero ir" / "Já fui" / desmarcar. Sem redirect: é um toque na própria tela. */
export async function setMyPlaceStatus(
  placeId: string,
  status: "want" | "visited" | null,
): Promise<FormState & { status?: "want" | "visited" | null }> {
  const { user } = await assertUser();

  if (status !== null && status !== "want" && status !== "visited") {
    return { ok: false, error: "Status inválido." };
  }

  const place = await db.query.places.findFirst({
    where: eq(places.id, placeId),
    columns: { id: true, slug: true, status: true },
  });
  if (!place) return { ok: false, error: NOT_FOUND };
  if (place.status !== "active") return { ok: false, error: "Esse lugar está arquivado." };

  const now = new Date().toISOString();

  if (status === null) {
    await db
      .delete(userPlaceStatus)
      .where(and(eq(userPlaceStatus.userId, user.id), eq(userPlaceStatus.placeId, place.id)));
  } else {
    await db
      .insert(userPlaceStatus)
      .values({ userId: user.id, placeId: place.id, status, updatedAt: now })
      .onConflictDoUpdate({
        target: [userPlaceStatus.userId, userPlaceStatus.placeId],
        set: { status, updatedAt: now },
      });
  }

  revalidatePath(`/lugares/${place.slug}`);
  revalidatePlaceLists();
  return { ok: true, status };
}
