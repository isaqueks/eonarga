import { asc, desc, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { categories, places, posts, users } from "@/lib/db/schema";
import type { PersonRef } from "@/lib/queries/places";

export interface PostPhoto {
  id: string;
  /** Variante grande (até 1600 px). */
  url: string;
  /** Quadrada, 400 px. */
  thumbUrl: string;
  width: number;
  height: number;
}

/** O lugar cadastrado de onde o post saiu, quando foi de um. */
export interface PostPlaceRef {
  id: string;
  slug: string;
  name: string;
  /** Emoji da categoria do lugar. */
  emoji: string;
}

export interface PostItem {
  id: string;
  body: string | null;
  photo: PostPhoto | null;
  place: PostPlaceRef | null;
  lat: number;
  lng: number;
  address: string | null;
  author: PersonRef;
  createdAt: string;
  /** Autor do post ou admin (docs/05). */
  canDelete: boolean;
}

export interface PostViewer {
  id: string;
  role: "admin" | "member";
}

export const POSTS_DEFAULT_LIMIT = 30;
const POSTS_MAX_LIMIT = 200;

export interface ListPostsOptions {
  limit?: number;
  /** Cursor ISO: só posts mais antigos que isso. */
  before?: string;
}

/**
 * Uma query só, com join em users e left join em places/categories — o card do feed
 * precisa de tudo isso e nada mais. Sem N+1.
 *
 * Post de lugar arquivado continua aparecendo: o post é da pessoa, não do lugar (o
 * `place_id` só vira null se o lugar for apagado de verdade).
 */
const columns = {
  id: posts.id,
  body: posts.body,
  photoId: posts.photoId,
  photoWidth: posts.photoWidth,
  photoHeight: posts.photoHeight,
  lat: posts.lat,
  lng: posts.lng,
  address: posts.address,
  createdAt: posts.createdAt,
  placeId: places.id,
  placeSlug: places.slug,
  placeName: places.name,
  placeEmoji: categories.emoji,
  authorId: users.id,
  authorName: users.name,
  authorAvatarId: users.avatarId,
};

type PostRow = {
  id: string;
  body: string | null;
  photoId: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  lat: number;
  lng: number;
  address: string | null;
  createdAt: string;
  placeId: string | null;
  placeSlug: string | null;
  placeName: string | null;
  placeEmoji: string | null;
  authorId: string;
  authorName: string;
  authorAvatarId: string | null;
};

function toItem(row: PostRow, viewer: PostViewer | null): PostItem {
  return {
    id: row.id,
    body: row.body,
    photo: row.photoId
      ? {
          id: row.photoId,
          url: `/api/uploads/${row.photoId}`,
          thumbUrl: `/api/uploads/${row.photoId}?v=thumb`,
          width: row.photoWidth ?? 0,
          height: row.photoHeight ?? 0,
        }
      : null,
    place:
      row.placeId && row.placeSlug && row.placeName
        ? {
            id: row.placeId,
            slug: row.placeSlug,
            name: row.placeName,
            emoji: row.placeEmoji ?? "📍",
          }
        : null,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    author: { id: row.authorId, name: row.authorName, avatarId: row.authorAvatarId },
    createdAt: row.createdAt,
    canDelete: viewer !== null && (viewer.role === "admin" || viewer.id === row.authorId),
  };
}

/** Posts do grupo, do mais novo pro mais velho. */
export async function listPosts(
  viewer: PostViewer | null,
  opts: ListPostsOptions = {},
): Promise<PostItem[]> {
  const limit = Math.min(
    Math.max(Math.trunc(opts.limit ?? POSTS_DEFAULT_LIMIT), 1),
    POSTS_MAX_LIMIT,
  );
  const before = opts.before?.trim() || undefined;

  const rows = (await db
    .select(columns)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .leftJoin(places, eq(places.id, posts.placeId))
    .leftJoin(categories, eq(categories.id, places.categoryId))
    .where(before ? lt(posts.createdAt, before) : undefined)
    // Dois posts no mesmo milissegundo empatam no createdAt; o id desempata.
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit)) as PostRow[];

  return rows.map((row) => toItem(row, viewer));
}

/** Um post pelo id (usado pelo delete e por quem precisa conferir permissão). */
export async function getPost(id: string, viewer: PostViewer | null): Promise<PostItem | null> {
  if (typeof id !== "string" || id === "") return null;

  const rows = (await db
    .select(columns)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .leftJoin(places, eq(places.id, posts.placeId))
    .leftJoin(categories, eq(categories.id, places.categoryId))
    .where(eq(posts.id, id))
    .limit(1)) as PostRow[];

  const row = rows[0];
  return row ? toItem(row, viewer) : null;
}

/** O que a tela de postar precisa saber de cada lugar ativo pra lista e pro "você tá no X?". */
export interface PostPlaceOption {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  address: string | null;
}

/** Lugares ativos em ordem alfabética. O cliente reordena por distância quando tem GPS. */
export async function listPostPlaceOptions(): Promise<PostPlaceOption[]> {
  return db
    .select({
      id: places.id,
      slug: places.slug,
      name: places.name,
      emoji: categories.emoji,
      lat: places.lat,
      lng: places.lng,
      address: places.address,
    })
    .from(places)
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .where(eq(places.status, "active"))
    .orderBy(asc(places.name));
}
