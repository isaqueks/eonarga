import { describe, expect, it } from "vitest";

import {
  GENDER_MAX_LENGTH,
  MEMBER_GENDERS,
  profileSchemaFor,
  TESTOSTERONE_MEMBER_MAX,
} from "./profile";

describe("perfil de membro", () => {
  const schema = profileSchemaFor("member");

  it("aceita gênero da lista e testosterona até o teto", () => {
    const r = schema.safeParse({ name: "Ana", gender: MEMBER_GENDERS[1], testosterone: "1200" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gender).toBe("transsexual");
      expect(r.data.testosterone).toBe(TESTOSTERONE_MEMBER_MAX);
    }
  });

  it("campo vazio vira null", () => {
    const r = schema.safeParse({ name: "Ana", gender: "", testosterone: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gender).toBeNull();
      expect(r.data.testosterone).toBeNull();
    }
  });

  it("rejeita gênero fora da lista", () => {
    const r = schema.safeParse({ name: "Ana", gender: "outro", testosterone: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita testosterona acima do teto, negativa ou com vírgula", () => {
    for (const value of ["1201", "-1", "10.5", "muita"]) {
      expect(schema.safeParse({ name: "Ana", gender: "", testosterone: value }).success).toBe(
        false,
      );
    }
  });
});

describe("perfil de admin", () => {
  const schema = profileSchemaFor("admin");

  it("gênero é texto livre e testosterona não tem teto", () => {
    const r = schema.safeParse({
      name: "Isaque",
      gender: "Alfa de Floripa",
      testosterone: "999999",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gender).toBe("Alfa de Floripa");
      expect(r.data.testosterone).toBe(999999);
    }
  });

  it("ainda limita o tamanho do texto e rejeita negativa", () => {
    expect(
      schema.safeParse({
        name: "Isaque",
        gender: "x".repeat(GENDER_MAX_LENGTH + 1),
        testosterone: "",
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ name: "Isaque", gender: "", testosterone: "-5" }).success).toBe(
      false,
    );
  });
});
