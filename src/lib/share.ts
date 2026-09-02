/**
 * Link público somente leitura de um lugar (docs/01, v2: "pra mandar pra alguém de fora").
 *
 * O token é um HMAC-SHA256 do id do lugar com o `APP_SECRET`: ninguém adivinha, não
 * precisa de tabela nova e o link vale pra sempre. Pra "revogar" tudo de uma vez, troca
 * o segredo. Sem `APP_SECRET` o recurso simplesmente não existe — a UI esconde o botão
 * e a página pública responde 404.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** 22 caracteres base64url = 132 bits do digest. Cabe num link sem ficar horrível. */
const TOKEN_LENGTH = 22;

function secret(): string | null {
  const value = process.env.APP_SECRET?.trim();
  return value ? value : null;
}

/** Lido a cada chamada de propósito: o env pode não estar pronto na hora do import. */
export function isSharingEnabled(): boolean {
  return secret() !== null;
}

/** Token do lugar, ou `null` quando não há `APP_SECRET` configurado. */
export function makeShareToken(placeId: string): string | null {
  const key = secret();
  if (!key || !placeId) return null;
  return createHmac("sha256", key)
    .update(`place:${placeId}`)
    .digest("base64url")
    .slice(0, TOKEN_LENGTH);
}

/**
 * Comparação em tempo constante. Token errado, de outro lugar, vazio ou sem segredo
 * configurado → `false`.
 */
export function verifyShareToken(placeId: string, token: string | null | undefined): boolean {
  const expected = makeShareToken(placeId);
  if (!expected || typeof token !== "string") return false;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token, "utf8");
  // `timingSafeEqual` explode com tamanhos diferentes; o tamanho não é segredo.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * URL pronta pra colar no WhatsApp. Sem `APP_URL` volta um caminho relativo (o cliente
 * resolve com a origem atual); sem `APP_SECRET`, `null`.
 */
export function shareUrlFor(slug: string, placeId: string): string | null {
  const token = makeShareToken(placeId);
  if (!token) return null;
  const base = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  return `${base}/p/${encodeURIComponent(slug)}?t=${token}`;
}
