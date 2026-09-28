import { NextResponse } from "next/server";

/**
 * Health check público, pro Caddy e pro uptime. Não toca no banco de propósito. A versão
 * é o que o `VersionWatch` do cliente compara pra recarregar depois de um deploy.
 */
export function GET() {
  return NextResponse.json({ ok: true, version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" });
}

export const dynamic = "force-dynamic";
