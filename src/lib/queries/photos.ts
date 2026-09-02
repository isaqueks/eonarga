import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { photos, users } from "@/lib/db/schema";

/**
 * Teto de fotos por lugar. Não é regra de produto: é pra ninguém entupir o disco do VPS
 * com 400 fotos do mesmo prato.
 */
export const MAX_PHOTOS_PER_PLACE = 30;

export interface PhotoItem {
  id: string;
  /** Variante grande. */
  url: string;
  /** Quadrada, 400 px — é o que a grade carrega. */
  thumbUrl: string;
  width: number;
  height: number;
  uploadedBy: { id: string; name: string; avatarId: string | null };
  /** Foto tirada dentro de uma avaliação, quando for o caso. Hoje sempre `null`. */
  reviewId: string | null;
  createdAt: string;
  /** Dono da foto ou admin (docs/05). */
  canDelete: boolean;
}

export interface PhotoViewer {
  id: string;
  role: "admin" | "member";
}

/**
 * Fotos do lugar, da mais nova pra mais velha.
 *
 * `viewer` é `null` na página pública (`/p/[slug]`): ninguém de fora apaga nada, e as
 * URLs de lá são reescritas pra rota com token — o `url`/`thumbUrl` daqui apontam pra
 * `/api/uploads`, que exige sessão.
 */
export async function listPhotosForPlace(
  placeId: string,
  viewer: PhotoViewer | null,
): Promise<PhotoItem[]> {
  const rows = await db
    .select({
      id: photos.id,
      reviewId: photos.reviewId,
      width: photos.width,
      height: photos.height,
      createdAt: photos.createdAt,
      userId: users.id,
      userName: users.name,
      userAvatarId: users.avatarId,
    })
    .from(photos)
    .innerJoin(users, eq(users.id, photos.uploadedBy))
    .where(eq(photos.placeId, placeId))
    // Duas fotos mandadas no mesmo milissegundo empatam no createdAt; o id desempata.
    .orderBy(desc(photos.createdAt), desc(photos.id));

  return rows.map((row) => ({
    id: row.id,
    url: `/api/uploads/${row.id}`,
    thumbUrl: `/api/uploads/${row.id}?v=thumb`,
    width: row.width,
    height: row.height,
    uploadedBy: { id: row.userId, name: row.userName, avatarId: row.userAvatarId },
    reviewId: row.reviewId,
    createdAt: row.createdAt,
    canDelete: viewer !== null && (viewer.role === "admin" || viewer.id === row.userId),
  }));
}

/** Só a contagem — usado pelo limite do upload, que não precisa carregar a lista toda. */
export async function countPhotosForPlace(placeId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)` })
    .from(photos)
    .where(eq(photos.placeId, placeId));
  return Number(rows[0]?.total ?? 0);
}
