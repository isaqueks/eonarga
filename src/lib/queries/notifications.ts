import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db/client";
import { NOTIFICATION_KINDS, notifications, places, users } from "@/lib/db/schema";

export interface NotificationLogItem {
  id: string;
  kind: (typeof NOTIFICATION_KINDS)[number];
  title: string;
  body: string;
  url: string | null;
  /** Aparelhos que aceitaram o push na hora do disparo. */
  sentCount: number;
  createdAt: string;
  /** Nome de quem disparou. */
  author: string;
  /** Nome de quem recebeu; `null` quando foi pra todo mundo. */
  target: string | null;
  placeName: string | null;
  placeSlug: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Histórico do que já foi disparado, do mais novo pro mais velho (página do admin).
 * Lugar arquivado continua aparecendo: o histórico é do que aconteceu, não do que está no ar.
 */
export async function listRecentNotifications(
  limit = DEFAULT_LIMIT,
): Promise<NotificationLogItem[]> {
  const take = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);

  const author = alias(users, "notification_author");
  const target = alias(users, "notification_target");

  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      url: notifications.url,
      sentCount: notifications.sentCount,
      createdAt: notifications.createdAt,
      author: author.name,
      target: target.name,
      placeName: places.name,
      placeSlug: places.slug,
    })
    .from(notifications)
    .innerJoin(author, eq(author.id, notifications.createdBy))
    .leftJoin(target, eq(target.id, notifications.targetUserId))
    .leftJoin(places, eq(places.id, notifications.placeId))
    .orderBy(desc(notifications.createdAt))
    .limit(take);

  return rows;
}
