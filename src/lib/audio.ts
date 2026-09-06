/**
 * Regras puras do áudio de post (docs/08 #47): limites, forma de onda e relógio.
 *
 * Nada aqui toca banco, DOM nem `next/*`: a action valida com isto e o gravador e o
 * player do cliente usam as mesmas funções.
 */

import { AUDIO_MAX_MS } from "@/lib/constants";

/** Quantas barras a forma de onda tem. Cabe no card do celular com 3 px cada. */
export const AUDIO_PEAKS_COUNT = 64;

/** Teto do que a gente aceita guardar: mais que isso é payload, não forma de onda. */
export const AUDIO_PEAKS_MAX = 128;

/**
 * Reduz uma série de níveis (o que o gravador mediu a cada ~50 ms, ou as amostras de
 * um arquivo decodificado) a `count` barras entre 0 e 1. Cada barra é a média do seu
 * trecho, normalizada pelo maior valor — áudio baixinho ainda mostra desenho. Série
 * vazia ou muda vira barras zeradas.
 */
export function resamplePeaks(levels: ArrayLike<number>, count = AUDIO_PEAKS_COUNT): number[] {
  const total = levels.length;
  if (count <= 0) return [];
  if (total === 0) return new Array<number>(count).fill(0);

  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * total) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * total) / count));
    let sum = 0;
    for (let j = start; j < end; j++) sum += Math.abs(levels[j]) || 0;
    bars.push(sum / (end - start));
  }

  const max = Math.max(...bars);
  if (max <= 0) return bars.map(() => 0);
  return bars.map((v) => Math.round((v / max) * 100) / 100);
}

/** 7 400 ms → "0:07"; 61 000 → "1:01"; 3 600 000 → "60:00". Negativo ou lixo vira "0:00". */
export function formatClock(ms: number): string {
  const seconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/**
 * Duração informada pelo navegador, em ms: inteiro entre 0 e o teto. Fora disso, null
 * (o post entra sem duração e o player descobre tocando).
 */
export function parseDurationMs(raw: string): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > AUDIO_MAX_MS) return null;
  return value;
}

/**
 * Forma de onda informada pelo navegador: JSON com uma lista de números entre 0 e 1,
 * até `AUDIO_PEAKS_MAX` itens, arredondados a duas casas. Qualquer coisa fora disso vira
 * null — o player desenha barras iguais e segue a vida.
 */
export function parsePeaks(raw: string): number[] | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > AUDIO_PEAKS_MAX) return null;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1) return null;
    out.push(Math.round(item * 100) / 100);
  }
  return out;
}

/**
 * Tipos que o MediaRecorder pode gravar, do preferido pro último recurso: Opus em WebM
 * (Chrome, Firefox), AAC em MP4 (Safari), Opus em Ogg (Firefox antigo). O primeiro que
 * `isTypeSupported` aceitar é o usado; nenhum, deixa o navegador escolher.
 */
export const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

/** Extensão do arquivo gravado a partir do tipo que o MediaRecorder devolveu. */
export function recordingExt(mime: string): "webm" | "m4a" | "ogg" {
  const type = mime.split(";")[0].trim().toLowerCase();
  if (type === "audio/mp4" || type === "audio/aac" || type === "audio/x-m4a") return "m4a";
  if (type === "audio/ogg" || type === "audio/opus") return "ogg";
  return "webm";
}
