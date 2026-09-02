import { describe, expect, it } from "vitest";

import { MAX_SLUG_LENGTH, slugify, SLUG_FALLBACK } from "./slug";

describe("slugify", () => {
  it("tira acento e deixa em kebab-case", () => {
    expect(slugify("Sebo do João")).toBe("sebo-do-joao");
    expect(slugify("Café Cultura")).toBe("cafe-cultura");
    expect(slugify("Açaí Ñoño")).toBe("acai-nono");
    expect(slugify("Mercado Público de Florianópolis")).toBe("mercado-publico-de-florianopolis");
  });

  it("junta pontuação e espaços num hífen só, sem sobrar nas pontas", () => {
    expect(slugify("  Bar  do   Zé!!!  ")).toBe("bar-do-ze");
    expect(slugify("---Loja---")).toBe("loja");
    expect(slugify("Box 32 / Mercado")).toBe("box-32-mercado");
    expect(slugify("Pão_de_Queijo")).toBe("pao-de-queijo");
  });

  it("transforma & em 'e'", () => {
    expect(slugify("Peixe & Cia")).toBe("peixe-e-cia");
  });

  it("corta em 60 caracteres sem deixar hífen no fim", () => {
    const slug = slugify("a".repeat(80));
    expect(slug).toHaveLength(MAX_SLUG_LENGTH);

    const cortado = slugify(`${"b".repeat(59)} restaurante`);
    expect(cortado.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(cortado.endsWith("-")).toBe(false);
    expect(cortado).toBe("b".repeat(59));
  });

  it("nunca devolve vazio", () => {
    expect(slugify("")).toBe(SLUG_FALLBACK);
    expect(slugify("   ")).toBe(SLUG_FALLBACK);
    expect(slugify("💨💨💨")).toBe(SLUG_FALLBACK);
    expect(slugify("!!!")).toBe(SLUG_FALLBACK);
    expect(slugify("日本語")).toBe(SLUG_FALLBACK);
  });

  it("é idempotente", () => {
    const once = slugify("Tabacaria do Centro");
    expect(slugify(once)).toBe(once);
  });

  it("só devolve caracteres seguros pra URL", () => {
    expect(slugify("Bar 100% Cerveja (Centro)")).toMatch(/^[a-z0-9-]+$/);
  });
});
