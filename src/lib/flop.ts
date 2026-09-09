import { and, asc, eq, gt, isNull, lte, ne, notExists, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/lib/db/client";
import { notifications, postComments, postReactions, posts, users } from "@/lib/db/schema";
import { isPushEnabled, sendPushTo, type PushPayload } from "@/lib/push";

/**
 * Flop de post (docs/08 #50): post que completa 4 horas sem reação nem comentário de
 * outra pessoa vira um aviso no feed, "O post de Fulano flopou 200%", e um push só pro
 * autor, "Seu post flopou 200%". Reagir ou comentar no próprio post não salva ninguém.
 *
 * O aviso é uma linha em `posts` com `flop_of_post_id` apontando pro original (o card
 * do feed reconhece e desenha como fala do app); o original ganha `flopped_at`, que é o
 * que impede o aviso de sair duas vezes. Quem varre é `startFlopSweeper()`, ligado no
 * `instrumentation.ts` quando o servidor sobe.
 */

/** Quatro horas sem ninguém: flopou (eram 6 até a 0.18.1; docs/08 #53). */
export const FLOP_AFTER_MS = 4 * 60 * 60 * 1000;
/**
 * Post mais velho que isso é deixado em paz. É o que impede o primeiro deploy (ou uma
 * volta depois de horas fora do ar) de flopar o feed inteiro de uma vez.
 */
export const FLOP_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Quantos posts uma varredura flopa no máximo; o resto fica pra próxima. */
const SWEEP_BATCH = 20;

export const FLOP_PUSH_TITLE = "E o narga?";
export const FLOP_PUSH_BODY = "Seu post flopou 200%";

/** O texto do aviso no feed. */
export function flopBody(authorName: string): string {
  return `O post de ${authorName} flopou 200%`;
}

export interface FloppedPost {
  /** O post que flopou. */
  postId: string;
  /** O aviso publicado no feed. */
  flopPostId: string;
  authorId: string;
  /** Aparelhos do autor que aceitaram o push (0 com push desligado). */
  sent: number;
}

/**
 * Uma passada: acha os posts que completaram 4 h sem reação nem comentário de outra
 * pessoa, publica o aviso de cada um e manda o push pro autor. Idempotente: o mesmo
 * post nunca flopa duas vezes. `now` é parâmetro pra dar pra testar (e pro e2e
 * adiantar o relógio).
 */
export async function sweepFlops(now: Date = new Date()): Promise<FloppedPost[]> {
  const youngest = new Date(now.getTime() - FLOP_AFTER_MS).toISOString();
  const oldest = new Date(now.getTime() - FLOP_MAX_AGE_MS).toISOString();

  const candidates = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      authorName: users.name,
      placeId: posts.placeId,
      lat: posts.lat,
      lng: posts.lng,
      address: posts.address,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .where(
      and(
        // Aviso de flop não flopa; post já avisado não avisa de novo.
        isNull(posts.flopOfPostId),
        isNull(posts.floppedAt),
        lte(posts.createdAt, youngest),
        gt(posts.createdAt, oldest),
        notExists(
          db
            .select({ one: sql`1` })
            .from(postReactions)
            .where(and(eq(postReactions.postId, posts.id), ne(postReactions.userId, posts.userId))),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(postComments)
            .where(and(eq(postComments.postId, posts.id), ne(postComments.userId, posts.userId))),
        ),
      ),
    )
    .orderBy(asc(posts.createdAt), asc(posts.id))
    .limit(SWEEP_BATCH);

  const flopped: FloppedPost[] = [];
  for (const post of candidates) {
    const flopPostId = nanoid(12);
    const at = new Date().toISOString();

    // Marca e publica juntos: ou o post fica marcado com o aviso no feed, ou nada.
    const done = await db.transaction(async (tx) => {
      const marked = await tx
        .update(posts)
        .set({ floppedAt: at, updatedAt: at })
        .where(and(eq(posts.id, post.id), isNull(posts.floppedAt)));
      if (marked.rowsAffected === 0) return false;

      // O aviso herda o "de onde" do original (a coluna é obrigatória) e o autor, pra
      // sumir junto com ele e com a pessoa.
      await tx.insert(posts).values({
        id: flopPostId,
        userId: post.userId,
        body: flopBody(post.authorName),
        placeId: post.placeId,
        lat: post.lat,
        lng: post.lng,
        address: post.address,
        flopOfPostId: post.id,
      });
      return true;
    });
    if (!done) continue;

    // O push é bônus: falhar aqui não desfaz o aviso, que já está no feed.
    let sent = 0;
    if (isPushEnabled()) {
      try {
        const payload: PushPayload = {
          title: FLOP_PUSH_TITLE,
          body: FLOP_PUSH_BODY,
          url: `/feed#post-${flopPostId}`,
          tag: `flop:${post.id}`,
        };
        const report = await sendPushTo([post.userId], payload);
        sent = report.sent;
        await db.insert(notifications).values({
          id: nanoid(12),
          kind: "flop",
          title: payload.title,
          body: payload.body,
          url: payload.url,
          placeId: post.placeId,
          createdBy: post.userId,
          targetUserId: post.userId,
          sentCount: report.sent,
        });
      } catch {
        // Sem push desta vez; o aviso continua no feed.
      }
    }

    flopped.push({ postId: post.id, flopPostId, authorId: post.userId, sent });
  }

  return flopped;
}

/** De quanto em quanto tempo o servidor varre. Cinco minutos de atraso ninguém nota. */
export const FLOP_SWEEP_INTERVAL_MS = 5 * 60_000;
/** A primeira passada espera o servidor assentar. */
const FLOP_SWEEP_FIRST_DELAY_MS = 30_000;

// No global: em dev o Next recarrega módulos, e um timer por recarga viraria uma festa.
const g = globalThis as unknown as { __eonargaFlopSweeper?: NodeJS.Timeout };

/**
 * Liga a varredura periódica no processo do servidor (chamado pelo `instrumentation.ts`).
 * Chamar de novo não faz nada. Os timers são `unref()`: não seguram o processo vivo.
 */
export function startFlopSweeper(): void {
  if (g.__eonargaFlopSweeper) return;

  const run = async () => {
    try {
      const flopped = await sweepFlops();
      if (flopped.length > 0) console.log(`[eonarga] posts que floparam: ${flopped.length}`);
    } catch (error) {
      console.error("[eonarga] varredura de flop falhou", error);
    }
  };

  g.__eonargaFlopSweeper = setInterval(() => void run(), FLOP_SWEEP_INTERVAL_MS);
  g.__eonargaFlopSweeper.unref();
  setTimeout(() => void run(), FLOP_SWEEP_FIRST_DELAY_MS).unref();
}
