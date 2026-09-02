/**
 * Cola dos Route Handlers: sessão, rate limit e checagem de origem.
 * Nenhuma rota da API é pública (ver docs/05) — sem sessão, 401 e acabou.
 */

import { NextResponse } from "next/server";

import { assertUser } from "@/lib/auth/guards";
import type { SessionWithUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";

/** Sessão do request, ou `null`. `assertUser()` lança; aqui a gente prefere responder JSON. */
export async function getApiUser(): Promise<SessionWithUser["user"] | null> {
  try {
    const { user } = await assertUser();
    return user;
  } catch {
    return null;
  }
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Faz login primeiro." }, { status: 401 });
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

/** `null` quando passa; a resposta 429 pronta quando estourou. */
export function rateLimited(key: string, limit: number, windowMs = 60_000): NextResponse | null {
  const result = checkRateLimit(key, { limit, windowMs });
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Calma aí. Tenta de novo em instantes." },
    { status: 429, headers: { "retry-after": String(Math.ceil(result.retryAfterMs / 1000)) } },
  );
}

/**
 * CSRF pra Route Handler de mutação: se veio `Origin`, ele tem que bater com o
 * host do request. Requisição do próprio app sempre bate.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
