import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, getApiUser, isSameOrigin, rateLimited, unauthorized } from "@/lib/api-auth";
import { resolveGoogleMapsLink } from "@/lib/maps-link";

export const dynamic = "force-dynamic";

const CANT_READ = "Não consegui ler esse link. Marca no mapa?";

const bodySchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

/** Resolve o link do "compartilhar" do Google Maps em nome + coordenadas. */
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  const limited = rateLimited(`maps-link:${user.id}`, 30);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Corpo inválido.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return badRequest("Manda um link.");

  const result = await resolveGoogleMapsLink(parsed.data.url);
  if (!result) return NextResponse.json({ error: CANT_READ }, { status: 422 });

  return NextResponse.json({ result });
}
