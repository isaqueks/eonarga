import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { photos, places } from "@/lib/db/schema";
import { verifyShareToken } from "@/lib/share";
import { isValidImageId, readImage, type ImageVariant } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Uma resposta só pra tudo que dá errado: não conta se o lugar existe nem se a foto existe. */
function notFound(): NextResponse {
  return NextResponse.json({ error: "Não achei essa imagem." }, { status: 404 });
}

/**
 * Foto de um lugar servida sem sessão, pra página pública `/p/[slug]` (docs/01, v2).
 *
 * Passa por três checagens: o id é do formato que a gente gera, a foto é *daquele* lugar,
 * e o token bate com o id do lugar. Sem os três, 404 — nada de vazar foto por id chutado.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/p/[slug]/photos/[id]">) {
  const { slug, id } = await ctx.params;
  if (!isValidImageId(id)) return notFound();

  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) return notFound();

  const rows = await db
    .select({ placeId: places.id })
    .from(photos)
    .innerJoin(places, eq(places.id, photos.placeId))
    .where(and(eq(photos.id, id), eq(places.slug, slug)))
    .limit(1);

  const row = rows[0];
  if (!row || !verifyShareToken(row.placeId, token)) return notFound();

  const variant: ImageVariant = url.searchParams.get("v") === "thumb" ? "thumb" : "full";
  const file = await readImage(id, variant);
  if (!file) return notFound();

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "image/webp",
      "content-length": String(file.byteLength),
      // `public` porque o token faz parte da URL: quem tem a URL pode ver, e aí o cache
      // compartilhado (Cloudflare) pode ajudar. O conteúdo de um id nunca muda.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
