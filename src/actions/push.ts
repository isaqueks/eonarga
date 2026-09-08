"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import {
  field,
  fieldErrorsFrom,
  type CallGroupState,
  type FormState,
  type NotifyState,
} from "@/actions/form-state";
import { assertAdmin, assertUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { notifications, places, users } from "@/lib/db/schema";
import { avatarIcon, isPushEnabled, sendPushTo, type PushPayload } from "@/lib/push";
import type { PushSubscriptionInput } from "@/lib/push-keys";
import {
  deletePushSubscription,
  INVALID_SUBSCRIPTION,
  upsertPushSubscription,
  type SaveSubscriptionResult,
} from "@/lib/push-subscriptions";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

const PUSH_OFF = "Push não está configurado no servidor.";

/** Uma chamada por pessoa a cada 10 min, e uma por lugar a cada 5 (docs/08 #29). */
const CALL_USER_LIMIT = { limit: 1, windowMs: 10 * 60_000 };
const CALL_PLACE_LIMIT = { limit: 1, windowMs: 5 * 60_000 };

const CALL_TOO_SOON = "Calma. Você já chamou a galera há pouco.";
const PLACE_TOO_SOON = "Alguém acabou de chamar pra esse lugar.";

/**
 * Guarda (ou regrava) a assinatura deste navegador — no "Ativar" e a cada abertura do
 * app (docs/08 #51). Regras e o porquê em `src/lib/push-subscriptions.ts`. Devolve
 * `reason: "key-changed"` (com a chave atual) quando a assinatura foi feita com outra
 * chave VAPID: aí o cliente assina de novo.
 */
export async function savePushSubscription(
  input: PushSubscriptionInput,
): Promise<SaveSubscriptionResult> {
  const { user } = await assertUser();
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  return upsertPushSubscription(user.id, input, userAgent);
}

/** Desliga a notificação neste aparelho. Só apaga assinatura da própria pessoa. */
export async function removePushSubscription(endpoint: string): Promise<FormState> {
  const { user } = await assertUser();

  const value = typeof endpoint === "string" ? endpoint.trim() : "";
  if (!value) return { ok: false, error: INVALID_SUBSCRIPTION };

  await deletePushSubscription(user.id, value);
  return { ok: true };
}

/**
 * "Chamar galera pra cá": apita no celular de todo mundo, menos no de quem chamou.
 * Dois limites porque são dois incômodos diferentes: a pessoa que insiste e o
 * lugar que vira spam com duas pessoas chamando junto.
 */
export async function callGroup(placeId: string): Promise<CallGroupState> {
  const { user } = await assertUser();

  if (!isPushEnabled()) return { ok: false, error: PUSH_OFF };

  const place = await db.query.places.findFirst({
    where: eq(places.id, placeId),
    columns: { id: true, slug: true, name: true, status: true },
  });
  if (!place) return { ok: false, error: "Lugar não encontrado." };
  if (place.status !== "active") return { ok: false, error: "Esse lugar está arquivado." };

  const userKey = `call:user:${user.id}`;
  if (!checkRateLimit(userKey, CALL_USER_LIMIT).ok) return { ok: false, error: CALL_TOO_SOON };

  if (!checkRateLimit(`call:place:${place.id}`, CALL_PLACE_LIMIT).ok) {
    // Quem barrou foi o lugar, não a pessoa: devolve a chamada dela.
    resetRateLimit(userKey);
    return { ok: false, error: PLACE_TOO_SOON };
  }

  const payload: PushPayload = {
    title: "E o narga?",
    body: `${user.name} chamou a galera pro ${place.name}`,
    url: `/lugares/${place.slug}`,
    tag: `call:${place.id}`,
    icon: avatarIcon(user.avatarId),
  };

  const report = await sendPushTo(null, payload, { excludeUserId: user.id });

  // Vira evento do feed mesmo sem ninguém pra notificar: quem abrir o app depois vê.
  await db.insert(notifications).values({
    id: nanoid(12),
    kind: "call",
    title: payload.title,
    body: payload.body,
    url: payload.url,
    placeId: place.id,
    createdBy: user.id,
    sentCount: report.sent,
  });

  revalidatePath("/feed");

  return { ok: true, sent: report.sent, recipients: report.recipients, devices: report.devices };
}

const ALL = "all";

/** Só caminho do próprio app: `//outro.site` e `/\evil` também são URL absoluta pro navegador. */
const relativePath = (v: string) =>
  v === "" || (v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\"));

const adminNotificationSchema = z.object({
  target: z.string().trim().min(1, "Escolhe pra quem vai"),
  title: z
    .string()
    .trim()
    .min(3, "Título curto demais")
    .max(60, "Título comprido demais (máximo 60)"),
  body: z
    .string()
    .trim()
    .min(3, "Mensagem curta demais")
    .max(200, "Mensagem comprida demais (máximo 200)"),
  url: z
    .string()
    .trim()
    .max(200, "Link comprido demais (máximo 200)")
    .refine(relativePath, "O link tem que ser um caminho do app, começando com /")
    .transform((v) => (v === "" ? null : v)),
});

/** Aviso do admin: um push arbitrário pra uma pessoa ou pra todo mundo. */
export async function sendAdminNotification(
  _prev: NotifyState,
  formData: FormData,
): Promise<NotifyState> {
  const { user: me } = await assertAdmin();

  const parsed = adminNotificationSchema.safeParse({
    target: field(formData, "target"),
    title: field(formData, "title"),
    body: field(formData, "body"),
    url: field(formData, "url"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { target, title, body, url } = parsed.data;

  let targetUserId: string | null = null;
  if (target !== ALL) {
    const person = await db.query.users.findFirst({
      where: and(eq(users.id, target), eq(users.isActive, true)),
      columns: { id: true },
    });
    if (!person) return { ok: false, fieldErrors: { target: "Pessoa não encontrada." } };
    targetUserId = person.id;
  }

  if (!isPushEnabled()) return { ok: false, error: PUSH_OFF };

  const payload: PushPayload = {
    title,
    body,
    url: url ?? "/",
    tag: `admin:${Date.now()}`,
  };

  const report = await sendPushTo(targetUserId === null ? null : [targetUserId], payload);

  await db.insert(notifications).values({
    id: nanoid(12),
    kind: "admin",
    title,
    body,
    url,
    createdBy: me.id,
    targetUserId,
    sentCount: report.sent,
  });

  revalidatePath("/admin/notificar");

  return {
    ok: true,
    sent: report.sent,
    recipients: report.recipients,
    failed: report.failed,
  };
}
