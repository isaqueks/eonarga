import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, getApiUser, rateLimited, unauthorized } from "@/lib/api-auth";
import { reverseGeocode } from "@/lib/geocode";

export const dynamic = "force-dynamic";

const coord = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v !== "" && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max)
    .transform(Number);

const querySchema = z.object({ lat: coord(90), lng: coord(180) });

/** Endereço a partir de um ponto (Nominatim), pra quando a pessoa toca no mapa. */
export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const limited = rateLimited(`geocode-reverse:${user.id}`, 60);
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    lat: params.get("lat") ?? "",
    lng: params.get("lng") ?? "",
  });
  if (!parsed.success) return badRequest("Coordenada inválida.");

  const result = await reverseGeocode(parsed.data.lat, parsed.data.lng);
  return NextResponse.json({ address: result?.address ?? null });
}
