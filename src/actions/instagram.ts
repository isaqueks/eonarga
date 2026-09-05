"use server";

import type { FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import {
  clampCaption,
  embedUrlFor,
  extractInstagramLink,
  INSTAGRAM_FETCH_UA,
  isInstagramMediaUrl,
  parseInstagramEmbed,
  type ParsedMedia,
} from "@/lib/instagram";
import { POST_BODY_MAX } from "@/lib/posts";
import { checkRateLimit } from "@/lib/rate-limit";
import { discardStagedImport, stageImport } from "@/lib/staged-imports";
import { MAX_UPLOAD_BYTES, saveImage, sniffImageMime } from "@/lib/storage";
import {
  MAX_VIDEO_BYTES,
  saveVideoStream,
  VideoTooBigError,
  type StoredVideo,
} from "@/lib/video-storage";

/** Mesmas medidas da foto de post tirada na hora. */
const PHOTO_MAX_SIZE = 1600;
const PHOTO_THUMB_SIZE = 400;

/** Cada importação são dois fetches no Instagram: 10 a cada 10 min por pessoa chega. */
const IMPORT_RATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

/** O embed pesa uns 250 KB; passou de 3 MB é outra coisa. */
const HTML_MAX_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
/** Um reel de 40 MB numa conexão de VPS leva alguns segundos; 90 s é folga. */
const VIDEO_TIMEOUT_MS = 90_000;

// Módulo "use server": só exporta função async, então as mensagens ficam privadas.
const NOT_A_LINK = "Isso não parece um link de post do Instagram.";
const NO_VIDEO_URL = "O Instagram não entregou o vídeo desse post. Manda ele na mão.";
const NOT_FOUND = "Não achei esse post. Ele é público?";
const FETCH_FAILED = "O Instagram não respondeu. Tenta de novo ou manda a foto na mão.";
const IMAGE_FAILED = "Não consegui baixar a foto. Manda ela na mão.";
const VIDEO_FAILED = "Não consegui baixar o vídeo. Manda ele na mão.";
const VIDEO_TOO_BIG = "O vídeo desse post é grande demais (máximo 60 MB).";
const TOO_MANY = "Calma, importador. Espera uns minutos.";

export interface InstagramImportResult extends FormState {
  /** `"photo"` ou `"video"`. */
  kind?: "photo" | "video";
  /** Id da mídia principal no palco: a foto, ou o vídeo. Vai no `importedPhotoId` do form. */
  photoId?: string;
  /** URL da foto (ou da capa do vídeo) já no nosso storage, pra prévia. */
  url?: string;
  /** URL do vídeo já no nosso storage (`/api/videos/<id>.mp4`), pra prévia. */
  videoUrl?: string;
  width?: number;
  height?: number;
  /** Legenda já cortada no limite do post; `null` se o post não tinha texto. */
  caption?: string | null;
  username?: string | null;
  sourceUrl?: string;
  /** Quantos slides o post tinha (a importação leva só a primeira foto). */
  slides?: number;
}

/**
 * Busca com prazo e teto de tamanho. `redirect: "manual"`: o Instagram redireciona post
 * inexistente pro login e a CDN não redireciona nunca, então qualquer 3xx é "não achei".
 */
async function fetchLimited(url: string, maxBytes: number, accept: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        "user-agent": INSTAGRAM_FETCH_UA,
        "accept-language": "pt-BR,pt;q=0.9",
        accept,
      },
    });
    if (!response.ok || !response.body) throw new Error(`status ${response.status}`);

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new Error("too big");

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("too big");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

/** Abre a resposta do vídeo pra gravar em stream (`saveVideoStream` cuida do teto). */
async function openVideo(
  url: string,
): Promise<{ body: ReadableStream<Uint8Array>; done: () => void }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIDEO_TIMEOUT_MS);
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
    signal: controller.signal,
    headers: { "user-agent": INSTAGRAM_FETCH_UA, accept: "video/*" },
  }).catch((error) => {
    clearTimeout(timer);
    throw error;
  });
  if (!response.ok || !response.body) {
    clearTimeout(timer);
    throw new Error(`status ${response.status}`);
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_VIDEO_BYTES) {
    clearTimeout(timer);
    await response.body.cancel().catch(() => {});
    throw new VideoTooBigError();
  }
  return { body: response.body, done: () => clearTimeout(timer) };
}

/**
 * Baixa o vídeo (em stream, direto pro disco) e a capa (foto normal, reprocessada).
 * Capa que falhar não derruba a importação: o card mostra o primeiro quadro.
 */
async function importVideo(
  media: Extract<ParsedMedia, { kind: "video" }>,
): Promise<
  | { video: StoredVideo; poster: { id: string; width: number; height: number } | null }
  | { error: string }
> {
  if (!isInstagramMediaUrl(media.videoUrl)) return { error: VIDEO_FAILED };

  let video: StoredVideo;
  try {
    const { body, done } = await openVideo(media.videoUrl);
    try {
      video = await saveVideoStream(body, "mp4", MAX_VIDEO_BYTES);
    } finally {
      done();
    }
  } catch (error) {
    return { error: error instanceof VideoTooBigError ? VIDEO_TOO_BIG : VIDEO_FAILED };
  }

  let poster: { id: string; width: number; height: number } | null = null;
  if (media.posterUrl && isInstagramMediaUrl(media.posterUrl)) {
    try {
      const image = await fetchLimited(media.posterUrl, MAX_UPLOAD_BYTES, "image/*");
      if (sniffImageMime(image)) {
        poster = await saveImage(image, { maxSize: PHOTO_MAX_SIZE, thumbSize: PHOTO_THUMB_SIZE });
      }
    } catch {
      poster = null;
    }
  }

  return { video, poster };
}

/**
 * Cola o link, o servidor busca a página de embed, baixa a primeira mídia (foto
 * reprocessada pelo sharp, ou vídeo como veio, mais a capa) pro nosso storage e devolve
 * legenda e prévia. Fica "no palco" (`src/lib/staged-imports.ts`) até virar post em
 * `createPost`.
 */
export async function importInstagramPost(input: string): Promise<InstagramImportResult> {
  const { user } = await assertUser();

  const link = extractInstagramLink(typeof input === "string" ? input : "");
  if (!link) return { ok: false, error: NOT_A_LINK };

  if (!checkRateLimit(`ig-import:${user.id}`, IMPORT_RATE_LIMIT).ok) {
    return { ok: false, error: TOO_MANY };
  }

  let html: string;
  try {
    const bytes = await fetchLimited(
      embedUrlFor(link.shortcode),
      HTML_MAX_BYTES,
      "text/html,application/xhtml+xml",
    );
    html = bytes.toString("utf8");
  } catch {
    return { ok: false, error: FETCH_FAILED };
  }

  const parsed = parseInstagramEmbed(html);
  if (!parsed.ok) {
    return { ok: false, error: parsed.reason === "video" ? NO_VIDEO_URL : NOT_FOUND };
  }
  const caption = parsed.caption ? clampCaption(parsed.caption, POST_BODY_MAX) : null;
  const common = { caption, username: parsed.username, sourceUrl: link.url, slides: parsed.slides };

  if (parsed.media.kind === "video") {
    const result = await importVideo(parsed.media);
    if ("error" in result) return { ok: false, error: result.error };
    const { video, poster } = result;
    const width = parsed.media.width ?? poster?.width ?? 0;
    const height = parsed.media.height ?? poster?.height ?? 0;

    stageImport({
      id: video.id,
      userId: user.id,
      width,
      height,
      videoExt: video.ext,
      posterId: poster?.id ?? null,
      sourceUrl: link.url,
      sourceAuthor: parsed.username,
    });

    return {
      ok: true,
      kind: "video",
      photoId: video.id,
      videoUrl: `/api/videos/${video.id}.${video.ext}`,
      url: poster ? `/api/uploads/${poster.id}` : undefined,
      width,
      height,
      ...common,
    };
  }

  // A URL da imagem vem do HTML do Instagram: só a CDN deles passa (anti-SSRF, docs/05).
  if (!isInstagramMediaUrl(parsed.media.imageUrl)) return { ok: false, error: IMAGE_FAILED };

  let saved: { id: string; width: number; height: number };
  try {
    const image = await fetchLimited(parsed.media.imageUrl, MAX_UPLOAD_BYTES, "image/*");
    if (!sniffImageMime(image)) return { ok: false, error: IMAGE_FAILED };
    saved = await saveImage(image, { maxSize: PHOTO_MAX_SIZE, thumbSize: PHOTO_THUMB_SIZE });
  } catch {
    return { ok: false, error: IMAGE_FAILED };
  }

  stageImport({
    id: saved.id,
    userId: user.id,
    width: saved.width,
    height: saved.height,
    videoExt: null,
    posterId: null,
    sourceUrl: link.url,
    sourceAuthor: parsed.username,
  });

  return {
    ok: true,
    kind: "photo",
    photoId: saved.id,
    url: `/api/uploads/${saved.id}`,
    width: saved.width,
    height: saved.height,
    ...common,
  };
}

/** Desistiu da mídia importada antes de publicar: apaga do palco e do disco. */
export async function discardInstagramImport(photoId: string): Promise<FormState> {
  const { user } = await assertUser();
  if (typeof photoId !== "string" || photoId === "") return { ok: true };
  await discardStagedImport(photoId, user.id);
  return { ok: true };
}
