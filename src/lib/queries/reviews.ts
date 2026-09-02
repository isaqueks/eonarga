import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  categories,
  places,
  REACTION_EMOJIS,
  reviewReactions,
  reviews,
  users,
} from "@/lib/db/schema";
import { listCommentsForReviews, type CommentItem } from "@/lib/queries/comments";
import { ratingToStars } from "@/lib/ranking";

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Se quem está olhando já reagiu com esse emoji. */
  mine: boolean;
}

export interface ReviewItem {
  id: string;
  placeId: string;
  /** 2..10, como está no banco. */
  rating: number;
  /** 1,0..5,0 — o que a tela mostra. */
  stars: number;
  verdict: string;
  contentHtml: string;
  visitedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatarId: string | null };
  /** Só emojis com pelo menos uma reação, na ordem de `REACTION_EMOJIS`. */
  reactions: ReactionSummary[];
  /** Thread curta de respostas, da mais antiga pra mais nova. */
  comments: CommentItem[];
  canEdit: boolean;
  canDelete: boolean;
}

export interface MyReviewItem extends ReviewItem {
  place: { id: string; slug: string; name: string; emoji: string };
}

export interface Viewer {
  id: string;
  role: "admin" | "member";
}

const EMOJI_ORDER = new Map<string, number>(REACTION_EMOJIS.map((emoji, i) => [emoji, i]));

const reviewColumns = {
  id: reviews.id,
  placeId: reviews.placeId,
  rating: reviews.rating,
  verdict: reviews.verdict,
  contentHtml: reviews.contentHtml,
  visitedAt: reviews.visitedAt,
  createdAt: reviews.createdAt,
  updatedAt: reviews.updatedAt,
  authorId: users.id,
  authorName: users.name,
  authorAvatarId: users.avatarId,
};

type ReviewRow = {
  id: string;
  placeId: string;
  rating: number;
  verdict: string;
  contentHtml: string;
  visitedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  authorName: string;
  authorAvatarId: string | null;
};

/**
 * Reações de várias avaliações de uma vez: um `group by (review_id, emoji)` com
 * a contagem e um flag de "eu reagi" no mesmo passo. Nunca N+1.
 */
async function loadReactions(reviewIds: string[], viewerId: string) {
  if (reviewIds.length === 0) return new Map<string, ReactionSummary[]>();

  const rows = await db
    .select({
      reviewId: reviewReactions.reviewId,
      emoji: reviewReactions.emoji,
      count: sql<number>`count(*)`,
      mine: sql<number>`sum(case when ${reviewReactions.userId} = ${viewerId} then 1 else 0 end)`,
    })
    .from(reviewReactions)
    .where(inArray(reviewReactions.reviewId, reviewIds))
    .groupBy(reviewReactions.reviewId, reviewReactions.emoji);

  const byReview = new Map<string, ReactionSummary[]>();
  for (const row of rows) {
    // Emoji que saiu da lista fixa (ou nunca esteve nela) não aparece.
    if (!EMOJI_ORDER.has(row.emoji)) continue;
    const summary: ReactionSummary = {
      emoji: row.emoji,
      count: Number(row.count),
      mine: Number(row.mine) > 0,
    };
    const list = byReview.get(row.reviewId);
    if (list) list.push(summary);
    else byReview.set(row.reviewId, [summary]);
  }

  for (const list of byReview.values()) {
    list.sort((a, b) => (EMOJI_ORDER.get(a.emoji) ?? 0) - (EMOJI_ORDER.get(b.emoji) ?? 0));
  }

  return byReview;
}

function buildItem(
  row: ReviewRow,
  reactions: ReactionSummary[],
  comments: CommentItem[],
  viewer: Viewer,
): ReviewItem {
  const mine = row.authorId === viewer.id;
  return {
    id: row.id,
    placeId: row.placeId,
    rating: row.rating,
    stars: ratingToStars(row.rating),
    verdict: row.verdict,
    contentHtml: row.contentHtml,
    visitedAt: row.visitedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: { id: row.authorId, name: row.authorName, avatarId: row.authorAvatarId },
    reactions,
    comments,
    canEdit: mine,
    canDelete: mine || viewer.role === "admin",
  };
}

/** Avaliações de um lugar, da mais recentemente editada pra mais antiga. */
export async function getReviewsForPlace(placeId: string, viewer: Viewer): Promise<ReviewItem[]> {
  const rows = (await db
    .select(reviewColumns)
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .where(eq(reviews.placeId, placeId))
    .orderBy(desc(reviews.updatedAt))) as ReviewRow[];

  const ids = rows.map((r) => r.id);
  const [reactions, comments] = await Promise.all([
    loadReactions(ids, viewer.id),
    listCommentsForReviews(ids, viewer),
  ]);

  return rows.map((row) =>
    buildItem(row, reactions.get(row.id) ?? [], comments.get(row.id) ?? [], viewer),
  );
}

/**
 * As minhas avaliações desse lugar, da mais recente pra mais antiga. Pode ser mais de
 * uma: é uma por visita (docs/08 #29). Serve pra escolher a copy do CTA da ficha e o
 * aviso de "essa é outra visita" na tela de avaliar.
 */
export async function listMyReviews(placeId: string, userId: string): Promise<ReviewItem[]> {
  const rows = (await db
    .select(reviewColumns)
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .where(and(eq(reviews.placeId, placeId), eq(reviews.userId, userId)))
    // Pela criação, não pela edição: editar uma antiga não a promove a "a mais nova".
    .orderBy(desc(reviews.createdAt), desc(reviews.id))) as ReviewRow[];

  if (rows.length === 0) return [];

  const reactions = await loadReactions(
    rows.map((row) => row.id),
    userId,
  );
  // São as próprias avaliações: `canEdit`/`canDelete` não dependem do papel. As respostas
  // ficam de fora porque quem chama isso não desenha card (a thread vem pela
  // `getReviewsForPlace`, que é quem desenha).
  return rows.map((row) =>
    buildItem(row, reactions.get(row.id) ?? [], [], { id: userId, role: "member" }),
  );
}

/**
 * Uma avaliação pelo id, pra tela de editar. `canEdit` sai de quem está olhando —
 * quem chama decide o que fazer com avaliação de outra pessoa (a tela dá 404).
 */
export async function getReviewById(reviewId: string, viewer: Viewer): Promise<ReviewItem | null> {
  const rows = (await db
    .select(reviewColumns)
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .where(eq(reviews.id, reviewId))
    .limit(1)) as ReviewRow[];

  const row = rows[0];
  if (!row) return null;

  const reactions = await loadReactions([row.id], viewer.id);
  return buildItem(row, reactions.get(row.id) ?? [], [], viewer);
}

/** Avaliações de uma pessoa, com o lugar junto. Usado no perfil. */
export async function listReviewsByUser(userId: string, viewer: Viewer): Promise<MyReviewItem[]> {
  const rows = await db
    .select({
      ...reviewColumns,
      placeSlug: places.slug,
      placeName: places.name,
      // O emoji do lugar é o da categoria dele.
      placeEmoji: categories.emoji,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .innerJoin(places, eq(places.id, reviews.placeId))
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .where(eq(reviews.userId, userId))
    .orderBy(desc(reviews.updatedAt));

  const ids = rows.map((r) => r.id);
  const [reactions, comments] = await Promise.all([
    loadReactions(ids, viewer.id),
    listCommentsForReviews(ids, viewer),
  ]);

  return rows.map((row) => ({
    ...buildItem(row as ReviewRow, reactions.get(row.id) ?? [], comments.get(row.id) ?? [], viewer),
    place: {
      id: row.placeId,
      slug: row.placeSlug,
      name: row.placeName,
      emoji: row.placeEmoji,
    },
  }));
}
