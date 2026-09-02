import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db/client";
import { sessions, users, type Session, type User } from "@/lib/db/schema";

export const SESSION_COOKIE_NAME = "eonarga_session";

/** 30 dias. Renova quando passa da metade (15 dias). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionWithUser = { session: Session; user: User };

/** SHA-256 hex do token. É isso que vira `sessions.id`; o token cru só existe no cookie. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Cria a sessão e devolve o token cru (pro cookie) e a validade. */
export async function createSession(
  userId: string,
  userAgent?: string | null,
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const sessionId = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt: expiresAt.toISOString(),
    userAgent: userAgent?.slice(0, 255) ?? null,
  });

  return { token, sessionId, expiresAt };
}

/**
 * Valida o token do cookie contra o banco.
 * - expirada: apaga e devolve null
 * - usuário inativo: devolve null (a linha fica; desativar já invalida as sessões)
 * - passou da metade da vida: renova por mais 30 dias
 */
export async function validateSessionToken(token: string): Promise<SessionWithUser | null> {
  if (!token) return null;
  const sessionId = hashSessionToken(token);

  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .get();

  if (!row) return null;

  const now = Date.now();
  const expiresAt = new Date(row.session.expiresAt).getTime();

  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    await invalidateSession(sessionId);
    return null;
  }

  if (!row.user.isActive) return null;

  let session = row.session;
  // Renova se passou da metade da vida, pra sessão ativa não morrer no meio do uso.
  if (expiresAt - now < SESSION_TTL_MS / 2) {
    const renewed = new Date(now + SESSION_TTL_MS).toISOString();
    await db.update(sessions).set({ expiresAt: renewed }).where(eq(sessions.id, sessionId));
    session = { ...session, expiresAt: renewed };
  }

  return { session, user: row.user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Derruba todas as sessões do usuário (opcionalmente poupando a atual). */
export async function invalidateUserSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
    : eq(sessions.userId, userId);
  await db.delete(sessions).where(where);
}

/** Só pode ser chamado de Server Action ou Route Handler (cookies são escritos na resposta). */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

/** Lê o token cru do cookie (não valida nada). */
export async function getSessionTokenFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}
