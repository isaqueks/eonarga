import { VideoTooBigError } from "@/lib/video-storage";

/**
 * Buscas na rede das importações (Instagram, TikTok): sempre com prazo, teto de
 * tamanho e `redirect: "manual"` — o Instagram redireciona post inexistente pro login,
 * a CDN não redireciona nunca, e link curto do TikTok é seguido na mão, hop a hop, com
 * a lista de hosts permitidos (anti-SSRF, docs/05).
 */

export interface RemoteRequest {
  userAgent: string;
  accept: string;
  /** Cabeçalhos extras (`referer`, `cookie`), quando a CDN exige. */
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export const PAGE_TIMEOUT_MS = 10_000;
/** Um reel de 40 MB numa conexão de VPS leva alguns segundos; 90 s é folga. */
export const MEDIA_TIMEOUT_MS = 90_000;

function headersFor(request: RemoteRequest): Record<string, string> {
  return {
    "user-agent": request.userAgent,
    "accept-language": "pt-BR,pt;q=0.9",
    accept: request.accept,
    ...(request.headers ?? {}),
  };
}

export interface FetchedPage {
  bytes: Buffer;
  /** Os `Set-Cookie` da resposta, já só com `nome=valor` (o TikTok exige de volta). */
  cookies: string[];
}

/** Busca inteira em memória, com prazo e teto. Qualquer status fora de 2xx lança. */
export async function fetchPage(
  url: string,
  maxBytes: number,
  request: RemoteRequest,
): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? PAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      signal: controller.signal,
      headers: headersFor(request),
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
    const cookies = (response.headers.getSetCookie?.() ?? [])
      .map((cookie) => cookie.split(";")[0].trim())
      .filter((cookie) => cookie.includes("="));
    return { bytes: Buffer.concat(chunks), cookies };
  } finally {
    clearTimeout(timer);
  }
}

/** `fetchPage` sem os cookies: o que a maioria das buscas precisa. */
export async function fetchLimited(
  url: string,
  maxBytes: number,
  request: RemoteRequest,
): Promise<Buffer> {
  return (await fetchPage(url, maxBytes, request)).bytes;
}

/**
 * Abre a resposta de um vídeo pra gravar em stream (`saveVideoStream` cuida do teto
 * de verdade; aqui só o `content-length` declarado é conferido, pra nem começar).
 */
export async function openStream(
  url: string,
  maxBytes: number,
  request: RemoteRequest,
): Promise<{ body: ReadableStream<Uint8Array>; done: () => void }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? MEDIA_TIMEOUT_MS);
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
    signal: controller.signal,
    headers: headersFor(request),
  }).catch((error) => {
    clearTimeout(timer);
    throw error;
  });
  if (!response.ok || !response.body) {
    clearTimeout(timer);
    throw new Error(`status ${response.status}`);
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    clearTimeout(timer);
    await response.body.cancel().catch(() => {});
    throw new VideoTooBigError();
  }
  return { body: response.body, done: () => clearTimeout(timer) };
}

/**
 * Segue redirects na mão até `maxHops`, aceitando só destinos que `allow` aprovar.
 * Devolve a URL final: a que respondeu 2xx, ou a primeira que `stop` reconhecer (aí nem
 * é buscada — quem chama já sabe o que fazer com ela). Destino fora da lista, hop
 * demais ou status estranho lançam.
 */
export async function resolveRedirects(
  url: string,
  request: RemoteRequest,
  options: { maxHops: number; allow: (next: string) => boolean; stop?: (next: string) => boolean },
): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= options.maxHops; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? PAGE_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal,
        headers: headersFor(request),
      });
      await response.body?.cancel().catch(() => {});
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("redirect sem destino");
        const next = new URL(location, current).href;
        if (!options.allow(next)) throw new Error("redirect fora da lista");
        if (options.stop?.(next)) return next;
        current = next;
        continue;
      }
      if (!response.ok) throw new Error(`status ${response.status}`);
      return current;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("redirects demais");
}
