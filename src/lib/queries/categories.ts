import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { categories, places, type Category } from "@/lib/db/schema";

export type { Category };

/** Todas as categorias, na ordem que o admin definiu. */
export async function listCategories(): Promise<Category[]> {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

export type CategoryWithCount = Category & { placeCount: number };

/**
 * Categorias com o nº de lugares vinculados (inclusive arquivados — o que importa
 * pro admin é se dá pra excluir). Um LEFT JOIN só, sem N+1.
 */
export async function listCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      emoji: categories.emoji,
      color: categories.color,
      sortOrder: categories.sortOrder,
      placeCount: sql<number>`count(${places.id})`,
    })
    .from(categories)
    .leftJoin(places, eq(places.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return rows.map((r) => ({ ...r, placeCount: Number(r.placeCount) }));
}
