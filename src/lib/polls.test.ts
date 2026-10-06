import { describe, expect, it } from "vitest";

import {
  barFraction,
  nextVotes,
  parsePollOptions,
  POLL_DUPLICATE,
  POLL_FEW_OPTIONS,
  POLL_MAX_OPTIONS,
  POLL_OPTION_MAX,
  POLL_OPTION_TOO_LONG,
  POLL_TOO_MANY,
  votersLabel,
  votesLabel,
} from "./polls";

describe("parsePollOptions", () => {
  it("apara, joga fora as vazias e mantém a ordem", () => {
    expect(parsePollOptions(["  Menta ", "", "Uva   com  gelo", "   "])).toEqual({
      ok: true,
      options: ["Menta", "Uva com gelo"],
    });
  });

  it("exige pelo menos duas e no máximo doze", () => {
    expect(parsePollOptions([])).toEqual({ ok: false, error: POLL_FEW_OPTIONS });
    expect(parsePollOptions(["Só uma", ""])).toEqual({ ok: false, error: POLL_FEW_OPTIONS });
    const many = Array.from({ length: POLL_MAX_OPTIONS + 1 }, (_, i) => `Opção ${i + 1}`);
    expect(parsePollOptions(many)).toEqual({ ok: false, error: POLL_TOO_MANY });
    expect(parsePollOptions(many.slice(0, POLL_MAX_OPTIONS))).toMatchObject({ ok: true });
  });

  it("recusa opção comprida demais e opção repetida (sem ligar pra caixa e espaço)", () => {
    expect(parsePollOptions(["ok", "x".repeat(POLL_OPTION_MAX + 1)])).toEqual({
      ok: false,
      error: POLL_OPTION_TOO_LONG,
    });
    expect(parsePollOptions(["ok", "x".repeat(POLL_OPTION_MAX)])).toMatchObject({ ok: true });
    expect(parsePollOptions(["Sim", "não", " SIM "])).toEqual({
      ok: false,
      error: POLL_DUPLICATE,
    });
  });

  it("o que não é texto (arquivo no FormData, por exemplo) conta como vazio", () => {
    expect(parsePollOptions(["a", 42, null, "b"])).toEqual({ ok: true, options: ["a", "b"] });
  });
});

describe("nextVotes", () => {
  it("uma resposta só: o toque troca o voto, e tocar na minha tira", () => {
    expect(nextVotes([], "a", false)).toEqual(["a"]);
    expect(nextVotes(["a"], "b", false)).toEqual(["b"]);
    expect(nextVotes(["a"], "a", false)).toEqual([]);
    // Sobra de uma corrida (dois votos gravados) se conserta no toque seguinte.
    expect(nextVotes(["a", "b"], "c", false)).toEqual(["c"]);
  });

  it("várias respostas: o toque liga e desliga só aquela opção", () => {
    expect(nextVotes([], "a", true)).toEqual(["a"]);
    expect(nextVotes(["a"], "b", true)).toEqual(["a", "b"]);
    expect(nextVotes(["a", "b"], "a", true)).toEqual(["b"]);
  });
});

describe("barFraction", () => {
  it("a mais votada enche a barra e as outras são proporcionais a ela", () => {
    expect(barFraction(4, 4)).toBe(1);
    expect(barFraction(1, 4)).toBe(0.25);
    expect(barFraction(0, 4)).toBe(0);
    expect(barFraction(0, 0)).toBe(0);
    expect(barFraction(5, 4)).toBe(1);
  });
});

describe("rótulos", () => {
  it("votos e pessoas, no singular e no plural", () => {
    expect(votesLabel(0)).toBe("Nenhum voto");
    expect(votesLabel(1)).toBe("1 voto");
    expect(votesLabel(3)).toBe("3 votos");
    expect(votersLabel(0)).toBe("Ninguém votou ainda");
    expect(votersLabel(1)).toBe("1 pessoa votou");
    expect(votersLabel(4)).toBe("4 pessoas votaram");
  });
});
