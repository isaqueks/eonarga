import { describe, expect, it } from "vitest";

import { formatInteger, formatNames, formatStars } from "./format";

describe("formatInteger", () => {
  it("põe ponto de milhar", () => {
    expect(formatInteger(0)).toBe("0");
    expect(formatInteger(999)).toBe("999");
    expect(formatInteger(1000)).toBe("1.000");
    expect(formatInteger(99999999)).toBe("99.999.999");
    expect(formatInteger(7000000000000)).toBe("7.000.000.000.000");
  });

  it("aguenta o teto do admin (Number.MAX_SAFE_INTEGER) sem virar notação científica", () => {
    expect(formatInteger(Number.MAX_SAFE_INTEGER)).toBe("9.007.199.254.740.991");
  });

  it("trunca decimal e mantém o sinal", () => {
    expect(formatInteger(1234.9)).toBe("1.234");
    expect(formatInteger(-1234)).toBe("-1.234");
  });
});

describe("formatStars", () => {
  it("uma casa com vírgula", () => {
    expect(formatStars(4.5)).toBe("4,5");
    expect(formatStars(4.25)).toBe("4,3");
    expect(formatStars(5)).toBe("5,0");
  });
});

describe("formatNames", () => {
  it("junta com vírgula e 'e'", () => {
    expect(formatNames([])).toBe("");
    expect(formatNames(["Ana"])).toBe("Ana");
    expect(formatNames(["Ana", "Bia"])).toBe("Ana e Bia");
    expect(formatNames(["Ana", "Bia", "Caio"])).toBe("Ana, Bia e Caio");
  });
});
