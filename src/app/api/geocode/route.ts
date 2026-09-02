import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, getApiUser, rateLimited, unauthorized } from "@/lib/api-auth";
import { searchPlaces } from "@/lib/geocode";

export const dynamic = "force-dynamic";

const MAX_RESULTS = 6;

const querySchema = z.object({
  q: z.string().trim().max(120, "Busca comprida demais."),
});

/** Autocomplete de endereço (Photon), sempre pelo servidor pra aplicar UA, cache e limite. */
export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const limited = rateLimited(`geocode:${user.id}`, 60);
  if (limited) return limited;

  const parsed = querySchema.safeParse({
    q: new URL(request.url).searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) return badRequest("Busca inválida.");

  const results = await searchPlaces(parsed.data.q, { limit: MAX_RESULTS });
  return NextResponse.json({ results: results.slice(0, MAX_RESULTS) });
}
