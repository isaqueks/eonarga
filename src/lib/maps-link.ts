/**
 * Parser e resolvedor de links do Google Maps.
 *
 * O caminho principal de cadastro é "colar o link do compartilhar". Esse link
 * costuma ser um `maps.app.goo.gl/...` que só vira coordenada depois de seguir
 * os redirects — daí a parte de rede. Contra SSRF (ver docs/05): allowlist de
 * host revalidada a cada salto, no máximo 3 saltos, 5 s de timeout, sem
 * cookies e corpo lido só até 256 KB.
 */

export interface ParsedMapsLink {
  lat: number;
  lng: number;
  /** Nome do lugar, quando o link traz (`/place/<Nome>/`). */
  name: string | null;
  /** `0x...:0x...` do parâmetro `data`, ou o `query_place_id`. */
  placeId: string | null;
  /** A URL final (depois dos redirects) ou a própria URL. */
  canonicalUrl: string;
}

export const ALLOWED_MAPS_HOSTS = [
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "www.google.com",
  "google.com",
  "maps.google.com.br",
  "www.google.com.br",
] as const;

/** Hosts encurtadores: só eles justificam ir na rede. */
const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

/** Nesses o link tem que estar sob `/maps` (o resto do google.com não interessa). */
const MAPS_PATH_ONLY_HOSTS = new Set([
  "www.google.com",
  "google.com",
  "www.google.com.br",
  "google.com.br",
]);

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 256 * 1024;

const NUM = String.raw`-?\d+(?:\.\d+)?`;

/** Host na allowlist; em google.com/google.com.br o path precisa começar com `/maps`. */
export function isAllowedMapsUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const host = url.hostname.toLowerCase();
  if (!(ALLOWED_MAPS_HOSTS as readonly string[]).includes(host)) return false;

  if (MAPS_PATH_ONLY_HOSTS.has(host)) {
    return url.pathname === "/maps" || url.pathname.startsWith("/maps/");
  }
  return true;
}

function toUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

function validCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** "-27.5977,-48.5492" (com ou sem prefixo "loc:") → par de números. */
function parsePair(raw: string | null | undefined): [number, number] | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^loc:/i, "");
  const m = new RegExp(String.raw`^(${NUM})\s*,\s*(${NUM})$`).exec(cleaned);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return validCoords(lat, lng) ? [lat, lng] : null;
}

/** `!3dLAT!4dLNG`: as coordenadas do lugar em si, não as do enquadramento do mapa. */
function coordsFromData(href: string): [number, number] | null {
  const m = new RegExp(String.raw`!3d(${NUM})!4d(${NUM})`).exec(href);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return validCoords(lat, lng) ? [lat, lng] : null;
}

/** `/@lat,lng,17z`: o centro do mapa. Serve de último recurso. */
function coordsFromAt(pathname: string): [number, number] | null {
  const m = new RegExp(String.raw`@(${NUM}),(${NUM})`).exec(pathname);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return validCoords(lat, lng) ? [lat, lng] : null;
}

/** `/maps/place/Mercado+Publico/@...` → "Mercado Publico". */
function nameFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const i = segments.indexOf("place");
  if (i === -1) return null;

  const raw = segments[i + 1];
  if (!raw || raw.startsWith("@") || raw.startsWith("data=")) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    decoded = raw.replace(/\+/g, " ");
  }
  const name = decoded.trim();
  if (!name || name.startsWith("@")) return null;
  return name;
}

function placeIdFrom(url: URL): string | null {
  const m = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(url.href);
  if (m) return m[1];
  return url.searchParams.get("query_place_id") || null;
}

/**
 * Puro, sem rede. Entende `/place/Nome/@lat,lng,17z`, `data=...!3dLAT!4dLNG`
 * (preferido), `?q=`, `?ll=`, `?query=` e `/@lat,lng`. `null` quando não acha
 * coordenada nenhuma.
 */
export function parseGoogleMapsUrl(input: string): ParsedMapsLink | null {
  const url = toUrl(input);
  if (!url) return null;

  const params = url.searchParams;
  const coords =
    coordsFromData(url.href) ??
    parsePair(params.get("q")) ??
    parsePair(params.get("ll")) ??
    parsePair(params.get("query")) ??
    parsePair(params.get("center")) ??
    parsePair(params.get("destination")) ??
    coordsFromAt(url.pathname);

  if (!coords) return null;

  return {
    lat: coords[0],
    lng: coords[1],
    name: nameFromPath(url.pathname),
    placeId: placeIdFrom(url),
    canonicalUrl: url.toString(),
  };
}

/** Lê no máximo `MAX_BODY_BYTES` do corpo e descarta o resto. */
async function readLimitedText(res: Response): Promise<string> {
  const body = res.body as ReadableStream<Uint8Array> | null | undefined;

  if (!body || typeof body.getReader !== "function") {
    // Response de teste (ou runtime sem stream): confia no tamanho e corta.
    const text = await res.text();
    return text.slice(0, MAX_BODY_BYTES);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // já fechou; tanto faz
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged.subarray(0, MAX_BODY_BYTES));
}

function titleFromHtml(html: string): string | null {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const raw = og?.[1] ?? /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
  if (!raw) return null;
  const name = raw
    .replace(/\s*[-–—]\s*Google\s*Maps\s*$/i, "")
    .replace(/&amp;/g, "&")
    .trim();
  return name || null;
}

/**
 * Último recurso: o HTML do Maps traz as coordenadas no `og:image`
 * (`...center=lat%2Clng...`), no link canônico e às vezes num `"center"` do JS.
 */
function parseHtmlFallback(html: string, finalUrl: string): ParsedMapsLink | null {
  const canonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1];
  if (canonical) {
    const decoded = canonical.replace(/&amp;/g, "&");
    const canonicalUrl = toUrl(decoded);
    if (canonicalUrl && isAllowedMapsUrl(canonicalUrl)) {
      const parsed = parseGoogleMapsUrl(canonicalUrl.toString());
      if (parsed) return parsed;
    }
  }

  const patterns = [
    new RegExp(String.raw`!3d(${NUM})!4d(${NUM})`),
    new RegExp(String.raw`[?&;]center=(${NUM})(?:,|%2C)(${NUM})`, "i"),
    new RegExp(String.raw`["']center["']\s*:\s*\[?\s*(${NUM})\s*,\s*(${NUM})`),
    new RegExp(String.raw`[?&;]ll=(${NUM})(?:,|%2C)(${NUM})`, "i"),
    new RegExp(String.raw`@(${NUM}),(${NUM})`),
  ];

  for (const pattern of patterns) {
    const m = pattern.exec(html);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!validCoords(lat, lng)) continue;
    return {
      lat,
      lng,
      name: titleFromHtml(html),
      placeId: /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(html)?.[1] ?? null,
      canonicalUrl: finalUrl,
    };
  }

  return null;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Segue os redirects do link curto na mão (`redirect: "manual"`), revalidando
 * o host a cada salto. Devolve `null` em qualquer tropeço — quem chama traduz
 * pra "Não consegui ler esse link".
 */
export async function resolveGoogleMapsLink(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedMapsLink | null> {
  const url = toUrl(input);
  if (!url || !isAllowedMapsUrl(url)) return null;

  // Link completo já traz tudo: nem toca na rede.
  const direct = parseGoogleMapsUrl(url.toString());
  if (direct) return direct;

  // Só encurtador vale uma requisição; o resto seria fetch à toa.
  if (!SHORT_HOSTS.has(url.hostname.toLowerCase())) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let current = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal,
        headers: {
          // Sem UA de navegador o Google devolve uma página inútil.
          "user-agent":
            "Mozilla/5.0 (compatible; eonarga/0.1; +https://narga.schlutersolucoes.com.br)",
          "accept-language": "pt-BR,pt;q=0.9",
          accept: "text/html,application/xhtml+xml",
        },
      });

      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get("location");
        if (!location) return null;

        const next = toUrl(new URL(location, current).toString());
        if (!next || !isAllowedMapsUrl(next)) return null;

        const parsed = parseGoogleMapsUrl(next.toString());
        if (parsed) return parsed;

        current = next;
        continue;
      }

      if (!res.ok) return null;

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("html")) return null;

      const html = await readLimitedText(res);
      return parseHtmlFallback(html, current.toString());
    }

    // Estourou os 3 saltos.
    return null;
  } catch {
    // Timeout, DNS, host que caiu: pra quem chama é tudo "não deu".
    return null;
  } finally {
    clearTimeout(timer);
  }
}
