"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { CallGroupState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { notifications, users } from "@/lib/db/schema";
import { avatarIcon, isPushEnabled, sendPushTo, type PushPayload } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";

const PUSH_OFF = "Push não está configurado no servidor.";
const NOT_FOUND = "Essa pessoa não está mais na galera.";
const SELF = "Se dedar sozinho não vale.";
const TOO_SOON = "Calma. Uma dedada por minuto.";

/** Uma dedada por minuto por pessoa, seja lá quem for o alvo (docs/08 #45). */
const POKE_LIMIT = { limit: 1, windowMs: 60_000 };

/** Vibra, pausa, vibra, pausa, vibra (ms): a dedada tem que ser sentida no bolso. */
const POKE_VIBRATION = [300, 100, 300, 100, 500];

/**
 * "Dedar" na galera: um push só pra pessoa escolhida, "Fulano enfiou o dedo no seu cu", que abre
 * a galera e vibra o celular. Sem confirmação (é uma pessoa só) e com trava de uma por
 * minuto no servidor, porque dedada em série é o mesmo incômodo que chamada em série.
 */
export async function pokeUser(targetId: string): Promise<CallGroupState> {
  const { user } = await assertUser();

  if (typeof targetId !== "string" || targetId === "") return { ok: false, error: NOT_FOUND };
  if (targetId === user.id) return { ok: false, error: SELF };
  if (!isPushEnabled()) return { ok: false, error: PUSH_OFF };

  const target = await db.query.users.findFirst({
    where: and(eq(users.id, targetId), eq(users.isActive, true)),
    columns: { id: true },
  });
  if (!target) return { ok: false, error: NOT_FOUND };

  // Só conta a tentativa depois de validar: dedar quem não existe não gasta a vez.
  if (!checkRateLimit(`poke:user:${user.id}`, POKE_LIMIT).ok) {
    return { ok: false, error: TOO_SOON };
  }

  const payload: PushPayload = {
    title: "E o narga?",
    body: `${user.name} enfiou o dedo no seu cu`,
    url: "/galera",
    // Várias dedadas da mesma pessoa trocam o balão em vez de empilhar.
    tag: `poke:${user.id}`,
    icon: avatarIcon(user.avatarId),
    vibrate: POKE_VIBRATION,
  };

  const report = await sendPushTo([target.id], payload);

  await db.insert(notifications).values({
    id: nanoid(12),
    kind: "poke",
    title: payload.title,
    body: payload.body,
    url: payload.url,
    createdBy: user.id,
    targetUserId: target.id,
    sentCount: report.sent,
  });

  return { ok: true, sent: report.sent, recipients: report.recipients, devices: report.devices };
}
