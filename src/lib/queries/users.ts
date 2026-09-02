import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { places, reviews, userPlaceStatus, users } from "@/lib/db/schema";

export interface GaleraUser {
  id: string;
  name: string;
  role: "admin" | "member";
  avatarId: string | null;
  gender: string | null;
  testosterone: number | null;
  placesCreated: number;
  reviewCount: number;
  wantCount: number;
  visitedCount: number;
  /** Média das notas que a pessoa deu, em estrelas (1,0..5,0). Null se nunca avaliou. */
  avgStarsGiven: number | null;
  lastLoginAt: string | null;
  /** Último uso do app (com folga de 5 min); null pra quem nunca entrou desde a coluna existir. */
  lastSeenAt: string | null;
}

/**
 * Todo mundo que ainda entra no app, com os contadores da galera.
 * Nada aqui é privado (docs/01, docs/05): quem tem sessão vê os números de todo mundo.
 *
 * Os agregados são subqueries no próprio SELECT — uma consulta só, sem N+1.
 */
export async function listGalera(): Promise<GaleraUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      avatarId: users.avatarId,
      gender: users.gender,
      testosterone: users.testosterone,
      lastLoginAt: users.lastLoginAt,
      lastSeenAt: users.lastSeenAt,
      // Lugar arquivado não conta: o placar é do que está no ar.
      placesCreated: sql<number>`(
        select count(*) from ${places}
        where ${places.createdBy} = ${users.id} and ${places.status} = 'active'
      )`.as("places_created"),
      reviewCount: sql<number>`(
        select count(*) from ${reviews} where ${reviews.userId} = ${users.id}
      )`.as("review_count"),
      wantCount: sql<number>`(
        select count(*) from ${userPlaceStatus}
        where ${userPlaceStatus.userId} = ${users.id} and ${userPlaceStatus.status} = 'want'
      )`.as("want_count"),
      visitedCount: sql<number>`(
        select count(*) from ${userPlaceStatus}
        where ${userPlaceStatus.userId} = ${users.id} and ${userPlaceStatus.status} = 'visited'
      )`.as("visited_count"),
      // rating é 2..10 (meios pontos); estrelas = rating / 2. Null pra quem nunca avaliou.
      avgStarsGiven: sql<number | null>`(
        select avg(${reviews.rating}) / 2.0 from ${reviews} where ${reviews.userId} = ${users.id}
      )`.as("avg_stars_given"),
    })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.name));

  return rows.map((row) => ({
    ...row,
    placesCreated: Number(row.placesCreated),
    reviewCount: Number(row.reviewCount),
    wantCount: Number(row.wantCount),
    visitedCount: Number(row.visitedCount),
    avgStarsGiven: row.avgStarsGiven === null ? null : Number(row.avgStarsGiven),
  }));
}
