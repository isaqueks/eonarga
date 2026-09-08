"use server";

import type { FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { clampCaption } from "@/lib/instagram";
import { POST_BODY_MAX } from "@/lib/posts";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchLimited, fetchPage, openStream, resolveRedirects } from "@/lib/remote-media";
import { stageImport } from "@/lib/staged-imports";
import { MAX_UPLOAD_BYTES, saveImage, sniffImageMime } from "@/lib/storage";
import {
  extractTikTokLink,
  isTikTokMediaUrl,
  isTikTokPageUrl,
  parseTikTokPage,
  TIKTOK_FETCH_UA,
  type ParsedTikTokMedia,
  type TikTokLink,
} from "@/lib/tiktok";
import {
  MAX_VIDEO_BYTES,
  saveVideoStream,
  VideoTooBigError,
  type StoredVideo,
} from "@/lib/video-storage";

/** Mesmas medidas da foto de post tirada na hora. */
const PHOTO_MAX_SIZE = 1600;
const PHOTO_THUMB_SIZE = 400;

/** Cada importação são dois ou três fetches no TikTok: 10 a cada 10 min por pessoa chega. */
const IMPORT_RATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

/** A página do vídeo pesa uns 400 KB; passou de 4 MB é outra coisa. */
const HTML_MAX_BYTES = 4 * 1024 * 1024;
/** Link curto redireciona uma vez; três hops é folga. */
const MAX_REDIRECTS = 3;

/** O TikTok só entrega o vídeo com `Referer` da própria casa (mais os cookies da página). */
const TIKTOK_REFERER = "https://www.tiktok.com/";

// Módulo "use server": só exporta função async, então as mensagens ficam privadas.
const NOT_A_LINK = "Isso não parece um link de vídeo do TikTok.";
const NO_VIDEO_URL = "O TikTok não entregou esse vídeo. Manda ele na mão.";
const NOT_FOUND = "Não achei esse vídeo. Ele é público?";
const FETCH_FAILED = "O TikTok não respondeu. Tenta de novo ou manda o vídeo na mão.";
const IMAGE_FAILED = "Não consegui baixar a foto. Manda ela na mão.";
const VIDEO_FAILED = "Não consegui baixar o vídeo. Manda ele na mão.";
const VIDEO_TOO_BIG = "O vídeo é grande demais (máximo 60 MB).";
const TOO_MANY = "Calma, importador. Espera uns minutos.";

/** O mesmo formato do Instagram: o formulário trata os dois igual. */
export interface TikTokImportResult extends FormState {
  kind?: "photo" | "video";
  /** Id da mídia principal no palco: a foto, ou o vídeo. Vai no `importedPhotoId` do form. */
  photoId?: string;
  /** URL da foto (ou da capa do vídeo) já no nosso storage, pra prévia. */
  url?: string;
  /** URL do vídeo já no nosso storage (`/api/videos/<id>.mp4`), pra prévia. */
  videoUrl?: string;
  width?: number;
  height?: number;
  /** Legenda já cortada no limite do post; `null` se o vídeo não tinha texto. */
  caption?: string | null;
  username?: string | null;
  sourceUrl?: string;
  /** Quantas fotos o carrossel tinha (1 pra vídeo). */
  slides?: number;
}

/** Link curto (`vm.tiktok.com/…`) vira o link completo seguindo o redirect do próprio TikTok. */
async function resolveLink(link: TikTokLink): Promise<TikTokLink | null> {
  if (link.kind !== "short") return link;
  const final = await resolveRedirects(
    link.url,
    { userAgent: TIKTOK_FETCH_UA, accept: "text/html" },
    {
      maxHops: MAX_REDIRECTS,
      allow: isTikTokPageUrl,
      // Chegou no link completo: não precisa abrir essa página, a canônica é buscada depois.
      stop: (next) =>
        extractTikTokLink(next)?.kind === "video" || extractTikTokLink(next)?.kind === "photo",
    },
  );
  const resolved = extractTikTokLink(final);
  return resolved && resolved.kind !== "short" ? resolved : null;
}

/**
 * Baixa o vídeo (em stream, direto pro disco, com os cookies e o Referer que o TikTok
 * exige) e a capa. Capa que falhar não derruba a importação.
 */
async function importVideo(
  media: Extract<ParsedTikTokMedia, { kind: "video" }>,
  cookies: string[],
): Promise<
  | { video: StoredVideo; poster: { id: string; width: number; height: number } | null }
  | { error: string }
> {
  if (!isTikTokMediaUrl(media.videoUrl)) return { error: VIDEO_FAILED };
  const headers = { referer: TIKTOK_REFERER, cookie: cookies.join("; ") };

  let video: StoredVideo;
  try {
    const { body, done } = await openStream(media.videoUrl, MAX_VIDEO_BYTES, {
      userAgent: TIKTOK_FETCH_UA,
      accept: "video/*",
      headers,
    });
    try {
      video = await saveVideoStream(body, "mp4", MAX_VIDEO_BYTES);
    } finally {
      done();
    }
  } catch (error) {
    return { error: error instanceof VideoTooBigError ? VIDEO_TOO_BIG : VIDEO_FAILED };
  }

  let poster: { id: string; width: number; height: number } | null = null;
  if (media.posterUrl && isTikTokMediaUrl(media.posterUrl)) {
    try {
      const image = await fetchLimited(media.posterUrl, MAX_UPLOAD_BYTES, {
        userAgent: TIKTOK_FETCH_UA,
        accept: "image/*",
        headers,
      });
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
 * Cola o link (completo ou curto), o servidor busca a página do vídeo com o nosso
 * user-agent, baixa o vídeo (como veio) e a capa — ou a primeira foto do carrossel —
 * pro nosso storage e devolve legenda e prévia. Fica "no palco"
 * (`src/lib/staged-imports.ts`) até virar post em `createPost`.
 */
export async function importTikTokPost(input: string): Promise<TikTokImportResult> {
  const { user } = await assertUser();

  const found = extractTikTokLink(typeof input === "string" ? input : "");
  if (!found) return { ok: false, error: NOT_A_LINK };

  if (!checkRateLimit(`tt-import:${user.id}`, IMPORT_RATE_LIMIT).ok) {
    return { ok: false, error: TOO_MANY };
  }

  let link: TikTokLink | null;
  try {
    link = await resolveLink(found);
  } catch {
    return { ok: false, error: FETCH_FAILED };
  }
  if (!link || link.kind === "short") return { ok: false, error: NOT_FOUND };

  let html: string;
  let cookies: string[];
  try {
    const page = await fetchPage(link.url, HTML_MAX_BYTES, {
      userAgent: TIKTOK_FETCH_UA,
      accept: "text/html,application/xhtml+xml",
    });
    html = page.bytes.toString("utf8");
    cookies = page.cookies;
  } catch {
    return { ok: false, error: FETCH_FAILED };
  }

  const parsed = parseTikTokPage(html);
  if (!parsed.ok) {
    return { ok: false, error: parsed.reason === "video" ? NO_VIDEO_URL : NOT_FOUND };
  }
  const caption = parsed.caption ? clampCaption(parsed.caption, POST_BODY_MAX) : null;
  const common = { caption, username: parsed.username, sourceUrl: link.url, slides: parsed.slides };

  if (parsed.media.kind === "video") {
    const result = await importVideo(parsed.media, cookies);
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

  // A URL da foto vem do JSON do TikTok: só a CDN deles passa (anti-SSRF, docs/05).
  if (!isTikTokMediaUrl(parsed.media.imageUrl)) return { ok: false, error: IMAGE_FAILED };

  let saved: { id: string; width: number; height: number };
  try {
    const image = await fetchLimited(parsed.media.imageUrl, MAX_UPLOAD_BYTES, {
      userAgent: TIKTOK_FETCH_UA,
      accept: "image/*",
      headers: { referer: TIKTOK_REFERER, cookie: cookies.join("; ") },
    });
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
