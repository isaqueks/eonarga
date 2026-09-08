import { NextResponse } from "next/server";

import { badRequest, getApiUser, isSameOrigin, rateLimited, unauthorized } from "@/lib/api-auth";
import { upsertPushSubscription } from "@/lib/push-subscriptions";

export const dynamic = "force-dynamic";

/**
 * Regrava a assinatura de push a partir do service worker (docs/08 #51): quando o
 * navegador troca a assinatura por conta própria (`pushsubscriptionchange`), o worker
 * assina de novo e manda a nova pra cá, com a antiga em `oldEndpoint` pra sair do banco.
 * O worker não chama server action, por isso a rota. Mesmas regras da action: sessão,
 * mesma origem, e a chave tem que ser a VAPID atual.
 */
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!isSameOrigin(request)) return badRequest("Origem estranha.");

  const limited = rateLimited(`push-subscribe:${user.id}`, 20);
  if (limited) return limited;

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) return badRequest("Manda a assinatura em JSON.");
  const { oldEndpoint, ...subscription } = body as Record<string, unknown>;

  const result = await upsertPushSubscription(
    user.id,
    subscription,
    request.headers.get("user-agent")?.slice(0, 300) ?? null,
    { oldEndpoint: typeof oldEndpoint === "string" ? oldEndpoint : null },
  );
  if (!result.ok) return NextResponse.json(result, { status: 400 });

  return NextResponse.json({ ok: true });
}
