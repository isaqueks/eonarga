import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CAPTCHA_SETS, pickRandomSet } from "./sets";

const PUBLIC = path.join(process.cwd(), "public");

describe("catálogo de desafios", () => {
  it("tem desafio", () => {
    expect(CAPTCHA_SETS.length).toBeGreaterThan(0);
  });

  it("não repete id", () => {
    const ids = CAPTCHA_SETS.map((set) => set.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("grid9 tem 9 tiles principais mais os extras da rodada 'selecione também'", () => {
    for (const set of CAPTCHA_SETS.filter((s) => s.layout === "grid9")) {
      expect(set.tiles.length, set.id).toBeGreaterThanOrEqual(11);
    }
  });

  it("text e grid16 têm uma imagem só", () => {
    for (const set of CAPTCHA_SETS.filter((s) => s.layout !== "grid9")) {
      expect(set.tiles.length, set.id).toBe(1);
    }
  });

  it("todo tile tem alt e src absoluto", () => {
    for (const set of CAPTCHA_SETS) {
      for (const tile of set.tiles) {
        expect(tile.alt.trim(), `${set.id}: ${tile.src}`).not.toBe("");
        expect(tile.src.startsWith("/"), `${set.id}: ${tile.src}`).toBe(true);
      }
    }
  });

  it("todo src existe em public/", () => {
    const faltando: string[] = [];
    for (const set of CAPTCHA_SETS) {
      for (const tile of set.tiles) {
        if (!fs.existsSync(path.join(PUBLIC, tile.src))) faltando.push(`${set.id}: ${tile.src}`);
      }
    }
    expect(faltando).toEqual([]);
  });

  it("grid tem prompt e palavra-chave; o de texto dispensa a palavra-chave", () => {
    for (const set of CAPTCHA_SETS) {
      expect(set.prompt.trim(), set.id).not.toBe("");
      if (set.layout !== "text") expect(set.keyword.trim(), set.id).not.toBe("");
    }
  });
});

describe("pickRandomSet", () => {
  it("devolve sempre um set do catálogo", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(CAPTCHA_SETS).toContain(pickRandomSet());
    }
  });

  it("nunca devolve o id excluído", () => {
    for (const set of CAPTCHA_SETS) {
      for (let i = 0; i < 30; i += 1) {
        expect(pickRandomSet(set.id).id).not.toBe(set.id);
      }
    }
  });

  it("id desconhecido não quebra o sorteio", () => {
    expect(CAPTCHA_SETS).toContain(pickRandomSet("nao-existe"));
  });
});
