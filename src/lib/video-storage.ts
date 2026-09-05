import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import { VIDEO_MAX_BYTES } from "@/lib/constants";
import { isValidImageId, UPLOAD_DIR } from "@/lib/storage";

/**
 * Vídeo de post (docs/08 #39): guardado como veio, sem transcodificar — a VPS de
 * 1 vCPU não aguenta ffmpeg, e o celular já grava H.264 que todo navegador toca. O que
 * a gente confere é o tipo pelos magic bytes, o tamanho e, no MP4, as dimensões (pra o
 * card reservar a proporção antes de carregar).
 *
 * Mesma pasta e mesmo formato de id das imagens (`src/lib/storage.ts`); o que muda é a
 * extensão: `<id>.mp4` ou `<id>.webm`.
 */

/** 60 MB: um reel de 3 min em 1080p fica em ~40 MB; vídeo de celular de 1 min, parecido. */
export const MAX_VIDEO_BYTES = VIDEO_MAX_BYTES;

export const VIDEO_EXTS = ["mp4", "webm"] as const;
export type VideoExt = (typeof VIDEO_EXTS)[number];

export const VIDEO_MIME: Record<VideoExt, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
};

export interface StoredVideo {
  id: string;
  ext: VideoExt;
  bytes: number;
}

/** Marcas de `ftyp` que o navegador toca: MP4 de verdade e QuickTime de iPhone/Android. */
const MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "M4A ",
  "qt  ",
  "3gp4",
  "3gp5",
  "3gp6",
  "3gp7",
  "dash",
]);

export function isVideoExt(value: string): value is VideoExt {
  return (VIDEO_EXTS as readonly string[]).includes(value);
}

/**
 * Tipo pelos magic bytes. MP4/MOV: caixa `ftyp` no offset 4 com marca conhecida.
 * WebM: cabeçalho EBML (1A 45 DF A3) com DocType "webm" logo no começo — Matroska
 * `.mkv` fica de fora, que o navegador não toca.
 */
export function sniffVideoExt(buf: Buffer): VideoExt | null {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    return MP4_BRANDS.has(brand) ? "mp4" : null;
  }

  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return buf.subarray(0, 64).toString("latin1").includes("webm") ? "webm" : null;
  }

  return null;
}

export function videoPath(id: string, ext: VideoExt): string {
  return path.join(UPLOAD_DIR, `${id}.${ext}`);
}

/** Grava o arquivo como veio. Não valida: quem chama já passou pelo sniff e pelo limite. */
export async function saveVideo(input: Buffer, ext: VideoExt): Promise<StoredVideo> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const id = nanoid(16);
  await fs.writeFile(videoPath(id, ext), input);
  return { id, ext, bytes: input.byteLength };
}

/**
 * Grava um stream (download do Instagram) direto no disco, sem segurar 40 MB na
 * memória. Passou de `maxBytes`, apaga o parcial e lança.
 */
export async function saveVideoStream(
  stream: ReadableStream<Uint8Array>,
  ext: VideoExt,
  maxBytes: number = MAX_VIDEO_BYTES,
): Promise<StoredVideo> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const id = nanoid(16);
  const target = videoPath(id, ext);
  const out = createWriteStream(target);
  const reader = stream.getReader();
  let bytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new VideoTooBigError();
      }
      if (!out.write(value)) {
        await new Promise<void>((resolve, reject) => {
          out.once("drain", resolve);
          out.once("error", reject);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.once("error", reject);
      out.end(resolve);
    });
    return { id, ext, bytes };
  } catch (error) {
    // Espera o handle fechar antes de apagar: no Windows o rm falha com o arquivo aberto.
    if (!out.destroyed) {
      await new Promise<void>((resolve) => {
        out.once("close", () => resolve());
        out.destroy();
      });
    }
    await fs.rm(target, { force: true }).catch(() => {});
    throw error;
  }
}

export class VideoTooBigError extends Error {
  constructor() {
    super("video too big");
    this.name = "VideoTooBigError";
  }
}

/** Tamanho do arquivo, ou null se não existe. */
export async function statVideo(id: string, ext: VideoExt): Promise<number | null> {
  if (!isValidImageId(id)) return null;
  try {
    const stat = await fs.stat(videoPath(id, ext));
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

/** Stream de um trecho (pro Range do `<video>`), `end` inclusivo. */
export function readVideoRange(id: string, ext: VideoExt, start: number, end: number) {
  return createReadStream(videoPath(id, ext), { start, end });
}

/** Apaga o vídeo, qualquer que seja a extensão. Sem arquivo, não reclama. */
export async function deleteVideo(id: string): Promise<void> {
  if (!isValidImageId(id)) return;
  await Promise.all(
    VIDEO_EXTS.map((ext) => fs.rm(videoPath(id, ext), { force: true }).catch(() => {})),
  );
}

// ------------------------------------------------------------------ dimensões

interface Box {
  type: string;
  /** Início do conteúdo (depois do cabeçalho). */
  start: number;
  /** Fim exclusivo. */
  end: number;
}

/** Percorre as caixas ISO BMFF de `start` até `end`. Tamanho 1 = "largesize" (64 bits), 0 = até o fim. */
function* boxes(buf: Buffer, start: number, end: number): Generator<Box> {
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) return;
      size = Number(buf.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header || pos + size > end) return;
    yield { type, start: pos + header, end: pos + size };
    pos += size;
  }
}

function findBox(buf: Buffer, start: number, end: number, type: string): Box | null {
  for (const box of boxes(buf, start, end)) if (box.type === type) return box;
  return null;
}

/**
 * Largura e altura do primeiro `trak` de vídeo, lidas do `tkhd` (ponto fixo 16.16).
 * Celular em pé costuma gravar deitado com a matriz de rotação no `tkhd`: quando a
 * matriz diz 90°/270°, troca largura por altura, que é como o navegador mostra.
 * Devolve null pra WebM ou MP4 sem `moov` (raro: câmera que grava sem "faststart"
 * põe o `moov` no fim, mas ele ainda está no arquivo, então entra igual).
 */
export function parseMp4Dimensions(buf: Buffer): { width: number; height: number } | null {
  const moov = findBox(buf, 0, buf.length, "moov");
  if (!moov) return null;

  for (const trak of boxes(buf, moov.start, moov.end)) {
    if (trak.type !== "trak") continue;
    const tkhd = findBox(buf, trak.start, trak.end, "tkhd");
    if (!tkhd) continue;

    const version = buf[tkhd.start];
    const matrixAt = tkhd.start + (version === 1 ? 52 : 40);
    const sizeAt = matrixAt + 36;
    if (sizeAt + 8 > tkhd.end) continue;

    const width = buf.readUInt32BE(sizeAt) >>> 16;
    const height = buf.readUInt32BE(sizeAt + 4) >>> 16;
    if (width === 0 || height === 0) continue;

    // Matriz: a b u / c d v / x y w — a e d zerados com b e c ≠ 0 é rotação de 90°/270°.
    const a = buf.readInt32BE(matrixAt);
    const b = buf.readInt32BE(matrixAt + 4);
    const c = buf.readInt32BE(matrixAt + 12);
    const d = buf.readInt32BE(matrixAt + 16);
    const rotated = a === 0 && d === 0 && b !== 0 && c !== 0;

    return rotated ? { width: height, height: width } : { width, height };
  }

  return null;
}
