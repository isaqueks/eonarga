import { NextResponse } from "next/server";

import { getApiUser, unauthorized } from "@/lib/api-auth";
import { todayISODate } from "@/lib/dates";
import { db } from "@/lib/db/client";
import {
  categories,
  photos,
  places,
  placeTags,
  reviewComments,
  reviewReactions,
  reviews,
  userPlaceStatus,
  users,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Versão do formato do backup. Sobe quando o shape mudar de um jeito incompatível. */
const EXPORT_VERSION = 2;

/**
 * Backup do banco inteiro em JSON, pra admin (docs/01 — "Exportar/importar").
 * `password_hash` fica de fora: backup é arquivo que anda por aí, e hash de senha
 * não precisa andar junto. As sessões também não vão — não faz sentido restaurar.
 * As fotos em si (arquivos) não entram: são o volume `data/uploads`.
 */
export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Só admin baixa o backup." }, { status: 403 });
  }

  const [
    userRows,
    categoryRows,
    placeRows,
    reviewRows,
    statusRows,
    reactionRows,
    photoRows,
    tagRows,
    commentRows,
  ] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        lastLoginAt: users.lastLoginAt,
        avatarId: users.avatarId,
        gender: users.gender,
        testosterone: users.testosterone,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users),
    db.select().from(categories),
    db.select().from(places),
    db.select().from(reviews),
    db.select().from(userPlaceStatus),
    db.select().from(reviewReactions),
    db.select().from(photos),
    db.select().from(placeTags),
    db.select().from(reviewComments),
  ]);

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: EXPORT_VERSION,
      users: userRows,
      categories: categoryRows,
      places: placeRows,
      reviews: reviewRows,
      userPlaceStatus: statusRows,
      reviewReactions: reactionRows,
      photos: photoRows,
      placeTags: tagRows,
      reviewComments: commentRows,
    },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="eonarga-${todayISODate()}.json"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
