import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { sameKey } from "@/lib/push-keys";
import { getVapidPublicKey } from "@/lib/push";

export { normalizeKey, sameKey, type PushSubscriptionInput } from "@/lib/push-keys";

/**
 * A assinatura de push de um navegador, no banco (docs/08 #51). Usado pela server action
 * (`actions/push.ts`, o toggle e a conferência a cada abertura) e pela rota que o service
 * worker chama quando o navegador troca a assinatura por conta própria.
 */

export const INVALID_SUBSCRIPTION = "Assinatura inválida.";
export const KEY_CHANGED = "A chave do servidor mudou. Assina de novo.";

/** O endpoint é uma URL do serviço de push (FCM, Apple, Mozilla): sempre https. */
export const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine((v) => /^https:\/\//i.test(v), INVALID_SUBSCRIPTION),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(400),
    auth: z.string().trim().min(1).max(400),
  }),
  /**
   * A chave pública com que o navegador assinou (`options.applicationServerKey`), em
   * base64url. Quando vem, é conferida com a VAPID atual: assinatura feita com outra
   * chave é recusada pelo serviço de push (403), então não adianta guardar.
   */
  applicationServerKey: z.string().trim().max(200).optional().nullable(),
});

export type SaveSubscriptionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      reason: "invalid" | "key-changed";
      /** Com `key-changed`, a chave atual, pra assinar de novo sem outra ida ao servidor. */
      key?: string;
    };

/**
 * Guarda (ou regrava) a assinatura de um navegador. O endpoint é único por navegador,
 * não por pessoa: se alguém entrar com outra conta no mesmo aparelho, a linha muda de
 * dono em vez de duplicar — senão o dono antigo continuaria recebendo push de um
 * celular que não é mais dele. Regravar a mesma assinatura é barato e é o que conserta
 * a linha que sumiu (docs/08 #51).
 *
 * `oldEndpoint`: a assinatura que o navegador trocou (`pushsubscriptionchange`); a linha
 * dela sai junto, se for da mesma pessoa.
 */
export async function upsertPushSubscription(
  userId: string,
  input: unknown,
  userAgent: string | null,
  opts: { oldEndpoint?: string | null } = {},
): Promise<SaveSubscriptionResult> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_SUBSCRIPTION, reason: "invalid" };
  const { endpoint, keys, applicationServerKey } = parsed.data;

  const current = getVapidPublicKey();
  if (current && applicationServerKey && !sameKey(applicationServerKey, current)) {
    return { ok: false, error: KEY_CHANGED, reason: "key-changed", key: current };
  }

  const now = new Date().toISOString();
  await db
    .insert(pushSubscriptions)
    .values({
      id: nanoid(12),
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastSeenAt: now },
    });

  const old = opts.oldEndpoint?.trim();
  if (old && old !== endpoint) await deletePushSubscription(userId, old);

  return { ok: true };
}

/** Apaga a assinatura, só se for da própria pessoa. */
export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
}
