import { describe, expect, it } from "vitest";

import {
  bayesianScore,
  globalMean,
  isApprovedByNarga,
  rank,
  ratingToStars,
  starsToRating,
} from "./ranking";

describe("conversão de nota", () => {
  it("2..10 vira 1,0..5,0", () => {
    expect(ratingToStars(2)).toBe(1);
    expect(ratingToStars(9)).toBe(4.5);
    expect(ratingToStars(10)).toBe(5);
  });

  it("estrelas viram inteiro em meios pontos, com clamp", () => {
    expect(starsToRating(4.5)).toBe(9);
    expect(starsToRating(4.3)).toBe(9);
    expect(starsToRating(0)).toBe(2);
    expect(starsToRating(7)).toBe(10);
  });
});

describe("média bayesiana", () => {
  it("uma nota 5 não vence vinte notas 4,7", () => {
    const m = 4;
    const single = bayesianScore(5, 1, m);
    const many = bayesianScore(4.7 * 20, 20, m);
    expect(many).toBeGreaterThan(single);
  });

  it("sem avaliações devolve a média global", () => {
    expect(bayesianScore(0, 0, 3.7)).toBe(3.7);
  });

  it("converge pra média simples com muitas avaliações", () => {
    const s = bayesianScore(4.2 * 1000, 1000, 3);
    expect(s).toBeCloseTo(4.2, 2);
  });
});

describe("selo aprovado pelo narga", () => {
  it("exige média ≥ 4,5 e pelo menos 3 avaliações", () => {
    expect(isApprovedByNarga(4.5, 3)).toBe(true);
    expect(isApprovedByNarga(5, 2)).toBe(false);
    expect(isApprovedByNarga(4.4, 10)).toBe(false);
  });
});

describe("rank", () => {
  it("ordena por score, desempata por quantidade e nome, e numera", () => {
    const items = [
      { name: "Zé", sumOfStars: 5, count: 1, lastReviewAt: "2026-09-01" },
      { name: "Ana", sumOfStars: 4.7 * 6, count: 6, lastReviewAt: "2026-08-01" },
      { name: "Bia", sumOfStars: 4.7 * 6, count: 6, lastReviewAt: "2026-08-15" },
      { name: "Vazio", sumOfStars: 0, count: 0, lastReviewAt: null },
    ];
    const r = rank(items, 4);
    expect(r.map((x) => x.item.name)).toEqual(["Bia", "Ana", "Zé"]);
    expect(r.map((x) => x.position)).toEqual([1, 2, 3]);
    expect(r[0].mean).toBeCloseTo(4.7);
    expect(r[0].approved).toBe(true);
    expect(r[2].approved).toBe(false);
  });

  it("média global cai pra 3 sem dados", () => {
    expect(globalMean(0, 0)).toBe(3);
    expect(globalMean(9, 2)).toBe(4.5);
  });
});
