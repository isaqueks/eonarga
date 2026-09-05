import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/lib/db/client";
import { notifications, users } from "@/lib/db/schema";
import { mentionNotificationBody, resolveMentions } from "@/lib/mentions";
import { avatarIcon, isPushEnabled, sendPushTo, type PushPayload } from "@/lib/push";

/**
 * Menção vira push (docs/08 #41): quem foi citado com `@Nome:` num post, comentário ou
 * resposta recebe "Fulano te mencionou…" e um registro no histórico do admin.
 *
 * Nunca lança: a menção é bônus em cima de algo que já foi gravado. Quem chama decide
 * quem fica de fora (o próprio autor sempre; o dono do post, se já levou o push de
 * comentário).
 */
export async function notifyMentions(opts: {
  text: string;
  author: { id: string; name: string; avatarId?: string | null };
  /** `post` = texto de post; `comment` = comentário de post ou resposta de avaliação. */
  where: "post" | "comment";
  /** Caminho aberto ao tocar na notificação. */
  url: string;
  /** Ids que não devem receber (o autor entra sempre). */
  exclude?: string[];
  placeId?: string | null;
}): Promise<number> {
  if (!isPushEnabled()) return 0;

  try {
    const people = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.isActive, true));

    const skip = new Set([opts.author.id, ...(opts.exclude ?? [])]);
    const targets = resolveMentions(opts.text, people).filter((p) => !skip.has(p.id));
    if (targets.length === 0) return 0;

    const payload: PushPayload = {
      title: "E o narga?",
      body: mentionNotificationBody(opts.author.name, opts.where, opts.text),
      url: opts.url,
      icon: avatarIcon(opts.author.avatarId),
      // Uma menção por lugar/pessoa troca o balão em vez de empilhar.
      tag: `mention:${opts.url}`,
    };

    let delivered = 0;
    for (const target of targets) {
      const report = await sendPushTo([target.id], payload);
      delivered += report.sent;
      await db.insert(notifications).values({
        id: nanoid(12),
        kind: "mention",
        title: payload.title,
        body: payload.body,
        url: payload.url,
        placeId: opts.placeId ?? null,
        createdBy: opts.author.id,
        targetUserId: target.id,
        sentCount: report.sent,
      });
    }
    return delivered;
  } catch {
    return 0;
  }
}
