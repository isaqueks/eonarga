import { describe, expect, it } from "vitest";

import {
  DUMMY_HASH,
  generateTempPassword,
  hashPassword,
  isWeakPassword,
  TEMP_PASSWORD_WORDS,
  verifyPassword,
} from "./password";

describe("hashPassword / verifyPassword", () => {
  it("gera um hash argon2id e valida a senha certa", async () => {
    const hash = await hashPassword("sebo-narga-praca-42");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "sebo-narga-praca-42")).toBe(true);
  });

  it("rejeita a senha errada", async () => {
    const hash = await hashPassword("sebo-narga-praca-42");
    expect(await verifyPassword(hash, "sebo-narga-praca-43")).toBe(false);
  });

  it("gera hashes diferentes pra mesma senha (salt aleatório)", async () => {
    const a = await hashPassword("mesma-senha-aqui");
    const b = await hashPassword("mesma-senha-aqui");
    expect(a).not.toBe(b);
  });

  it("não explode com hash inválido", async () => {
    expect(await verifyPassword("não é hash nenhum", "seja lá o que for")).toBe(false);
  });
});

describe("DUMMY_HASH", () => {
  it("é um hash argon2id válido que não bate com nada plausível", async () => {
    expect(DUMMY_HASH.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(DUMMY_HASH, "senha-qualquer")).toBe(false);
  });
});

describe("generateTempPassword", () => {
  it("gera 3 palavras da lista + número de 2 dígitos", () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateTempPassword();
      const parts = pw.split("-");
      expect(parts).toHaveLength(4);
      const words = parts.slice(0, 3);
      for (const w of words) {
        expect(TEMP_PASSWORD_WORDS as readonly string[]).toContain(w);
      }
      expect(new Set(words).size).toBe(3);
      expect(parts[3]).toMatch(/^\d{2}$/);
    }
  });

  it("sai só com ASCII minúsculo, dígitos e hífen", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateTempPassword()).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("não é considerada fraca", () => {
    for (let i = 0; i < 20; i++) {
      expect(isWeakPassword(generateTempPassword())).toBe(false);
    }
  });

  it("não repete (na prática) entre chamadas", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTempPassword()));
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe("isWeakPassword", () => {
  it("rejeita menos de 8 caracteres", () => {
    expect(isWeakPassword("abc123")).toBe(true);
    expect(isWeakPassword("1234567")).toBe(true);
  });

  it("rejeita senhas óbvias, ignorando caixa", () => {
    expect(isWeakPassword("12345678")).toBe(true);
    expect(isWeakPassword("senha123")).toBe(true);
    expect(isWeakPassword("PassWord")).toBe(true);
    expect(isWeakPassword("narga123")).toBe(true);
    expect(isWeakPassword("qwerty123")).toBe(true);
  });

  it("aceita uma senha razoável", () => {
    expect(isWeakPassword("cachorro-assustado-9")).toBe(false);
    expect(isWeakPassword("eonarga2026!")).toBe(false);
  });
});
