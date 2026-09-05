import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { reviewCommentLikes, reviewComments, reviews, users } from "@/lib/db/schema";
import { loadCommentLikes } from "@/lib/queries/comment-likes";
import type { Viewer } from "@/lib/queries/reviews";

export interface CommentItem {
  id: string;
  reviewId: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatarId: string | null };
  /** Autor da resposta, autor da avaliação ou admin (docs/05 — Permissões). */
  canDelete: boolean;
  /** Quantas curtidas e se quem olha curtiu. */
  likes: number;
  likedByMe: boolean;
}

/**
 * Respostas de várias avaliações de uma vez, em ordem cronológica. Uma query só,
 * com o autor da avaliação junto pra resolver o `canDelete` sem outra ida ao banco.
 */
export async function listCommentsForReviews(
  reviewIds: string[],
  viewer: Viewer,
): Promise<Map<string, CommentItem[]>> {
  const byReview = new Map<string, CommentItem[]>();
  if (reviewIds.length === 0) return byReview;

  const rows = await db
    .select({
      id: reviewComments.id,
      reviewId: reviewComments.reviewId,
      body: reviewComments.body,
      createdAt: reviewComments.createdAt,
      authorId: users.id,
      authorName: users.name,
      authorAvatarId: users.avatarId,
      reviewAuthorId: reviews.userId,
    })
    .from(reviewComments)
    .innerJoin(users, eq(users.id, reviewComments.userId))
    .innerJoin(reviews, eq(reviews.id, reviewComments.reviewId))
    .where(inArray(reviewComments.reviewId, reviewIds))
    // Empate no milissegundo desempatado pelo id, pra a ordem não dançar entre renders.
    .orderBy(asc(reviewComments.createdAt), asc(reviewComments.id));

  const likes = await loadCommentLikes(
    reviewCommentLikes,
    rows.map((row) => row.id),
    viewer.id,
  );

  for (const row of rows) {
    const liked = likes.get(row.id);
    const item: CommentItem = {
      id: row.id,
      reviewId: row.reviewId,
      body: row.body,
      createdAt: row.createdAt,
      author: { id: row.authorId, name: row.authorName, avatarId: row.authorAvatarId },
      canDelete:
        row.authorId === viewer.id || row.reviewAuthorId === viewer.id || viewer.role === "admin",
      likes: liked?.count ?? 0,
      likedByMe: liked?.mine ?? false,
    };
    const list = byReview.get(row.reviewId);
    if (list) list.push(item);
    else byReview.set(row.reviewId, [item]);
  }

  return byReview;
}
