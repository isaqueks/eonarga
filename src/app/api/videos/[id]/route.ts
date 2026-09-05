import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { badRequest, getApiUser, unauthorized } from "@/lib/api-auth";
import { isValidImageId } from "@/lib/storage";
import { isVideoExt, readVideoRange, statVideo, VIDEO_MIME } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

/** Quanto mandar de uma vez quando o navegador pede "daqui pra frente" sem fim. */
const CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * Serve um vídeo do storage, com Range: o `<video>` pede pedaços pra buscar no tempo e
 * o iPhone se recusa a tocar sem 206. Nada aqui é público (docs/05): sem sessão, 401.
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

  const headers: Record<string, string> = {
    "content-type": VIDEO_MIME[ext],
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (range) {
    const [, from, to] = range;
    if (from === "" && to === "") return badRequest("Range inválido.");
    if (from === "") {
      // "bytes=-500": os últimos 500.
      start = Math.max(0, size - Number(to));
    } else {
      start = Number(from);
      end =
        to === "" ? Math.min(size - 1, start + CHUNK_BYTES - 1) : Math.min(Number(to), size - 1);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      });
    }
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${size}`;
  }

  headers["content-length"] = String(end - start + 1);

  const stream = Readable.toWeb(readVideoRange(id, ext, start, end)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, { status, headers });
}
