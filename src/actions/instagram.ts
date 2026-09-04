"use server";

import type { FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import {
  clampCaption,
  embedUrlFor,
  extractInstagramLink,
  INSTAGRAM_FETCH_UA,
  isInstagramImageUrl,
  parseInstagramEmbed,
} from "@/lib/instagram";
import { POST_BODY_MAX } from "@/lib/posts";
import { checkRateLimit } from "@/lib/rate-limit";
import { discardStagedImport, stageImport } from "@/lib/staged-imports";
import { MAX_UPLOAD_BYTES, saveImage, sniffImageMime } from "@/lib/storage";

/** Mesmas medidas da foto de post tirada na hora. */
const PHOTO_MAX_SIZE = 1600;
const PHOTO_THUMB_SIZE = 400;

/** Cada importação são dois fetches no Instagram: 10 a cada 10 min por pessoa chega. */
const IMPORT_RATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

/** O embed pesa uns 250 KB; passou de 3 MB é outra coisa. */
const HTML_MAX_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

// Módulo "use server": só exporta função async, então as mensagens ficam privadas.
const NOT_A_LINK = "Isso não parece um link de post do Instagram.";
const ONLY_PHOTOS = "Só entra post com foto. Reel e vídeo não.";
const NOT_FOUND = "Não achei esse post. Ele é público?";
const FETCH_FAILED = "O Instagram não respondeu. Tenta de novo ou manda a foto na mão.";
const IMAGE_FAILED = "Não consegui baixar a foto. Manda ela na mão.";
const TOO_MANY = "Calma, importador. Espera uns minutos.";

export interface InstagramImportResult extends FormState {
  photoId?: string;
  /** URL da imagem já no nosso storage (`/api/uploads/<id>`), pra prévia. */
  url?: string;
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

/**
 * Cola o link, o servidor busca a página de embed, baixa a primeira foto pro nosso
 * storage (reprocessada pelo sharp, como qualquer upload) e devolve legenda e prévia.
 * A foto fica "no palco" (`src/lib/staged-imports.ts`) até virar post em `createPost`.
 */
export async function importInstagramPost(input: string): Promise<InstagramImportResult> {
  const { user } = await assertUser();

  const link = extractInstagramLink(typeof input === "string" ? input : "");
  if (!link) return { ok: false, error: NOT_A_LINK };
  if (link.kind !== "post") return { ok: false, error: ONLY_PHOTOS };

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
    return { ok: false, error: parsed.reason === "video" ? ONLY_PHOTOS : NOT_FOUND };
  }
  // A URL da imagem vem do HTML do Instagram: só a CDN deles passa (anti-SSRF, docs/05).
  if (!isInstagramImageUrl(parsed.imageUrl)) return { ok: false, error: IMAGE_FAILED };

  let saved: { id: string; width: number; height: number };
  try {
    const image = await fetchLimited(parsed.imageUrl, MAX_UPLOAD_BYTES, "image/*");
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
    sourceUrl: link.url,
    sourceAuthor: parsed.username,
  });

  return {
    ok: true,
    photoId: saved.id,
    url: `/api/uploads/${saved.id}`,
    width: saved.width,
    height: saved.height,
    caption: parsed.caption ? clampCaption(parsed.caption, POST_BODY_MAX) : null,
    username: parsed.username,
    sourceUrl: link.url,
    slides: parsed.slides,
  };
}

/** Desistiu da foto importada antes de publicar: apaga do palco e do disco. */
export async function discardInstagramImport(photoId: string): Promise<FormState> {
  const { user } = await assertUser();
  if (typeof photoId !== "string" || photoId === "") return { ok: true };
  await discardStagedImport(photoId, user.id);
  return { ok: true };
}
