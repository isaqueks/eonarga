import { describe, expect, it } from "vitest";

import {
  normalizeTag,
  TAG_INVALID,
  TAG_MAX_LENGTH,
  TAG_MAX_PER_PLACE,
  TAG_MIN_LENGTH,
  TAG_TOO_MANY,
  tagListSchema,
  tagSchema,
} from "./tags";

describe("normalizeTag", () => {
  it("baixa a caixa e tira o acento", () => {
    expect(normalizeTag("Aceita PIX")).toBe("aceita pix");
    expect(normalizeTag("Café")).toBe("cafe");
    expect(normalizeTag("AÇÃO")).toBe("acao");
    expect(normalizeTag("Ótimo pra Ir à Noite")).toBe("otimo pra ir a noite");
  });

  it("colapsa espaço e apara as pontas", () => {
    expect(normalizeTag("  bom   e    barato  ")).toBe("bom e barato");
    expect(normalizeTag("\tfecha\ncedo ")).toBe("fecha cedo");
  });

  it("troca caractere inválido por espaço em vez de grudar as palavras", () => {
    expect(normalizeTag("bom & barato")).toBe("bom barato");
    expect(normalizeTag("aceita-pix!")).toBe("aceita pix");
    expect(normalizeTag("wi-fi 5g")).toBe("wi fi 5g");
    expect(normalizeTag("fecha cedo 😭")).toBe("fecha cedo");
  });

  it("recusa o que fica curto demais ou comprido demais", () => {
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("   ")).toBeNull();
    expect(normalizeTag("a")).toBeNull();
    expect(normalizeTag("!!!")).toBeNull();
    expect(normalizeTag("💨")).toBeNull();
    // Emoji sozinho não sobra nada; com texto junto, sobra o texto.
    expect(normalizeTag("💨 narga")).toBe("narga");

    expect(normalizeTag("a".repeat(TAG_MIN_LENGTH))).toBe("a".repeat(TAG_MIN_LENGTH));
    expect(normalizeTag("a".repeat(TAG_MAX_LENGTH))).toBe("a".repeat(TAG_MAX_LENGTH));
    expect(normalizeTag("a".repeat(TAG_MAX_LENGTH + 1))).toBeNull();
    // Texto absurdo nem chega a ser limpo.
    expect(normalizeTag("a".repeat(5000))).toBeNull();
  });

  it("aguenta entrada que não é string", () => {
    expect(normalizeTag(undefined as unknown as string)).toBeNull();
    expect(normalizeTag(42 as unknown as string)).toBeNull();
  });
});

describe("tagSchema", () => {
  it("devolve a tag normalizada", () => {
    expect(tagSchema.parse("  Aceita PIX ")).toBe("aceita pix");
  });

  it("reclama de tag inválida", () => {
    const result = tagSchema.safeParse("!");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(TAG_INVALID);
  });
});

describe("tagListSchema", () => {
  it("normaliza, deduplica e ordena", () => {
    expect(tagListSchema.parse(["Fecha cedo", "aceita pix", "FECHA CEDO", "Café"])).toEqual([
      "aceita pix",
      "cafe",
      "fecha cedo",
    ]);
  });

  it("aceita a lista vazia e o limite exato", () => {
    expect(tagListSchema.parse([])).toEqual([]);
    const cheia = Array.from({ length: TAG_MAX_PER_PLACE }, (_, i) => `tag ${i}`);
    expect(tagListSchema.parse(cheia)).toHaveLength(TAG_MAX_PER_PLACE);
  });

  it("recusa mais que o limite, contando depois do dedupe", () => {
    const demais = Array.from({ length: TAG_MAX_PER_PLACE + 1 }, (_, i) => `tag ${i}`);
    const result = tagListSchema.safeParse(demais);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(TAG_TOO_MANY);

    // Nove entradas, mas só oito tags diferentes: passa.
    expect(tagListSchema.parse([...demais.slice(0, TAG_MAX_PER_PLACE), "TAG 0"])).toHaveLength(
      TAG_MAX_PER_PLACE,
    );
  });
});
