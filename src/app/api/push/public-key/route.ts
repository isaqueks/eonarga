import { NextResponse } from "next/server";

import { getApiUser, unauthorized } from "@/lib/api-auth";
import { getVapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Chave pública VAPID pro `pushManager.subscribe()`. Vai por rota (e não por
 * `NEXT_PUBLIC_*`) porque `NEXT_PUBLIC_*` é fixado no build da imagem Docker: trocar
 * a chave no `.env` do VPS não teria efeito nenhum sem rebuildar.
 *
 * Não é segredo — é pública por definição — mas exige sessão como todo o resto da API.
 */
export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const key = getVapidPublicKey();
  if (!key) return NextResponse.json({ error: "Push não está configurado." }, { status: 404 });

  return NextResponse.json({ key });
}
