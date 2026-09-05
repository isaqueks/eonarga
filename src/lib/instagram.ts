/**
 * Importar post do Instagram (docs/08 #37): só a parte pura — reconhecer o link, ler o
 * HTML da página de embed e decidir se é foto. A rede fica em `src/actions/instagram.ts`.
 *
 * O Instagram não tem API pública pra isso. O caminho é a página de embed
 * (`/p/<código>/embed/captioned/`), que vem renderizada no servidor pra user-agents
 * que não são navegador. É frágil por natureza: se o Instagram mudar o HTML, a
 * importação quebra e sobra o caminho manual (foto/vídeo + texto).
 *
 * Reel e vídeo (docs/08 #39): o JSON do embed traz `video_url`, a capa (`display_url`)
 * e as dimensões. Carrossel leva o primeiro slide, seja foto ou vídeo.
 */

/** User-agent honesto: o Instagram entrega o HTML pronto pra quem não é navegador. */
export const INSTAGRAM_FETCH_UA = "EONargaBot/1.0 (+https://eonarga.com.br)";

/**
 * Link de post, reel ou IGTV, com ou sem `www.`/`m.`, com ou sem o nome do perfil no
 * caminho (`instagram.com/nasa/p/…`), com querystring atrás ou não.
 */
const LINK_RE =
  /https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reels?|tv)\/([A-Za-z0-9_-]{5,40})/i;

export type InstagramLinkKind = "post" | "reel" | "tv";

export interface InstagramLink {
  shortcode: string;
  kind: InstagramLinkKind;
  /** URL canônica, sem querystring de rastreio. */
  url: string;
}

/** Acha o primeiro link do Instagram num texto (o "compartilhar" manda o link solto ou com legenda). */
export function extractInstagramLink(text: string): InstagramLink | null {
  const match = LINK_RE.exec(text);
  if (!match) return null;
  const segment = match[1].toLowerCase();
  const kind: InstagramLinkKind = segment === "p" ? "post" : segment === "tv" ? "tv" : "reel";
  const path = kind === "post" ? "p" : kind === "tv" ? "tv" : "reel";
  return { shortcode: match[2], kind, url: `https://www.instagram.com/${path}/${match[2]}/` };
}

/** A página de embed com legenda: é ela que o servidor renderiza pra robô. */
export function embedUrlFor(shortcode: string): string {
  return `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
}

/**
 * De onde a foto ou o vídeo pode vir: só a CDN do Instagram/Facebook, sempre https.
 * Qualquer outro host é recusado antes do fetch (anti-SSRF, docs/05).
 */
export function isInstagramMediaUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "cdninstagram.com" || host.endsWith(".cdninstagram.com") || host.endsWith(".fbcdn.net")
  );
}

export type ParsedMedia =
  | { kind: "photo"; imageUrl: string }
  | {
      kind: "video";
      videoUrl: string;
      /** A capa (o `display_url` do vídeo). */
      posterUrl: string | null;
      width: number | null;
      height: number | null;
      durationSec: number | null;
    };

export type ParsedEmbed =
  | {
      ok: true;
      /** O primeiro slide: foto ou vídeo. */
      media: ParsedMedia;
      caption: string | null;
      username: string | null;
      /** Quantos slides tinha (1 fora de carrossel). */
      slides: number;
    }
  /** `video`: é vídeo, mas o embed não entregou a URL dele. */
  | { ok: false; reason: "video" | "not-found" };

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Desfaz `&amp;`, `&#064;`, `&#x1F92F;` e afins — o HTML do embed escapa até o `@`. */
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Tira as tags, vira `<br>` em quebra de linha e limpa o excesso de linhas vazias. */
function htmlToPlainText(fragment: string): string {
  const text = fragment
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(text)
    .replace(/\r/g, "")
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface MediaNode {
  typename: string | null;
  isVideo: boolean;
  displayUrl: string | null;
  videoUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

interface EmbedContext {
  media: MediaNode;
  children: MediaNode[];
  caption: string | null;
  username: string | null;
}

function toNode(raw: unknown): MediaNode {
  const node = (raw ?? {}) as Record<string, unknown>;
  const dims = (node.dimensions ?? {}) as { width?: unknown; height?: unknown };
  return {
    typename: typeof node.__typename === "string" ? node.__typename : null,
    isVideo: node.is_video === true,
    displayUrl: typeof node.display_url === "string" ? node.display_url : null,
    videoUrl: typeof node.video_url === "string" ? node.video_url : null,
    width: num(dims.width),
    height: num(dims.height),
    duration: num(node.video_duration),
  };
}

/** Foto ou vídeo de um nó do JSON; sem imagem no JSON, cai na do HTML. */
function mediaFrom(node: MediaNode, html: string): ParsedMedia | { error: "video" | "not-found" } {
  if (node.isVideo || node.typename === "GraphVideo") {
    if (!node.videoUrl) return { error: "video" };
    return {
      kind: "video",
      videoUrl: node.videoUrl,
      posterUrl: node.displayUrl,
      width: node.width,
      height: node.height,
      durationSec: node.duration,
    };
  }
  const imageUrl = node.displayUrl ?? imageFromHtml(html);
  if (!imageUrl) return { error: "not-found" };
  return { kind: "photo", imageUrl };
}

/**
 * O embed de carrossel e de vídeo traz um `contextJSON` (JSON escapado dentro de JSON)
 * com o `shortcode_media` do GraphQL. Post de foto única costuma vir sem ele.
 */
function parseContextJson(html: string): EmbedContext | null {
  const match = /"contextJSON":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (!match) return null;

  let context: Record<string, unknown>;
  try {
    const raw = JSON.parse(`"${match[1]}"`) as string;
    context = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const gql = (context.gql_data ?? context) as Record<string, unknown>;
  const media = gql.shortcode_media as Record<string, unknown> | undefined;
  if (!media) return null;

  const edges = (media.edge_sidecar_to_children as { edges?: { node: unknown }[] } | undefined)
    ?.edges;
  const captionEdges = (
    media.edge_media_to_caption as { edges?: { node?: { text?: unknown } }[] } | undefined
  )?.edges;
  const captionText = captionEdges?.[0]?.node?.text;
  const owner = media.owner as { username?: unknown } | undefined;

  return {
    media: toNode(media),
    children: Array.isArray(edges) ? edges.map((edge) => toNode(edge.node)) : [],
    caption: typeof captionText === "string" && captionText.trim() ? captionText.trim() : null,
    username: typeof owner?.username === "string" ? owner.username : null,
  };
}

function imageFromHtml(html: string): string | null {
  const match = /<img[^>]*class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i.exec(html);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function usernameFromHtml(html: string): string | null {
  const byLink = /<a[^>]*class="CaptionUsername"[^>]*>([^<]+)<\/a>/i.exec(html);
  if (byLink) return decodeHtmlEntities(byLink[1]).trim() || null;
  const byAlt =
    /class="EmbeddedMediaImage"[^>]*alt="[^"]*shared by (?:&#064;|@)([A-Za-z0-9_.]+)/i.exec(html);
  return byAlt ? byAlt[1] : null;
}

function captionFromHtml(html: string): string | null {
  const start = html.indexOf('class="Caption"');
  if (start < 0) return null;
  // Corta antes da tag dos comentários (o `<div` dela começa antes do `class=`).
  const comments = html.indexOf('class="CaptionComments', start);
  const end = comments > 0 ? html.lastIndexOf("<", comments) : start + 20_000;
  const block = html.slice(start, end);
  // O nome do perfil abre a legenda como link; ele vai pra `username`, não pro texto.
  const withoutUser = block.replace(/<a[^>]*class="CaptionUsername"[^>]*>[^<]*<\/a>/i, "");
  const text = htmlToPlainText(withoutUser.replace(/^[^>]*>/, ""));
  return text || null;
}

/**
 * Lê a página de embed. Foto única, carrossel (primeiro slide, foto ou vídeo), reel e
 * a legenda. "Sem mídia nenhuma" vira `not-found` (post privado, apagado ou HTML que
 * mudou); vídeo sem URL no JSON vira `video`.
 */
export function parseInstagramEmbed(html: string): ParsedEmbed {
  const context = parseContextJson(html);
  const username = context?.username ?? usernameFromHtml(html);
  const caption = context?.caption ?? captionFromHtml(html);

  if (context) {
    const { media, children } = context;
    const first = children.length > 0 ? children[0] : media;
    const result = mediaFrom(first, html);
    if ("error" in result) return { ok: false, reason: result.error };
    return { ok: true, media: result, caption, username, slides: children.length || 1 };
  }

  // Sem JSON é foto única (vídeo sempre vem com JSON), desde que o HTML tenha a
  // imagem e nenhum sinal de vídeo.
  if (/EmbeddedMediaVideo|class="EmbedPlayButton"|WatchOnInstagram/.test(html)) {
    return { ok: false, reason: "video" };
  }
  const imageUrl = imageFromHtml(html);
  if (!imageUrl) return { ok: false, reason: "not-found" };
  return { ok: true, media: { kind: "photo", imageUrl }, caption, username, slides: 1 };
}

/** Legenda cabe no post? Passou do limite, corta e avisa com reticências. */
export function clampCaption(caption: string, max: number): string {
  const clean = caption.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace >= (max - 1) * 0.8 ? cut.slice(0, lastSpace) : cut;
  return `${kept.trimEnd()}…`;
}
