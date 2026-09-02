/**
 * Sorteio do rolê (docs/01 — "Sortear rolê"). Puro, com o gerador injetável pra
 * dar pra testar; o padrão é `crypto.getRandomValues`, que existe no navegador e
 * no Node. `Math.random` não: numa roleta que decide onde a galera vai, alguém ia
 * acusar de ser viciada.
 */

/** Float em [0,1) a partir de 32 bits do CSPRNG. */
export function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 4_294_967_296;
}

/** Índice em [0, size). Devolve -1 quando não há de onde tirar. */
export function randomIndex(size: number, random: () => number = cryptoRandom): number {
  if (size <= 0) return -1;
  const raw = Math.floor(random() * size);
  // Gerador mal-comportado (ou o 1 exato) não pode estourar o array.
  return Math.min(size - 1, Math.max(0, raw));
}

/**
 * Sorteia um candidato evitando `avoidId` (o "de novo" não pode cair no mesmo).
 * Se o único candidato for justamente o que se queria evitar, repete — melhor
 * que devolver nada.
 */
export function pickRandom<T extends { id: string }>(
  candidates: readonly T[],
  avoidId?: string | null,
  random: () => number = cryptoRandom,
): T | null {
  if (candidates.length === 0) return null;

  const pool = avoidId ? candidates.filter((candidate) => candidate.id !== avoidId) : candidates;
  const from = pool.length > 0 ? pool : candidates;

  return from[randomIndex(from.length, random)] ?? null;
}
