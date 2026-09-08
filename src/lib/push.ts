/**
 * Web Push: manda a notificação pros aparelhos que a galera cadastrou (docs/08 #29).
 *
 * As chaves VAPID vêm do ambiente e são lidas a cada chamada — nada de `NEXT_PUBLIC_*`,
 * que seria fixado no build da imagem Docker. Sem as três variáveis o app funciona
 * igual, só não notifica: `isPushEnabled()` responde false e ninguém tenta enviar.
 */

import { and, inArray, ne, type SQL } from "drizzle-orm";
import webpush from "web-push";

import { avatarUrl } from "@/lib/avatar-url";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

/** Quantos envios em paralelo. Cada um é um POST pro serviço de push (Google/Apple/Mozilla). */
const CONCURRENCY = 8;

/** Status que significam "essa assinatura morreu": o aparelho desinstalou ou revogou. */
const GONE_STATUSES = new Set([404, 410]);

export interface PushPayload {
  title: string;
  body: string;
  /** Caminho relativo aberto ao tocar na notificação. */
  url?: string;
  /** Agrupa notificações do mesmo assunto no mesmo balão. */
  tag?: string;
  /**
   * Imagem grande da notificação: a foto de quem agiu. O SW baixa com a sessão e cai pro
   * ícone do app se faltar (docs/08 #42). Sem foto, fica de fora do JSON.
   */
  icon?: string;
  /**
   * Padrão de vibração em ms, alternando vibra e pausa (`[300, 100, 300]`). Só a dedada
   * manda; o resto fica com o padrão do celular. iPhone e Firefox ignoram.
   */
  vibrate?: number[];
}

/** Ícone da notificação a partir da foto de perfil; sem foto, o SW usa o rosto do cachorro. */
export function avatarIcon(avatarId: string | null | undefined): string | undefined {
  return avatarId ? avatarUrl(avatarId) : undefined;
}

export interface SendReport {
  /** Aparelhos que aceitaram o envio. */
  sent: number;
  /** Aparelhos que deram erro e continuam no banco (vale tentar de novo depois). */
  failed: number;
  /** Assinaturas apagadas do banco por 404/410. */
  removed: number;
  /** Pessoas distintas que receberam pelo menos um push. */
  recipients: number;
  /** Assinaturas encontradas pra esses ids antes de tentar (0 = ninguém ligou). */
  devices: number;
}

const EMPTY_REPORT: SendReport = { sent: 0, failed: 0, removed: 0, recipients: 0, devices: 0 };

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** Push depende das três variáveis: sem qualquer uma delas, nada é enviado. */
export function isPushEnabled(): boolean {
  return Boolean(env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY") && env("VAPID_SUBJECT"));
}

/** Chave pública pro `pushManager.subscribe()` do navegador. Null com push desligado. */
export function getVapidPublicKey(): string | null {
  return isPushEnabled() ? env("VAPID_PUBLIC_KEY") : null;
}

// `setVapidDetails` é global no web-push: chamar de novo com os mesmos valores é
// desperdício, e as chaves só mudam se o processo for reiniciado com outro .env.
let configuredWith: string | null = null;

function configure(): boolean {
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  const subject = env("VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) return false;

  const signature = `${subject}\u0000${publicKey}\u0000${privateKey}`;
  if (configuredWith !== signature) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredWith = signature;
  }
  return true;
}

/** O web-push joga `WebPushError` com `statusCode`; qualquer outro erro vira `null`. */
function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  const status = Number((error as { statusCode: unknown }).statusCode);
  return Number.isFinite(status) ? status : null;
}

/** Só o host do endpoint: o resto é o token do aparelho, que não é pra ir em log. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "?";
  }
}

/** Pool simples: N tarefas rodando, cada uma puxando o próximo item da fila. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Manda o payload pra todas as assinaturas dos `userIds` (ou de todo mundo, com `null`).
 * Assinatura que o serviço devolver como morta (404/410) sai do banco na hora — é o
 * único jeito de a tabela não virar um cemitério de celular trocado.
 */
export async function sendPushTo(
  userIds: string[] | null,
  payload: PushPayload,
  opts: { excludeUserId?: string } = {},
): Promise<SendReport> {
  if (!configure()) return { ...EMPTY_REPORT };
  // Lista vazia é "ninguém"; `null` é que significa "todo mundo".
  if (userIds !== null && userIds.length === 0) return { ...EMPTY_REPORT };

  const filters: SQL[] = [];
  if (userIds !== null) filters.push(inArray(pushSubscriptions.userId, userIds));
  if (opts.excludeUserId) filters.push(ne(pushSubscriptions.userId, opts.excludeUserId));

  const rows = await db
    .select({
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters));

  if (rows.length === 0) return { ...EMPTY_REPORT };

  const body = JSON.stringify(payload);
  const reached = new Set<string>();
  const gone: string[] = [];
  let sent = 0;
  let failed = 0;

  await pool(rows, CONCURRENCY, async (row) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body,
      );
      sent++;
      reached.add(row.userId);
    } catch (error) {
      const status = statusOf(error);
      // Fica no log do container: sem isso não dá pra saber por que um push não chegou
      // (403 = chave VAPID trocada, 413 = payload grande, rede…), ver docs/08 #51.
      if (status !== null && GONE_STATUSES.has(status)) {
        gone.push(row.endpoint);
        console.log(`[eonarga] push: assinatura morta (${status}) de ${row.userId}, removida`);
      } else {
        failed++;
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(
          `[eonarga] push falhou (${status ?? "sem status"}) pra ${row.userId} em ${hostOf(row.endpoint)}: ${detail}`,
        );
      }
    }
  });

  let removed = 0;
  if (gone.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, gone));
    removed = gone.length;
  }

  return { sent, failed, removed, recipients: reached.size, devices: rows.length };
}

/** Quantas pessoas e quantos aparelhos estão com notificação ligada (painel do admin). */
export async function countPushAudience(): Promise<{ devices: number; people: number }> {
  const rows = await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
  return { devices: rows.length, people: new Set(rows.map((row) => row.userId)).size };
}
