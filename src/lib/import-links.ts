/**
 * O que dá pra importar de um link colado (ou que chegou pelo "Compartilhar"): post ou
 * reel do Instagram, vídeo ou carrossel do TikTok. Um só ponto de decisão, usado pelo
 * formulário e pelo card ("de onde veio").
 */

import { extractInstagramLink } from "@/lib/instagram";
import { extractTikTokLink } from "@/lib/tiktok";

export type ImportProvider = "instagram" | "tiktok";

export interface ImportLink {
  provider: ImportProvider;
  /** O link como vai pra action (canônico no Instagram; no TikTok pode ser o curto). */
  url: string;
}

/** O primeiro link importável do texto; o que aparece antes ganha. */
export function detectImportLink(text: string): ImportLink | null {
  const ig = extractInstagramLink(text);
  const tt = extractTikTokLink(text);
  if (ig && tt) {
    return text.indexOf(ig.url.slice(0, 20)) <= text.indexOf(tt.url.slice(0, 20))
      ? { provider: "instagram", url: ig.url }
      : { provider: "tiktok", url: tt.url };
  }
  if (ig) return { provider: "instagram", url: ig.url };
  if (tt) return { provider: "tiktok", url: tt.url };
  return null;
}

export interface SourceProvider {
  emoji: string;
  name: string;
}

/** Como o card chama a origem de um post importado: "📸 … no Instagram", "🎵 … no TikTok". */
export function sourceProvider(url: string): SourceProvider {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return { emoji: "🎵", name: "TikTok" };
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return { emoji: "📸", name: "Instagram" };
  }
  return { emoji: "🔗", name: host || "outro lugar" };
}
