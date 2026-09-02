import { and, desc, eq, lt, type Column } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db/client";
import {
  categories,
  notifications,
  places,
  reviewReactions,
  reviews,
  userPlaceStatus,
  users,
} from "@/lib/db/schema";
import type { PersonRef } from "@/lib/queries/places";
import { ratingToStars } from "@/lib/ranking";

export interface FeedPlaceRef {
  slug: string;
  name: string;
  /** Emoji da categoria do lugar. */
  emoji: string;
}

export type FeedEvent =
  | {
      kind: "review";
      at: string;
      user: PersonRef;
      place: FeedPlaceRef;
      /** 1,0..5,0. */
      stars: number;
      verdict: string;
      reviewId: string;
    }
  | { kind: "place"; at: string; user: PersonRef; place: FeedPlaceRef }
  | { kind: "status"; at: string; user: PersonRef; place: FeedPlaceRef; status: "want" | "visited" }
  | {
      kind: "reaction";
      at: string;
      user: PersonRef;
      place: FeedPlaceRef;
      emoji: string;
      /** Nome de quem escreveu a avaliação que levou a reação. */
      reviewAuthor: string;
    }
  /** "Chamar galera pra cá" (src/actions/push.ts): fica no feed mesmo pra quem não usa push. */
  | { kind: "call"; at: string; user: PersonRef; place: FeedPlaceRef };

export const FEED_DEFAULT_LIMIT = 50;
const FEED_MAX_LIMIT = 200;

export interface ListFeedOptions {
  limit?: number;
  /** Cursor ISO: só eventos mais antigos que isso ("carregar mais"). */
  before?: string;
}

/** Chave estável pro React e pra desempatar a ordenação. */
export function feedEventKey(event: FeedEvent): string {
  switch (event.kind) {
    case "review":
      return `review:${event.reviewId}`;
    case "place":
      return `place:${event.place.slug}:${event.user.id}`;
    case "status":
      return `status:${event.user.id}:${event.place.slug}`;
    case "reaction":
      return `reaction:${event.user.id}:${event.place.slug}:${event.emoji}`;
    // A mesma pessoa chama o mesmo lugar mais de uma vez (em dias diferentes): entra a hora.
    case "call":
      return `call:${event.user.id}:${event.place.slug}:${event.at}`;
  }
}

const person = {
  id: users.id,
  name: users.name,
  avatarId: users.avatarId,
};

const placeRef = {
  placeSlug: places.slug,
  placeName: places.name,
  placeEmoji: categories.emoji,
};

type PlaceRefRow = { placeSlug: string; placeName: string; placeEmoji: string };
type PersonRow = { id: string; name: string; avatarId: string | null };

function toPlace(row: PlaceRefRow): FeedPlaceRef {
  return { slug: row.placeSlug, name: row.placeName, emoji: row.placeEmoji };
}

function toPerson(row: PersonRow): PersonRef {
  return { id: row.id, name: row.name, avatarId: row.avatarId };
}

/**
 * Novidades do grupo: avaliação, lugar novo, "quero ir"/"já fui", reação e chamada.
 *
 * São cinco queries independentes (uma por tipo), cada uma já limitada e
 * ordenada no banco; o merge é em memória. Uma UNION daria a mesma coisa com
 * colunas que só existem pra um dos tipos — não compensa.
 *
 * Só lugar ativo aparece: o que foi arquivado sumiu do app, não faz sentido
 * ressuscitar no feed.
 */
export async function listFeed(opts: ListFeedOptions = {}): Promise<FeedEvent[]> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? FEED_DEFAULT_LIMIT), 1), FEED_MAX_LIMIT);
  const before = opts.before?.trim() || undefined;

  // Cursor estrito: dois eventos no mesmo milissegundo exato são raros, e o
  // alternativo seria carregar um cursor composto na URL.
  const olderThan = (column: Column) => (before ? lt(column, before) : undefined);

  const reactor = alias(users, "reactor");
  const reviewAuthor = alias(users, "review_author");

  const [reviewRows, placeRows, statusRows, reactionRows, callRows] = await Promise.all([
    db
      .select({
        ...person,
        ...placeRef,
        at: reviews.createdAt,
        reviewId: reviews.id,
        rating: reviews.rating,
        verdict: reviews.verdict,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .innerJoin(places, eq(places.id, reviews.placeId))
      .innerJoin(categories, eq(categories.id, places.categoryId))
      .where(and(eq(places.status, "active"), olderThan(reviews.createdAt)))
      .orderBy(desc(reviews.createdAt))
      .limit(limit),

    db
      .select({ ...person, ...placeRef, at: places.createdAt })
      .from(places)
      .innerJoin(users, eq(users.id, places.createdBy))
      .innerJoin(categories, eq(categories.id, places.categoryId))
      .where(and(eq(places.status, "active"), olderThan(places.createdAt)))
      .orderBy(desc(places.createdAt))
      .limit(limit),

    db
      .select({
        ...person,
        ...placeRef,
        at: userPlaceStatus.updatedAt,
        status: userPlaceStatus.status,
      })
      .from(userPlaceStatus)
      .innerJoin(users, eq(users.id, userPlaceStatus.userId))
      .innerJoin(places, eq(places.id, userPlaceStatus.placeId))
      .innerJoin(categories, eq(categories.id, places.categoryId))
      .where(and(eq(places.status, "active"), olderThan(userPlaceStatus.updatedAt)))
      .orderBy(desc(userPlaceStatus.updatedAt))
      .limit(limit),

    db
      .select({
        id: reactor.id,
        name: reactor.name,
        avatarId: reactor.avatarId,
        ...placeRef,
        at: reviewReactions.createdAt,
        emoji: reviewReactions.emoji,
        authorName: reviewAuthor.name,
      })
      .from(reviewReactions)
      .innerJoin(reactor, eq(reactor.id, reviewReactions.userId))
      .innerJoin(reviews, eq(reviews.id, reviewReactions.reviewId))
      .innerJoin(reviewAuthor, eq(reviewAuthor.id, reviews.userId))
      .innerJoin(places, eq(places.id, reviews.placeId))
      .innerJoin(categories, eq(categories.id, places.categoryId))
      .where(and(eq(places.status, "active"), olderThan(reviewReactions.createdAt)))
      .orderBy(desc(reviewReactions.createdAt))
      .limit(limit),

    // Aviso do admin (`kind = "admin"`) não é novidade do grupo e fica de fora; o
    // innerJoin com places já derruba as linhas sem lugar.
    db
      .select({ ...person, ...placeRef, at: notifications.createdAt })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.createdBy))
      .innerJoin(places, eq(places.id, notifications.placeId))
      .innerJoin(categories, eq(categories.id, places.categoryId))
      .where(
        and(
          eq(notifications.kind, "call"),
          eq(places.status, "active"),
          olderThan(notifications.createdAt),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
  ]);

  const events: FeedEvent[] = [
    ...reviewRows.map((row): FeedEvent => ({
      kind: "review",
      at: row.at,
      user: toPerson(row),
      place: toPlace(row),
      stars: ratingToStars(row.rating),
      verdict: row.verdict,
      reviewId: row.reviewId,
    })),
    ...placeRows.map((row): FeedEvent => ({
      kind: "place",
      at: row.at,
      user: toPerson(row),
      place: toPlace(row),
    })),
    ...statusRows.map((row): FeedEvent => ({
      kind: "status",
      at: row.at,
      user: toPerson(row),
      place: toPlace(row),
      status: row.status,
    })),
    ...reactionRows.map((row): FeedEvent => ({
      kind: "reaction",
      at: row.at,
      user: toPerson(row),
      place: toPlace(row),
      emoji: row.emoji,
      reviewAuthor: row.authorName,
    })),
    ...callRows.map((row): FeedEvent => ({
      kind: "call",
      at: row.at,
      user: toPerson(row),
      place: toPlace(row),
    })),
  ];

  events.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    // Empate no milissegundo: qualquer ordem serve, desde que seja sempre a mesma.
    return feedEventKey(a).localeCompare(feedEventKey(b));
  });

  return events.slice(0, limit);
}
