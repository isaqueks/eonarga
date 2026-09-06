import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { badRequest, getApiUser, unauthorized } from "@/lib/api-auth";
import { rangeResponse } from "@/lib/range";
import { isValidImageId } from "@/lib/storage";
import { isVideoExt, readVideoRange, statVideo, VIDEO_MIME } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

/**
 * Serve um vídeo do storage, com Range (`src/lib/range.ts`): o `<video>` pede pedaços
 * pra buscar no tempo e o iPhone se recusa a tocar sem 206. Nada aqui é público
 * (docs/05): sem sessão, 401.
 *
 * A URL é `/api/videos/<id>.<ext>`; a extensão manda no `content-type`.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/videos/[id]">) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { id: file } = await ctx.params;
  const dot = file.lastIndexOf(".");
  const id = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot + 1) : "";
  if (!isValidImageId(id) || !isVideoExt(ext)) return badRequest("Vídeo inválido.");

  const size = await statVideo(id, ext);
  if (size === null) return NextResponse.json({ error: "Não achei esse vídeo." }, { status: 404 });

  return rangeResponse(request, {
    size,
    mime: VIDEO_MIME[ext],
    open: (start, end) =>
      Readable.toWeb(readVideoRange(id, ext, start, end)) as ReadableStream<Uint8Array>,
  });
}
