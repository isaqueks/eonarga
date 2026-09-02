import sanitizeHtml from "sanitize-html";

/**
 * Sanitização do HTML das avaliações (docs/05 — "XSS via editor").
 *
 * A limpeza acontece **na gravação**: o que está no banco já é seguro e o render
 * usa `dangerouslySetInnerHTML` sem pensar duas vezes.
 */

/** Tags que o editor pode produzir. Qualquer outra vira só o texto de dentro. */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "s",
  "u",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "img",
  "code",
  "pre",
] as const;

/** Imagem só sai do nosso próprio proxy de upload; nada de host externo nem `data:`. */
const UPLOAD_PREFIX = "/api/uploads/";

/** Caminho relativo simples: sem espaço, sem aspas, sem `..`, sem `//` no começo. */
const SAFE_PATH = /^[A-Za-z0-9/_.\-~%?=&]+$/;

function isSafeImageSrc(src: string): boolean {
  if (!src.startsWith(UPLOAD_PREFIX)) return false;
  if (src.includes("..")) return false;
  return SAFE_PATH.test(src);
}

/** Só `http:`, `https:` e `mailto:` (docs/05). Nada de `javascript:`, `data:` ou `//host`. */
function isSafeHref(href: string): boolean {
  return /^(?:https?|mailto):/i.test(href.trim());
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  // Sem atributo global: `style`, `class`, `id` e todo `on*` caem aqui.
  allowedAttributes: {
    a: ["href", "rel", "target"],
    img: ["src", "alt", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  // O conteúdo dessas some junto com a tag (senão `<script>alert(1)</script>`
  // viraria o texto "alert(1)" no meio da avaliação).
  nonTextTags: [
    "script",
    "style",
    "textarea",
    "option",
    "xmp",
    "noscript",
    "iframe",
    "svg",
    "math",
    "template",
    "title",
    "noembed",
  ],
  transformTags: {
    // Todo link sai igual: só o href aprovado, sempre em nova aba e sem `window.opener`.
    a: (_tagName, attribs) => {
      const href = typeof attribs.href === "string" ? attribs.href.trim() : "";
      return {
        tagName: "a",
        attribs: {
          ...(href && isSafeHref(href) ? { href } : {}),
          rel: "noopener noreferrer",
          target: "_blank",
        },
      };
    },
    img: (_tagName, attribs) => {
      const src = typeof attribs.src === "string" ? attribs.src.trim() : "";
      const attrs: Record<string, string> = {};
      if (src && isSafeImageSrc(src)) attrs.src = src;
      if (typeof attribs.alt === "string") attrs.alt = attribs.alt;
      // Largura/altura só se forem número puro (evita `width="100%;expression(...)"`).
      for (const key of ["width", "height"] as const) {
        const value = attribs[key];
        if (typeof value === "string" && /^\d{1,5}$/.test(value)) attrs[key] = value;
      }
      return { tagName: "img", attribs: attrs };
    },
  },
  exclusiveFilter: (frame) => {
    // Sem src válido não sobra imagem nenhuma; sem href, o link vira texto puro.
    if (frame.tag === "img") return !frame.attribs.src;
    if (frame.tag === "a" && !frame.attribs.href) return "excludeTag";
    return false;
  },
};

/** HTML do editor → HTML seguro. Allowlist do docs/05. */
export function sanitizeReviewHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, OPTIONS).trim();
}

/** Tags que separam parágrafos: viram espaço em branco no texto puro. */
const BLOCK_TAGS =
  /<\/?(?:p|br|div|h[1-6]|ul|ol|li|blockquote|pre|hr|tr|td|th|section|article)\b[^>]*>/gi;

/** Tags cujo conteúdo não é texto de leitura. */
const HIDDEN_BLOCKS = /<(script|style|textarea|title|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return (
    text
      .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
      .replace(
        /&(lt|gt|quot|apos|nbsp);/gi,
        (_m, name: string) => NAMED_ENTITIES[name.toLowerCase()],
      )
      // `&amp;` por último: `&amp;lt;` tem que virar o texto "&lt;", não "<".
      .replace(/&amp;/gi, "&")
  );
}

/** Texto puro do HTML (pra contar caracteres e pra prévia). */
export function htmlToText(html: string): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(HIDDEN_BLOCKS, " ")
      // Tag aberta sem fechar no fim da string: engole o resto.
      .replace(/<(?:script|style|textarea|title|noscript|template)\b[\s\S]*$/i, " ")
      .replace(BLOCK_TAGS, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}
