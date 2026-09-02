import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { eq } from "drizzle-orm";

import {
  getSessionTokenFromCookie,
  validateSessionToken,
  type SessionWithUser,
} from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/** "Visto por último" só é regravado depois desse intervalo, senão vira um UPDATE por request. */
const LAST_SEEN_THROTTLE_MS = 5 * 60_000;

/**
 * Sessão do request atual, ou null. `cache()` garante uma consulta só por request,
 * mesmo com vários layouts/páginas chamando.
 */
export const getCurrentUser = cache(async (): Promise<SessionWithUser | null> => {
  const token = await getSessionTokenFromCookie();
  if (!token) return null;
  const current = await validateSessionToken(token);
  if (current) await touchLastSeen(current);
  return current;
});

/** Marca a pessoa como vista agora, se a última marca já tem mais de 5 minutos. */
async function touchLastSeen(current: SessionWithUser): Promise<void> {
  const last = current.user.lastSeenAt ? Date.parse(current.user.lastSeenAt) : 0;
  if (Number.isFinite(last) && Date.now() - last < LAST_SEEN_THROTTLE_MS) return;
  const now = new Date().toISOString();
  try {
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, current.user.id));
    current.user.lastSeenAt = now;
  } catch {
    // Só informativo: falhar aqui não pode derrubar a página.
  }
}

/** `/login?next=<path atual>`, usando o `x-pathname` que o proxy injeta. */
async function loginUrl(): Promise<string> {
  const h = await headers();
  const pathname = h.get("x-pathname");
  // O header vem do proxy, mas um cliente pode forjar: só aceita caminho relativo do próprio app.
  if (!pathname || !pathname.startsWith("/")) return "/login";
  if (pathname.startsWith("//") || pathname.startsWith("/\\")) return "/login";
  if (pathname === "/login") return "/login";
  return `/login?next=${encodeURIComponent(pathname)}`;
}

/**
 * Exige sessão válida em páginas e layouts. Sem sessão → `/login`.
 * Com senha temporária → `/trocar-senha`, a não ser que `allowPasswordChange` (a própria tela de troca).
 */
export async function requireUser(
  options: { allowPasswordChange?: boolean } = {},
): Promise<SessionWithUser> {
  const current = await getCurrentUser();
  if (!current) redirect(await loginUrl());
  if (current.user.mustChangePassword && !options.allowPasswordChange) redirect("/trocar-senha");
  return current;
}

/** Variante pra `/trocar-senha`: exige login, mas não redireciona em loop. */
export function requireUserAllowPasswordChange(): Promise<SessionWithUser> {
  return requireUser({ allowPasswordChange: true });
}

/** Exige admin em páginas e layouts. Não-admin volta pra home (a UI nem mostra o link). */
export async function requireAdmin(): Promise<SessionWithUser> {
  const current = await requireUser();
  if (current.user.role !== "admin") redirect("/");
  return current;
}

/** Versão pra Server Actions: lança em vez de redirecionar (redirect em action vira navegação). */
export async function assertUser(): Promise<SessionWithUser> {
  const current = await getCurrentUser();
  if (!current) throw new Error("Não autorizado");
  return current;
}

export async function assertAdmin(): Promise<SessionWithUser> {
  const current = await assertUser();
  if (current.user.role !== "admin") throw new Error("Não autorizado");
  return current;
}
