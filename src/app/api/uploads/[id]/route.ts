import { NextResponse } from "next/server";

import { badRequest, getApiUser, unauthorized } from "@/lib/api-auth";
import { isValidImageId, readImage, type ImageVariant } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serve uma imagem do storage. Nada aqui é público (docs/05): sem sessão, 401 em JSON.
 *
 * O id muda a cada upload (o arquivo antigo é apagado), então o conteúdo de um id nunca
 * muda — dá pra mandar `immutable`. `private` porque o cache é do navegador de quem tem
 * sessão, não de um CDN compartilhado.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidImageId(id)) return badRequest("Imagem inválida.");

  const variant: ImageVariant =
    new URL(request.url).searchParams.get("v") === "thumb" ? "thumb" : "full";

  const file = await readImage(id, variant);
  if (!file) return NextResponse.json({ error: "Não achei essa imagem." }, { status: 404 });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "image/webp",
      "content-length": String(file.byteLength),
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
