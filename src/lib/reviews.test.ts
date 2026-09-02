import { describe, expect, it } from "vitest";

import {
  CONTENT_HTML_MAX,
  isReactionEmoji,
  RATING_ERROR,
  REACTION_EMOJIS,
  reviewInputSchema,
  VERDICT_ERROR,
  VERDICT_MAX,
  VISITED_AT_FUTURE,
  VISITED_AT_INVALID,
} from "./reviews";

const BASE = {
  placeId: "lugar-1",
  rating: "9",
  verdict: "Café bom, livro barato.",
  contentHtml: "<p>Voltaria.</p>",
  visitedAt: "",
};

function parse(overrides: Partial<Record<keyof typeof BASE, string>> = {}) {
  return reviewInputSchema.safeParse({ ...BASE, ...overrides });
}

/** Primeira mensagem de erro do campo. */
function errorOf(result: ReturnType<typeof parse>, path: string): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((i) => i.path[0] === path)?.message;
}

/** Ontem, hoje e amanhã em UTC (é o fuso que o schema usa). */
function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("reviewInputSchema", () => {
  it("aceita uma avaliação normal e devolve a nota como inteiro", () => {
    const result = parse();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      placeId: "lugar-1",
      rating: 9,
      verdict: "Café bom, livro barato.",
      contentHtml: "<p>Voltaria.</p>",
      visitedAt: null,
    });
  });

  it("aceita as pontas da nota e recusa o resto", () => {
    for (const rating of ["2", "5", "10"]) {
      expect(parse({ rating }).success, rating).toBe(true);
    }
    for (const rating of ["", "0", "1", "11", "4,5", "4.5", "abc", "-3"]) {
      const result = parse({ rating });
      expect(result.success, rating).toBe(false);
      expect(errorOf(result, "rating"), rating).toBe(RATING_ERROR);
    }
  });

  it("apara o veredito e cobra tamanho", () => {
    const trimmed = parse({ verdict: "  Bom demais.  " });
    expect(trimmed.success && trimmed.data.verdict).toBe("Bom demais.");

    expect(parse({ verdict: "a".repeat(VERDICT_MAX) }).success).toBe(true);

    for (const verdict of ["", "  ", "ok", "a".repeat(VERDICT_MAX + 1)]) {
      const result = parse({ verdict });
      expect(result.success, JSON.stringify(verdict)).toBe(false);
      expect(errorOf(result, "verdict")).toBe(VERDICT_ERROR);
    }
  });

  it("deixa o texto vazio passar e barra HTML gigante", () => {
    expect(parse({ contentHtml: "" }).success).toBe(true);
    expect(parse({ contentHtml: "x".repeat(CONTENT_HTML_MAX) }).success).toBe(true);

    const result = parse({ contentHtml: "x".repeat(CONTENT_HTML_MAX + 1) });
    expect(result.success).toBe(false);
    expect(errorOf(result, "contentHtml")).toContain("Texto longo demais");
  });

  it("trata a data da visita: vazio vira null, futuro reclama", () => {
    const vazio = parse({ visitedAt: "  " });
    expect(vazio.success && vazio.data.visitedAt).toBeNull();

    const ontem = parse({ visitedAt: isoOffset(-1) });
    expect(ontem.success && ontem.data.visitedAt).toBe(isoOffset(-1));

    const hoje = parse({ visitedAt: isoOffset(0) });
    expect(hoje.success).toBe(true);

    const amanha = parse({ visitedAt: isoOffset(2) });
    expect(amanha.success).toBe(false);
    expect(errorOf(amanha, "visitedAt")).toBe(VISITED_AT_FUTURE);

    for (const data of ["02/09/2026", "2026-9-2", "2026-02-31", "ontem", "2026-13-01"]) {
      const result = parse({ visitedAt: data });
      expect(result.success, data).toBe(false);
      expect(errorOf(result, "visitedAt"), data).toBe(VISITED_AT_INVALID);
    }
  });

  it("exige o lugar", () => {
    expect(parse({ placeId: "" }).success).toBe(false);
    expect(parse({ placeId: "   " }).success).toBe(false);
  });
});

describe("isReactionEmoji", () => {
  it("aceita só a lista fixa", () => {
    for (const emoji of REACTION_EMOJIS) expect(isReactionEmoji(emoji)).toBe(true);
    for (const emoji of ["🍕", "", "👍👍", "<script>", "👎"]) {
      expect(isReactionEmoji(emoji), emoji).toBe(false);
    }
  });
});
