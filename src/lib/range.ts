import { NextResponse } from "next/server";

import { badRequest } from "@/lib/api-auth";

/** Quanto mandar de uma vez quando o navegador pede "daqui pra frente" sem fim. */
const CHUNK_BYTES = 4 * 1024 * 1024;

export interface RangeSource {
  /** Tamanho total do arquivo. */
  size: number;
  /** `content-type` da resposta. */
  mime: string;
  /** Abre o trecho `[start, end]` (inclusivo) como stream. */
  open: (start: number, end: number) => ReadableStream<Uint8Array>;
}

/**
 * Resposta de mídia com Range, compartilhada por `/api/videos` e `/api/audios`: o
 * `<video>`/`<audio>` pede pedaços pra buscar no tempo, e o iPhone se recusa a tocar
 * sem 206. Sem `Range`, vai o arquivo inteiro com 200.
 *
 * "bytes=a-b" respeita o pedido (limitado ao fim), "bytes=a-" manda um pedaço de até
 * `CHUNK_BYTES`, "bytes=-n" manda os últimos n. Pedido fora do arquivo é 416.
 */
export function rangeResponse(request: Request, source: RangeSource): NextResponse {
  const { size, mime, open } = source;
  const headers: Record<string, string> = {
    "content-type": mime,
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
  return new NextResponse(open(start, end), { status, headers });
}
