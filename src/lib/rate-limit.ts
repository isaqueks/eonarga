/**
 * Rate limit de janela deslizante, em memória. Uma instância só (é o nosso caso);
 * se um dia virar duas, isso vira Redis. Serve pra segurar força bruta no login.
 */

export type RateLimitOptions = {
  /** Máximo de tentativas dentro da janela. */
  limit: number;
  /** Tamanho da janela em milissegundos. */
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Quanto falta pra próxima tentativa liberar. 0 quando `ok`. */
  retryAfterMs: number;
};

const buckets = new Map<string, number[]>();

/** Limpeza preguiçosa: a cada N chamadas varre o mapa e joga fora janelas vencidas. */
const SWEEP_EVERY = 200;
let callsSinceSweep = 0;

function sweep(now: number, windowMs: number) {
  for (const [key, hits] of buckets) {
    const alive = hits.filter((t) => now - t < windowMs);
    if (alive.length === 0) buckets.delete(key);
    else buckets.set(key, alive);
  }
}

/** Conta uma tentativa pra `key` e diz se ela passa. Chamar só quando a tentativa acontece. */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const { limit, windowMs } = options;
  const now = Date.now();

  if (++callsSinceSweep >= SWEEP_EVERY) {
    callsSinceSweep = 0;
    sweep(now, windowMs);
  }

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    const oldest = hits[0];
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, remaining: limit - hits.length, retryAfterMs: 0 };
}

/** Zera o contador de uma chave (ex.: login bem-sucedido). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Só pros testes. */
export function clearAllRateLimits(): void {
  buckets.clear();
  callsSinceSweep = 0;
}
