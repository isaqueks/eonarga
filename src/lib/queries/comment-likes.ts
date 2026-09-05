import { inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { postCommentLikes, reviewCommentLikes } from "@/lib/db/schema";

/** Quantas curtidas um comentário tem e se quem está olhando é uma delas. */
export interface LikeSummary {
  count: number;
  mine: boolean;
}

/** As duas tabelas de curtida têm as mesmas colunas: a de respostas e a de comentários de post. */
export type CommentLikesTable = typeof postCommentLikes | typeof reviewCommentLikes;

/**
 * Curtidas de vários comentários numa query só: total por comentário e se `viewerId`
 * curtiu. Comentário sem curtida não aparece no mapa (quem chama assume zero).
 */
export async function loadCommentLikes(
  table: CommentLikesTable,
  commentIds: string[],
  viewerId: string | null,
): Promise<Map<string, LikeSummary>> {
  const out = new Map<string, LikeSummary>();
  if (commentIds.length === 0) return out;

  const rows = await db
    .select({
      commentId: table.commentId,
      count: sql<number>`count(*)`,
      mine:
        viewerId === null
          ? sql<number>`0`
          : sql<number>`sum(case when ${table.userId} = ${viewerId} then 1 else 0 end)`,
    })
    .from(table)
    .where(inArray(table.commentId, commentIds))
    .groupBy(table.commentId);

  for (const row of rows) {
    out.set(row.commentId, { count: Number(row.count), mine: Number(row.mine) > 0 });
  }
  return out;
}
