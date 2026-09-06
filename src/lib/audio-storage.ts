import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import { AUDIO_MAX_BYTES } from "@/lib/constants";
import { isValidImageId, UPLOAD_DIR } from "@/lib/storage";

/**
 * Áudio de post (docs/08 #47): guardado como veio, igual ao vídeo — sem transcodificar,
 * porque a VPS não aguenta ffmpeg e o navegador já grava Opus (Chrome, Firefox) ou AAC
 * (Safari). O que a gente confere é o contêiner pelos magic bytes e o tamanho.
 *
 * Mesma pasta e mesmo formato de id das imagens e dos vídeos (`src/lib/storage.ts`);
 * o que muda é a extensão: `<id>.webm`, `.m4a`, `.ogg`, `.mp3` ou `.wav`.
 */

export const MAX_AUDIO_BYTES = AUDIO_MAX_BYTES;

export const AUDIO_EXTS = ["webm", "m4a", "ogg", "mp3", "wav"] as const;
export type AudioExt = (typeof AUDIO_EXTS)[number];

export const AUDIO_MIME: Record<AudioExt, string> = {
  webm: "audio/webm",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export interface StoredAudio {
  id: string;
  ext: AudioExt;
  bytes: number;
}

export function isAudioExt(value: string): value is AudioExt {
  return (AUDIO_EXTS as readonly string[]).includes(value);
}

/**
 * Contêiner pelos magic bytes:
 * - WebM: cabeçalho EBML (1A 45 DF A3) com DocType "webm" (o que o Chrome grava);
 * - MP4/M4A: caixa `ftyp` no offset 4 (o que o Safari grava, e a nota de voz do iPhone);
 * - Ogg: "OggS" (nota de voz do WhatsApp é Opus em Ogg);
 * - MP3: tag ID3 ou sync de quadro (FF Ex/FF Fx);
 * - WAV: "RIFF" … "WAVE".
 *
 * Um WebM/MP4 só de vídeo passa aqui também: quem separa áudio de vídeo é o tipo que o
 * formulário declarou (`src/actions/posts.ts`); o sniff só garante que é um contêiner
 * que o navegador toca.
 */
export function sniffAudioExt(buf: Buffer): AudioExt | null {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return buf.subarray(0, 64).toString("latin1").includes("webm") ? "webm" : null;
  }
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    return /^[A-Za-z0-9 ]{4}$/.test(buf.toString("latin1", 8, 12)) ? "m4a" : null;
  }
  if (buf.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (buf.toString("ascii", 0, 3) === "ID3") return "mp3";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0) return "mp3";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
    return "wav";
  }

  return null;
}

export function audioPath(id: string, ext: AudioExt): string {
  return path.join(UPLOAD_DIR, `${id}.${ext}`);
}

/** Grava o arquivo como veio. Não valida: quem chama já passou pelo sniff e pelo limite. */
export async function saveAudio(input: Buffer, ext: AudioExt): Promise<StoredAudio> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const id = nanoid(16);
  await fs.writeFile(audioPath(id, ext), input);
  return { id, ext, bytes: input.byteLength };
}

/** Tamanho do arquivo, ou null se não existe. */
export async function statAudio(id: string, ext: AudioExt): Promise<number | null> {
  if (!isValidImageId(id)) return null;
  try {
    const stat = await fs.stat(audioPath(id, ext));
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

/** Stream de um trecho (pro Range do `<audio>`), `end` inclusivo. */
export function readAudioRange(id: string, ext: AudioExt, start: number, end: number) {
  return createReadStream(audioPath(id, ext), { start, end });
}

/** Apaga o áudio, qualquer que seja a extensão. Sem arquivo, não reclama. */
export async function deleteAudio(id: string): Promise<void> {
  if (!isValidImageId(id)) return;
  await Promise.all(
    AUDIO_EXTS.map((ext) => fs.rm(audioPath(id, ext), { force: true }).catch(() => {})),
  );
}
