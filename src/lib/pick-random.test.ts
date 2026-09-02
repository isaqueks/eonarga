import { describe, expect, it } from "vitest";

import { cryptoRandom, pickRandom, randomIndex } from "./pick-random";

const A = { id: "a" };
const B = { id: "b" };
const C = { id: "c" };

/** Gerador falso: devolve os valores na ordem e depois repete o último. */
function fakeRandom(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("randomIndex", () => {
  it("mapeia [0,1) no intervalo dos índices", () => {
    expect(randomIndex(3, fakeRandom(0))).toBe(0);
    expect(randomIndex(3, fakeRandom(0.34))).toBe(1);
    expect(randomIndex(3, fakeRandom(0.99))).toBe(2);
  });

  it("não estoura o array nem com gerador torto", () => {
    expect(randomIndex(3, fakeRandom(1))).toBe(2);
    expect(randomIndex(3, fakeRandom(1.5))).toBe(2);
    expect(randomIndex(3, fakeRandom(-1))).toBe(0);
  });

  it("devolve -1 quando não tem de onde tirar", () => {
    expect(randomIndex(0)).toBe(-1);
    expect(randomIndex(-2)).toBe(-1);
  });
});

describe("pickRandom", () => {
  it("sorteia um candidato da lista", () => {
    expect(pickRandom([A, B, C], null, fakeRandom(0))).toBe(A);
    expect(pickRandom([A, B, C], null, fakeRandom(0.5))).toBe(B);
    expect(pickRandom([A, B, C], null, fakeRandom(0.9))).toBe(C);
  });

  it("nunca repete o último quando há alternativa", () => {
    // Com "a" fora, o índice 0 do pool é "b".
    expect(pickRandom([A, B, C], "a", fakeRandom(0))).toBe(B);
    expect(pickRandom([A, B, C], "a", fakeRandom(0.9))).toBe(C);

    for (let i = 0; i < 50; i++) {
      expect(pickRandom([A, B, C], "b")?.id).not.toBe("b");
    }
  });

  it("repete quando o único candidato é o que se queria evitar", () => {
    expect(pickRandom([A], "a", fakeRandom(0))).toBe(A);
  });

  it("devolve null com a lista vazia", () => {
    expect(pickRandom([], null, fakeRandom(0))).toBeNull();
  });

  it("usa o CSPRNG por padrão e fica no intervalo", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const picked = pickRandom([A, B, C]);
      expect(picked).not.toBeNull();
      seen.add(picked!.id);
    }
    // 200 sorteios entre 3: cair sempre no mesmo seria bug, não azar.
    expect(seen.size).toBe(3);
  });
});

describe("cryptoRandom", () => {
  it("fica em [0,1)", () => {
    for (let i = 0; i < 200; i++) {
      const value = cryptoRandom();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
