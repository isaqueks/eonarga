/**
 * Ranking por média bayesiana (ver docs/03-modelo-de-dados.md#ranking).
 *
 * Notas são guardadas como inteiros 2..10 (meios pontos). As funções aqui
 * trabalham em "estrelas" (1,0..5,0) pra ficar legível.
 */

/** Peso do prior: "até ter 3 avaliações, desconfio". */
export const PRIOR_WEIGHT = 3;

export const APPROVED_MIN_MEAN = 4.5;
export const APPROVED_MIN_COUNT = 3;

/** 2..10 → 1,0..5,0 */
export function ratingToStars(rating: number): number {
  return rating / 2;
}

/** 1,0..5,0 → 2..10 (arredonda pro meio ponto mais próximo) */
export function starsToRating(stars: number): number {
  const r = Math.round(stars * 2);
  return Math.min(10, Math.max(2, r));
}

export function bayesianScore(
  sumOfStars: number,
  count: number,
  globalMeanStars: number,
  priorWeight: number = PRIOR_WEIGHT,
): number {
  if (count <= 0) return globalMeanStars;
  return (priorWeight * globalMeanStars + sumOfStars) / (priorWeight + count);
}

export function isApprovedByNarga(meanStars: number, count: number): boolean {
  return count >= APPROVED_MIN_COUNT && meanStars >= APPROVED_MIN_MEAN;
}

export interface Rankable {
  name: string;
  sumOfStars: number;
  count: number;
  /** ISO date da avaliação mais recente */
  lastReviewAt: string | null;
}

export interface Ranked<T extends Rankable> {
  item: T;
  position: number;
  score: number;
  mean: number;
  approved: boolean;
}

/**
 * Ordena por score bayesiano desc, depois nº de avaliações desc, depois
 * avaliação mais recente, depois nome. Itens sem avaliação ficam de fora
 * (vão pra "Ainda sem nota").
 */
export function rank<T extends Rankable>(items: T[], globalMeanStars: number): Ranked<T>[] {
  const scored = items
    .filter((i) => i.count > 0)
    .map((item) => {
      const mean = item.sumOfStars / item.count;
      return {
        item,
        position: 0,
        score: bayesianScore(item.sumOfStars, item.count, globalMeanStars),
        mean,
        approved: isApprovedByNarga(mean, item.count),
      };
    });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.item.count !== a.item.count) return b.item.count - a.item.count;
    const la = a.item.lastReviewAt ?? "";
    const lb = b.item.lastReviewAt ?? "";
    if (lb !== la) return lb.localeCompare(la);
    return a.item.name.localeCompare(b.item.name, "pt-BR");
  });

  return scored.map((s, i) => ({ ...s, position: i + 1 }));
}

/** Média global de estrelas a partir de (soma, n) agregados; 3,0 quando não há nada. */
export function globalMean(totalStars: number, totalCount: number): number {
  return totalCount > 0 ? totalStars / totalCount : 3;
}
