import { describe, expect, it } from "vitest";

import { formatDayMonth, relativeFromNow, todayISODate } from "./dates";

describe("todayISODate", () => {
  it("usa o fuso de Floripa, não o UTC", () => {
    // 03/09/2026 00:30 UTC ainda é 02/09 em Floripa (UTC-3).
    expect(todayISODate(new Date("2026-09-03T00:30:00Z"))).toBe("2026-09-02");
  });

  it("vira o dia depois das 03h UTC", () => {
    expect(todayISODate(new Date("2026-09-03T03:30:00Z"))).toBe("2026-09-03");
  });

  it("zero à esquerda no mês e no dia", () => {
    expect(todayISODate(new Date("2026-01-05T15:00:00Z"))).toBe("2026-01-05");
  });
});

describe("relativeFromNow", () => {
  const now = new Date("2026-09-02T12:00:00Z");

  it("dias em pt-BR com prefixo", () => {
    expect(relativeFromNow("2026-08-31T12:00:00Z", now)).toBe("há 2 dias");
  });

  it("menos de um minuto", () => {
    expect(relativeFromNow("2026-09-02T11:59:50Z", now)).toBe("há menos de um minuto");
  });

  it("data inválida não explode", () => {
    expect(relativeFromNow("nada disso", now)).toBe("");
  });
});

describe("formatDayMonth", () => {
  it("dia/mês sem voltar um dia pelo fuso", () => {
    expect(formatDayMonth("2026-08-12")).toBe("12/08");
    expect(formatDayMonth("2026-01-01")).toBe("01/01");
  });

  it("data inválida não explode", () => {
    expect(formatDayMonth("")).toBe("");
  });
});
