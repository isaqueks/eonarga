/**
 * O pedaço puro da assinatura de push (docs/08 #51): o formato que vai do navegador
 * pro servidor e a comparação de chaves VAPID. Sem banco nem `web-push`, porque o hook
 * do cliente (`components/pwa/use-push.ts`) importa daqui.
 */

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /**
   * A chave pública com que o navegador assinou (`options.applicationServerKey`), em
   * base64url. Null quando o navegador não expõe.
   */
  applicationServerKey?: string | null;
}

/** base64 e base64url, com ou sem `=`, comparam igual. */
export function normalizeKey(key: string): string {
  return key.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sameKey(a: string, b: string): boolean {
  return normalizeKey(a) === normalizeKey(b);
}
