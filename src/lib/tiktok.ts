/**
 * Importar vídeo do TikTok (docs/08 #48): só a parte pura — reconhecer o link, ler o
 * JSON que a página do vídeo traz e decidir o que baixar. A rede fica em
 * `src/actions/tiktok.ts`.
 *
 * O TikTok não tem API pública pra isso. O caminho é a própria página do vídeo
 * (`/@perfil/video/<id>`), que vem renderizada no servidor pra user-agents que não são
 * navegador, com um `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` que traz o vídeo
 * (`playAddr`), a capa, a legenda e o autor. O endereço do vídeo só responde com os
 * cookies que a página mandou e com `Referer` do TikTok — a action cuida disso. Frágil
 * por natureza: se o TikTok mudar o HTML, a importação quebra e sobra o caminho manual.
 */

/** O mesmo user-agent honesto do Instagram: o TikTok entrega o HTML pronto pra ele. */
export const TIKTOK_FETCH_UA = "EONargaBot/1.0 (+https://eonarga.com.br)";

/**
 * Link completo: `tiktok.com/@perfil/video/<id>` ou `/@perfil/photo/<id>` (carrossel de
 * fotos), com ou sem `www.`/`m.`, com querystring atrás ou não.
 */
const FULL_RE =
  /https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([A-Za-z0-9_.-]{1,60})\/(video|photo)\/(\d{8,25})/i;

/**
 * Links curtos do "Compartilhar" (`vm.tiktok.com/…`, `vt.tiktok.com/…`, `tiktok.com/t/…`)
 * e o mobile antigo (`m.tiktok.com/v/<id>.html`): todos redirecionam pro link completo.
 */
const SHORT_RE =
  /https?:\/\/(?:(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]{4,24}\/?|(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9]{4,24}\/?|m\.tiktok\.com\/v\/\d{8,25}(?:\.html)?)/i;

export type TikTokLink =
  | {
      kind: "video" | "photo";
      id: string;
      username: string;
      /** URL canônica, sem querystring de rastreio. */
      url: string;
    }
  /** Link curto: precisa seguir o redirect pra saber o vídeo. */
  | { kind: "short"; url: string };

/** Acha o primeiro link do TikTok num texto (o "compartilhar" manda o link com legenda). */
export function extractTikTokLink(text: string): TikTokLink | null {
  const full = FULL_RE.exec(text);
  const short = SHORT_RE.exec(text);
  // O que aparecer primeiro no texto ganha; um texto com os dois é raro.
  if (full && (!short || full.index <= short.index)) return fromFullMatch(full);
  if (short) return { kind: "short", url: short[0].replace(/\/$/, "") };
  return null;
}

function fromFullMatch(match: RegExpExecArray): TikTokLink {
  const username = match[1];
  const kind = match[2].toLowerCase() === "photo" ? "photo" : "video";
  const id = match[3];
  return { kind, id, username, url: `https://www.tiktok.com/@${username}/${kind}/${id}` };
}

/** Pra onde um link curto pode redirecionar: só páginas do TikTok, sempre https. */
export function isTikTokPageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "tiktok.com" || host.endsWith(".tiktok.com");
}

/**
 * De onde o vídeo ou a capa pode vir: só a CDN do TikTok, sempre https. Qualquer outro
 * host é recusado antes do fetch (anti-SSRF, docs/05).
 */
export function isTikTokMediaUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "tiktok.com" ||
    host.endsWith(".tiktok.com") ||
    host.endsWith(".tiktokcdn.com") ||
    host.endsWith(".tiktokcdn-us.com") ||
    host.endsWith(".tiktokv.com")
  );
}

export type ParsedTikTokMedia =
  | { kind: "photo"; imageUrl: string; width: number | null; height: number | null }
  | {
      kind: "video";
      videoUrl: string;
      posterUrl: string | null;
      width: number | null;
      height: number | null;
      durationSec: number | null;
    };

export type ParsedTikTokPage =
  | {
      ok: true;
      /** O vídeo, ou a primeira foto do carrossel. */
      media: ParsedTikTokMedia;
      caption: string | null;
      username: string | null;
      /** Quantas fotos o carrossel tinha (1 pra vídeo). */
      slides: number;
    }
  /** `video`: é vídeo, mas a página não entregou a URL dele. */
  | { ok: false; reason: "video" | "not-found" };

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** O JSON de hidratação da página, se estiver lá e for JSON de verdade. */
function rehydrationData(html: string): Record<string, unknown> | null {
  const match =
    /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Lê a página do vídeo. Vídeo (com capa, dimensões e duração) ou carrossel de fotos
 * (primeira foto), mais legenda e perfil. Página sem o JSON, `statusCode` diferente de
 * zero (privado, apagado, inexistente) ou sem item vira `not-found`; vídeo sem
 * `playAddr` vira `video`.
 */
export function parseTikTokPage(html: string): ParsedTikTokPage {
  const data = rehydrationData(html);
  if (!data) return { ok: false, reason: "not-found" };

  const scope = (data.__DEFAULT_SCOPE__ ?? {}) as Record<string, unknown>;
  const detail = (scope["webapp.video-detail"] ?? null) as Record<string, unknown> | null;
  if (!detail) return { ok: false, reason: "not-found" };
  if (typeof detail.statusCode === "number" && detail.statusCode !== 0) {
    return { ok: false, reason: "not-found" };
  }

  const itemInfo = (detail.itemInfo ?? {}) as Record<string, unknown>;
  const item = (itemInfo.itemStruct ?? null) as Record<string, unknown> | null;
  if (!item) return { ok: false, reason: "not-found" };

  const author = (item.author ?? {}) as Record<string, unknown>;
  const username = str(author.uniqueId);
  const caption = str(item.desc)?.trim() ?? null;

  const imagePost = (item.imagePost ?? null) as Record<string, unknown> | null;
  const images = Array.isArray(imagePost?.images) ? (imagePost.images as unknown[]) : [];
  if (images.length > 0) {
    const first = (images[0] ?? {}) as Record<string, unknown>;
    const imageUrlNode = (first.imageURL ?? {}) as Record<string, unknown>;
    const urlList = Array.isArray(imageUrlNode.urlList) ? (imageUrlNode.urlList as unknown[]) : [];
    const imageUrl = urlList.map(str).find((url): url is string => url !== null);
    if (!imageUrl) return { ok: false, reason: "not-found" };
    return {
      ok: true,
      media: {
        kind: "photo",
        imageUrl,
        width: num(first.imageWidth),
        height: num(first.imageHeight),
      },
      caption,
      username,
      slides: images.length,
    };
  }

  const video = (item.video ?? {}) as Record<string, unknown>;
  const playStruct = (video.PlayAddrStruct ?? {}) as Record<string, unknown>;
  const playList = Array.isArray(playStruct.UrlList) ? (playStruct.UrlList as unknown[]) : [];
  const videoUrl = str(video.playAddr) ?? playList.map(str).find((u): u is string => u !== null);
  if (!videoUrl) return { ok: false, reason: "video" };

  return {
    ok: true,
    media: {
      kind: "video",
      videoUrl,
      posterUrl: str(video.cover) ?? str(video.originCover),
      width: num(video.width),
      height: num(video.height),
      durationSec: num(video.duration),
    },
    caption,
    username,
    slides: 1,
  };
}
