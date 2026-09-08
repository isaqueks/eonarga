import { NextResponse } from "next/server";

import { badRequest, getApiUser, isSameOrigin, unauthorized } from "@/lib/api-auth";
import { sweepFlops } from "@/lib/flop";

export const dynamic = "force-dynamic";

/**
 * Roda a varredura de flop agora (docs/08 #50), em vez de esperar os 5 minutos do
 * timer. Só admin. Fora de produção aceita `{ "now": "<ISO>" }` no corpo pra adiantar
 * o relógio — é como o e2e flopa um post recém-criado sem esperar 6 horas.
 */
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Só admin roda a varredura." }, { status: 403 });
  }
  if (!isSameOrigin(request)) return badRequest("Origem estranha.");

  let now = new Date();
  if (process.env.NODE_ENV !== "production") {
    const body: unknown = await request.json().catch(() => null);
    const raw =
      typeof body === "object" && body !== null && "now" in body
        ? (body as { now: unknown }).now
        : undefined;
    if (typeof raw === "string") {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return badRequest("`now` não é uma data.");
      now = parsed;
    }
  }

  const flopped = await sweepFlops(now);
  return NextResponse.json({ ok: true, flopped });
}
