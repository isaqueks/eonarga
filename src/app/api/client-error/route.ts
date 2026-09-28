import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, getApiUser, isSameOrigin, rateLimited, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** O que a tela de erro manda (`src/lib/report-client-error.ts`); tudo curto e opcional. */
const reportSchema = z.object({
  message: z.string().trim().min(1).max(500),
  digest: z.string().max(64).optional(),
  stack: z.string().max(1500).optional(),
  path: z.string().max(300).optional(),
  version: z.string().max(40).optional(),
});

/**
 * Erro que a pessoa viu no app vai pro log do container (docs/08 #54). Sessão e mesma
 * origem obrigatórias, 10 por minuto por pessoa; nada é gravado no banco nem devolvido.
 */
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!isSameOrigin(request)) return badRequest("Origem estranha.");

  const limited = rateLimited(`client-error:${user.id}`, 10);
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return badRequest("Corpo inválido.");
  }
  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) return badRequest("Corpo inválido.");

  const { message, digest, stack, path, version } = parsed.data;
  const agent = (request.headers.get("user-agent") ?? "").slice(0, 120);
  const where = `${user.name} v${version ?? "?"} em ${path ?? "?"}`;
  const detail = stack ? `\n${stack.split("\n").slice(0, 6).join("\n")}` : "";
  console.warn(
    `[eonarga] erro no cliente (${where}) digest=${digest ?? "-"}: ${oneLine(message)} | ua=${agent}${detail}`,
  );

  return NextResponse.json({ ok: true });
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
