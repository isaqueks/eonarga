import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, clearAllRateLimits, resetRateLimit } from "./rate-limit";

const opts = { limit: 5, windowMs: 15 * 60_000 };

beforeEach(() => {
  clearAllRateLimits();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("libera até o limite e barra depois", () => {
    for (let i = 0; i < opts.limit; i++) {
      const r = checkRateLimit("a@b.com:1.2.3.4", opts);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(opts.limit - 1 - i);
    }
    const blocked = checkRateLimit("a@b.com:1.2.3.4", opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(opts.windowMs);
  });

  it("conta cada chave separadamente", () => {
    for (let i = 0; i < opts.limit; i++) checkRateLimit("um", opts);
    expect(checkRateLimit("um", opts).ok).toBe(false);
    expect(checkRateLimit("dois", opts).ok).toBe(true);
  });

  it("é janela deslizante: libera conforme as tentativas antigas vencem", () => {
    for (let i = 0; i < opts.limit; i++) {
      checkRateLimit("desliza", opts);
      vi.advanceTimersByTime(60_000); // uma por minuto
    }
    // 5 tentativas nos últimos 5 minutos: barrado.
    expect(checkRateLimit("desliza", opts).ok).toBe(false);

    // Passando de 15 min da primeira, ela sai da janela e abre uma vaga.
    vi.advanceTimersByTime(11 * 60_000);
    const r = checkRateLimit("desliza", opts);
    expect(r.ok).toBe(true);
  });

  it("retryAfterMs diminui com o tempo", () => {
    for (let i = 0; i < opts.limit; i++) checkRateLimit("espera", opts);
    const first = checkRateLimit("espera", opts).retryAfterMs;
    vi.advanceTimersByTime(60_000);
    const second = checkRateLimit("espera", opts).retryAfterMs;
    expect(second).toBeLessThan(first);
    expect(second).toBe(first - 60_000);
  });

  it("tentativas barradas não estendem o bloqueio", () => {
    for (let i = 0; i < opts.limit; i++) checkRateLimit("teimoso", opts);
    vi.advanceTimersByTime(10 * 60_000);
    for (let i = 0; i < 20; i++) expect(checkRateLimit("teimoso", opts).ok).toBe(false);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(checkRateLimit("teimoso", opts).ok).toBe(true);
  });

  it("resetRateLimit zera a chave", () => {
    for (let i = 0; i < opts.limit; i++) checkRateLimit("zera", opts);
    expect(checkRateLimit("zera", opts).ok).toBe(false);
    resetRateLimit("zera");
    expect(checkRateLimit("zera", opts).ok).toBe(true);
  });

  it("aguenta a limpeza preguiçosa sem perder o estado da chave ativa", () => {
    // Enche o mapa com chaves velhas o suficiente pra disparar a varredura.
    for (let i = 0; i < 300; i++) checkRateLimit(`lixo-${i}`, opts);
    for (let i = 0; i < opts.limit; i++) checkRateLimit("viva", opts);
    for (let i = 0; i < 300; i++) checkRateLimit(`lixo2-${i}`, opts);
    expect(checkRateLimit("viva", opts).ok).toBe(false);
  });
});
