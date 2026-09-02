import { and, asc, desc, eq, exists, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { categories, placeTags, places, reviews, userPlaceStatus, users } from "@/lib/db/schema";
import { isApprovedByNarga } from "@/lib/ranking";
import { normalizeTag } from "@/lib/tags";

export interface PersonRef {
  id: string;
  name: string;
  avatarId: string | null;
}

export interface PlaceCategoryRef {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  color: string;
}

export interface PlaceListItem {
  id: string;
  slug: string;
  name: string;
  category: PlaceCategoryRef;
  lat: number;
  lng: number;
  address: string | null;
  hasNarga: "yes" | "no" | "unknown";
  priceLevel: number | null;
  status: "active" | "archived";
  /** Nº de avaliações. */
  reviewCount: number;
  /** Média em estrelas (1,0..5,0), ou null se ninguém avaliou. */
  meanStars: number | null;
  /** Selo "Aprovado pelo narga". */
  approved: boolean;
  wantUsers: PersonRef[];
  visitedUsers: PersonRef[];
  myStatus: "want" | "visited" | null;
  lastReviewAt: string | null;
  /** Veredito da avaliação editada mais recentemente (a citação do card). */
  latestVerdict: string | null;
  /** Quem escreveu esse veredito. */
  latestVerdictAuthor: string | null;
  /** Tags livres do lugar, em ordem alfabética. */
  tags: string[];
}

export interface PlaceDetail extends PlaceListItem {
  description: string | null;
  tips: string | null;
  instagram: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  googlePlaceId: string | null;
  createdBy: PersonRef;
  createdAt: string;
  updatedAt: string;
}

/** Agregados de avaliação por lugar: n, soma das estrelas e a mais recente. */
const reviewAgg = db
  .select({
    placeId: reviews.placeId,
    reviewCount: sql<number>`count(*)`.as("review_count"),
    // rating é 2..10 (meios pontos); estrelas = rating / 2
    sumStars: sql<number>`sum(${reviews.rating}) / 2.0`.as("sum_stars"),
    lastReviewAt: sql<string | null>`max(${reviews.createdAt})`.as("last_review_at"),
  })
  .from(reviews)
  .groupBy(reviews.placeId)
  .as("review_agg");

/**
 * Avaliação mais recente de cada lugar, numerada por `updated_at` desc (empate
 * desempatado pelo id, pra ser determinístico). Uma janela em vez de N queries.
 */
const latestReviewRanked = db
  .select({
    placeId: reviews.placeId,
    verdict: reviews.verdict,
    authorName: users.name,
    rn: sql<number>`row_number() over (partition by ${reviews.placeId} order by ${reviews.updatedAt} desc, ${reviews.id} desc)`.as(
      "rn",
    ),
  })
  .from(reviews)
  .innerJoin(users, eq(users.id, reviews.userId))
  .as("latest_review_ranked");

const latestReview = db
  .select({
    placeId: latestReviewRanked.placeId,
    verdict: latestReviewRanked.verdict,
    authorName: latestReviewRanked.authorName,
  })
  .from(latestReviewRanked)
  .where(eq(latestReviewRanked.rn, 1))
  .as("latest_review");

const placeColumns = {
  id: places.id,
  slug: places.slug,
  name: places.name,
  lat: places.lat,
  lng: places.lng,
  address: places.address,
  hasNarga: places.hasNarga,
  priceLevel: places.priceLevel,
  status: places.status,
  categoryId: categories.id,
  categorySlug: categories.slug,
  categoryName: categories.name,
  categoryEmoji: categories.emoji,
  categoryColor: categories.color,
  reviewCount: reviewAgg.reviewCount,
  sumStars: reviewAgg.sumStars,
  lastReviewAt: reviewAgg.lastReviewAt,
  latestVerdict: latestReview.verdict,
  latestVerdictAuthor: latestReview.authorName,
};

type PlaceRow = {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  hasNarga: "yes" | "no" | "unknown";
  priceLevel: number | null;
  status: "active" | "archived";
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  categoryEmoji: string;
  categoryColor: string;
  reviewCount: number | null;
  sumStars: number | null;
  lastReviewAt: string | null;
  latestVerdict: string | null;
  latestVerdictAuthor: string | null;
};

/** Quem marcou "quero ir" / "já fui", com o nome da pessoa. Uma query pra todos os lugares. */
async function loadStatuses(placeIds: string[]) {
  if (placeIds.length === 0) return [];
  return db
    .select({
      placeId: userPlaceStatus.placeId,
      status: userPlaceStatus.status,
      userId: users.id,
      userName: users.name,
      userAvatarId: users.avatarId,
    })
    .from(userPlaceStatus)
    .innerJoin(users, eq(users.id, userPlaceStatus.userId))
    .where(inArray(userPlaceStatus.placeId, placeIds))
    .orderBy(asc(users.name));
}

type StatusRow = Awaited<ReturnType<typeof loadStatuses>>[number];

/** Tags de vários lugares numa query só, já em ordem alfabética. */
async function loadTags(placeIds: string[]): Promise<Map<string, string[]>> {
  const byPlace = new Map<string, string[]>();
  if (placeIds.length === 0) return byPlace;

  const rows = await db
    .select({ placeId: placeTags.placeId, tag: placeTags.tag })
    .from(placeTags)
    .where(inArray(placeTags.placeId, placeIds))
    .orderBy(asc(placeTags.tag));

  for (const row of rows) {
    const list = byPlace.get(row.placeId);
    if (list) list.push(row.tag);
    else byPlace.set(row.placeId, [row.tag]);
  }
  return byPlace;
}

function buildItem(
  row: PlaceRow,
  statuses: StatusRow[],
  tags: string[],
  userId: string,
): PlaceListItem {
  const reviewCount = Number(row.reviewCount ?? 0);
  const meanStars = reviewCount > 0 ? Number(row.sumStars ?? 0) / reviewCount : null;

  const wantUsers: PersonRef[] = [];
  const visitedUsers: PersonRef[] = [];
  let myStatus: "want" | "visited" | null = null;

  for (const s of statuses) {
    const person: PersonRef = { id: s.userId, name: s.userName, avatarId: s.userAvatarId };
    if (s.status === "want") wantUsers.push(person);
    else visitedUsers.push(person);
    if (s.userId === userId) myStatus = s.status;
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: {
      id: row.categoryId,
      slug: row.categorySlug,
      name: row.categoryName,
      emoji: row.categoryEmoji,
      color: row.categoryColor,
    },
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    hasNarga: row.hasNarga,
    priceLevel: row.priceLevel,
    status: row.status,
    reviewCount,
    meanStars,
    approved: meanStars !== null && isApprovedByNarga(meanStars, reviewCount),
    wantUsers,
    visitedUsers,
    myStatus,
    lastReviewAt: row.lastReviewAt,
    latestVerdict: row.latestVerdict,
    latestVerdictAuthor: row.latestVerdictAuthor,
    tags,
  };
}

export interface ListPlacesOptions {
  /** Pra resolver o `myStatus` de cada lugar. */
  userId: string;
  categorySlug?: string;
  /** Só lugares com essa tag (já normalizada ou não — a função normaliza). */
  tag?: string;
  includeArchived?: boolean;
}

/**
 * Lista de lugares pro ranking, mapa e Rolê. Três queries fixas (lugares + agregados,
 * statuses com nome) montadas em memória — nunca N+1.
 */
export async function listPlaces(opts: ListPlacesOptions): Promise<PlaceListItem[]> {
  const filters = [];
  if (!opts.includeArchived) filters.push(eq(places.status, "active"));
  if (opts.categorySlug) filters.push(eq(categories.slug, opts.categorySlug));

  if (opts.tag !== undefined) {
    const tag = normalizeTag(opts.tag);
    // Tag que nem existiria no banco: lista vazia, sem ir ao banco.
    if (tag === null) return [];
    filters.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(placeTags)
          .where(and(eq(placeTags.placeId, places.id), eq(placeTags.tag, tag))),
      ),
    );
  }

  const rows = (await db
    .select(placeColumns)
    .from(places)
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .leftJoin(reviewAgg, eq(reviewAgg.placeId, places.id))
    .leftJoin(latestReview, eq(latestReview.placeId, places.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(categories.sortOrder), asc(places.name))) as PlaceRow[];

  const ids = rows.map((r) => r.id);
  const [statuses, tags] = await Promise.all([loadStatuses(ids), loadTags(ids)]);
  const byPlace = new Map<string, StatusRow[]>();
  for (const s of statuses) {
    const list = byPlace.get(s.placeId);
    if (list) list.push(s);
    else byPlace.set(s.placeId, [s]);
  }

  return rows.map((row) =>
    buildItem(row, byPlace.get(row.id) ?? [], tags.get(row.id) ?? [], opts.userId),
  );
}

/** Ficha completa. Devolve também os arquivados (a tela mostra a faixa "Arquivado"). */
export async function getPlaceBySlug(slug: string, userId: string): Promise<PlaceDetail | null> {
  const rows = await db
    .select({
      ...placeColumns,
      description: places.description,
      tips: places.tips,
      instagram: places.instagram,
      website: places.website,
      googleMapsUrl: places.googleMapsUrl,
      googlePlaceId: places.googlePlaceId,
      createdAt: places.createdAt,
      updatedAt: places.updatedAt,
      creatorId: users.id,
      creatorName: users.name,
      creatorAvatarId: users.avatarId,
    })
    .from(places)
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .innerJoin(users, eq(users.id, places.createdBy))
    .leftJoin(reviewAgg, eq(reviewAgg.placeId, places.id))
    .leftJoin(latestReview, eq(latestReview.placeId, places.id))
    .where(eq(places.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [statuses, tags] = await Promise.all([loadStatuses([row.id]), loadTags([row.id])]);

  return {
    ...buildItem(row as PlaceRow, statuses, tags.get(row.id) ?? [], userId),
    description: row.description,
    tips: row.tips,
    instagram: row.instagram,
    website: row.website,
    googleMapsUrl: row.googleMapsUrl,
    googlePlaceId: row.googlePlaceId,
    createdBy: { id: row.creatorId, name: row.creatorName, avatarId: row.creatorAvatarId },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Soma e contagem de todas as avaliações de lugares ativos. É o `m` da média bayesiana:
 * global de propósito, pra que rankings filtrados por categoria continuem comparáveis
 * (ver docs/03-modelo-de-dados.md#ranking).
 */
export async function getGlobalRatingStats(): Promise<{ totalStars: number; totalCount: number }> {
  const rows = await db
    .select({
      totalStars: sql<number | null>`sum(${reviews.rating}) / 2.0`,
      totalCount: sql<number>`count(*)`,
    })
    .from(reviews)
    .innerJoin(places, eq(places.id, reviews.placeId))
    .where(eq(places.status, "active"));

  const row = rows[0];
  return {
    totalStars: Number(row?.totalStars ?? 0),
    totalCount: Number(row?.totalCount ?? 0),
  };
}

/** Lugares criados por alguém (usado no perfil, quando chegar a hora). */
export async function listPlacesCreatedBy(userId: string): Promise<PlaceListItem[]> {
  const rows = (await db
    .select(placeColumns)
    .from(places)
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .leftJoin(reviewAgg, eq(reviewAgg.placeId, places.id))
    .leftJoin(latestReview, eq(latestReview.placeId, places.id))
    .where(eq(places.createdBy, userId))
    .orderBy(desc(places.createdAt))) as PlaceRow[];

  const ids = rows.map((r) => r.id);
  const [statuses, tags] = await Promise.all([loadStatuses(ids), loadTags(ids)]);
  const byPlace = new Map<string, StatusRow[]>();
  for (const s of statuses) {
    const list = byPlace.get(s.placeId);
    if (list) list.push(s);
    else byPlace.set(s.placeId, [s]);
  }

  return rows.map((row) =>
    buildItem(row, byPlace.get(row.id) ?? [], tags.get(row.id) ?? [], userId),
  );
}

/**
 * Tags mais usadas, da mais popular pra menos. Só conta lugar ativo — tag que só
 * sobrou em arquivado não deve aparecer no filtro do ranking.
 */
export async function listTagsWithCounts(): Promise<{ tag: string; count: number }[]> {
  const rows = await db
    .select({ tag: placeTags.tag, count: sql<number>`count(*)` })
    .from(placeTags)
    .innerJoin(places, eq(places.id, placeTags.placeId))
    .where(eq(places.status, "active"))
    .groupBy(placeTags.tag)
    .orderBy(desc(sql`count(*)`), asc(placeTags.tag));

  return rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}
