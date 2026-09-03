"use server";

import { eq, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

import { field, type ImportReport, type ImportState } from "@/actions/form-state";
import { assertAdmin } from "@/lib/auth/guards";
import { parseTakeoutCsv } from "@/lib/csv";
import { db } from "@/lib/db/client";
import { categories, places } from "@/lib/db/schema";
import { isAllowedMapsUrl, resolveGoogleMapsLink, type ParsedMapsLink } from "@/lib/maps-link";
import { slugify } from "@/lib/slug";

/** Cada link vira uma ida ao Google; mais que isso de uma vez é pedir timeout. */
const MAX_LINES = 100;
/** CSV do Takeout de uma lista é uns poucos KB. */
const MAX_CSV_BYTES = 512 * 1024;
/** No máximo 2 resoluções ao mesmo tempo, 300 ms entre uma chamada e a próxima. */
const CONCURRENCY = 2;
const GAP_MS = 300;
/** Mesmo nome a menos de 30 m já é o mesmo lugar com o pino tremido. */
const SAME_PLACE_METERS = 30;
const NAME_MAX = 80;

const NOT_MAPS = "Não é link do Google Maps.";
const UNREADABLE = "Não consegui ler esse link.";
const NO_URL = "Essa linha não tem link.";

interface Entry {
  /** O que aparece no relatório quando dá errado. */
  line: string;
  url: string;
  /** Nome vindo do CSV, quando tem. */
  name: string | null;
}

interface ExistingPlace {
  name: string;
  lat: number;
  lng: number;
  googleMapsUrl: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Equiretangular: pra 30 m em Floripa a diferença pro haversine é irrelevante. */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng) * Math.cos(toRad((aLat + bLat) / 2));
  return Math.hypot(dLat, dLng) * 6_371_000;
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
  return `${base}-${nanoid(6).toLowerCase()}`;
}

/** Linhas do textarea: uma URL por linha, sem vazias nem repetidas. */
function entriesFromLinks(raw: string): Entry[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ line, url: line, name: null }));
}

function entriesFromCsv(text: string): { entries: Entry[]; failed: ImportReport["failed"] } {
  const entries: Entry[] = [];
  const failed: ImportReport["failed"] = [];

  for (const row of parseTakeoutCsv(text)) {
    const line = row.title ?? row.url ?? "(linha vazia)";
    if (!row.url) failed.push({ line, reason: NO_URL });
    else entries.push({ line, url: row.url, name: row.title });
  }

  return { entries, failed };
}

/**
 * Resolve os links com no máximo `CONCURRENCY` em voo e `GAP_MS` entre o início
 * de uma chamada e o da próxima — o Google não gosta de rajada.
 */
async function resolveAll(entries: Entry[]): Promise<(ParsedMapsLink | null)[]> {
  const results: (ParsedMapsLink | null)[] = new Array(entries.length).fill(null);
  let next = 0;
  let slot = 0;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= entries.length) return;

      const now = Date.now();
      const at = Math.max(now, slot);
      slot = at + GAP_MS;
      if (at > now) await sleep(at - now);

      results[index] = await resolveGoogleMapsLink(entries[index].url);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function isDuplicate(candidate: ExistingPlace, existing: ExistingPlace[]): boolean {
  // Comparar nomes pelo slug já resolve acento, caixa e pontuação.
  const key = slugify(candidate.name);
  return existing.some((place) => {
    if (candidate.googleMapsUrl && place.googleMapsUrl === candidate.googleMapsUrl) return true;
    return (
      slugify(place.name) === key &&
      distanceMeters(candidate.lat, candidate.lng, place.lat, place.lng) <= SAME_PLACE_METERS
    );
  });
}

/**
 * Importa lugares em massa a partir de links do Google Maps (colados ou vindos do
 * CSV do Takeout). Só admin. Cada linha vira um lugar com `hasNarga: "unknown"` —
 * a galera completa o resto depois na ficha.
 */
export async function importPlaces(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { user } = await assertAdmin();

  const categoryId = field(formData, "categoryId").trim();
  if (!categoryId) return { ok: false, fieldErrors: { categoryId: "Escolhe uma categoria" } };

  const category = await db.query.categories.findFirst({
    where: eq(categories.id, categoryId),
    columns: { id: true },
  });
  if (!category) return { ok: false, fieldErrors: { categoryId: "Categoria não encontrada." } };

  const failed: ImportReport["failed"] = [];
  const entries: Entry[] = [];

  const csv = formData.get("csv");
  if (csv instanceof File && csv.size > 0) {
    if (csv.size > MAX_CSV_BYTES) {
      return { ok: false, fieldErrors: { csv: "Arquivo grande demais (máximo 512 KB)." } };
    }
    const parsed = entriesFromCsv(await csv.text());
    entries.push(...parsed.entries);
    failed.push(...parsed.failed);
  }

  entries.push(...entriesFromLinks(field(formData, "links")));

  if (entries.length === 0 && failed.length === 0) {
    return { ok: false, error: "Cola pelo menos um link (ou manda o CSV)." };
  }
  if (entries.length > MAX_LINES) {
    return {
      ok: false,
      error: `São ${entries.length} linhas. Manda no máximo ${MAX_LINES} por vez.`,
    };
  }

  // Descarta o que nem link do Maps é antes de gastar rede.
  const resolvable: Entry[] = [];
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry.url);
    } catch {
      failed.push({ line: entry.line, reason: NOT_MAPS });
      continue;
    }
    if (!isAllowedMapsUrl(url)) failed.push({ line: entry.line, reason: NOT_MAPS });
    else resolvable.push(entry);
  }

  const resolved = await resolveAll(resolvable);

  const existing: ExistingPlace[] = await db
    .select({
      name: places.name,
      lat: places.lat,
      lng: places.lng,
      googleMapsUrl: places.googleMapsUrl,
    })
    .from(places);

  const created: string[] = [];
  const skipped: string[] = [];

  // Sequencial de propósito: o slug único depende de quem já entrou nesta mesma rodada.
  for (let i = 0; i < resolvable.length; i++) {
    const entry = resolvable[i];
    const link = resolved[i];

    if (!link) {
      failed.push({ line: entry.line, reason: UNREADABLE });
      continue;
    }

    const name = (entry.name ?? link.name ?? entry.line).trim().slice(0, NAME_MAX) || "Sem nome";
    const candidate: ExistingPlace = {
      name,
      lat: link.lat,
      lng: link.lng,
      googleMapsUrl: link.canonicalUrl,
    };

    if (isDuplicate(candidate, existing)) {
      skipped.push(name);
      continue;
    }

    try {
      await db.insert(places).values({
        id: nanoid(12),
        slug: await nextFreeSlug(slugify(name)),
        name,
        categoryId,
        lat: link.lat,
        lng: link.lng,
        googleMapsUrl: link.canonicalUrl,
        googlePlaceId: link.placeId,
        hasNarga: "unknown",
        status: "active",
        createdBy: user.id,
      });
      existing.push(candidate);
      created.push(name);
    } catch {
      failed.push({ line: entry.line, reason: "Não deu pra salvar esse." });
    }
  }

  if (created.length > 0) {
    revalidatePath("/ranking");
    revalidatePath("/mapa");
  }

  return { ok: true, report: { created, skipped, failed } };
}
