import { NextResponse } from "next/server";

/** Health check público, pro Caddy e pro uptime. Não toca no banco de propósito. */
export function GET() {
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
