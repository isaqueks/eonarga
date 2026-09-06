import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { badRequest, getApiUser, unauthorized } from "@/lib/api-auth";
import { AUDIO_MIME, isAudioExt, readAudioRange, statAudio } from "@/lib/audio-storage";
import { rangeResponse } from "@/lib/range";
import { isValidImageId } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serve um áudio do storage, com Range (`src/lib/range.ts`): o `<audio>` pede pedaços
 * pra buscar no tempo. Nada aqui é público (docs/05): sem sessão, 401.
 *
 * A URL é `/api/audios/<id>.<ext>`; a extensão manda no `content-type`.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/audios/[id]">) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { id: file } = await ctx.params;
  const dot = file.lastIndexOf(".");
  const id = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot + 1) : "";
  if (!isValidImageId(id) || !isAudioExt(ext)) return badRequest("Áudio inválido.");

  const size = await statAudio(id, ext);
  if (size === null) return NextResponse.json({ error: "Não achei esse áudio." }, { status: 404 });

  return rangeResponse(request, {
    size,
    mime: AUDIO_MIME[ext],
    open: (start, end) =>
      Readable.toWeb(readAudioRange(id, ext, start, end)) as ReadableStream<Uint8Array>,
  });
}
