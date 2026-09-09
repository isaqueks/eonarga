import { describe, expect, it } from "vitest";

import {
  AUDIO_PEAKS_COUNT,
  AUDIO_PEAKS_MAX,
  formatClock,
  parseDurationMs,
  parsePeaks,
  parseStoredPeaks,
  recordingExt,
  resamplePeaks,
} from "./audio";
import { AUDIO_MAX_MS } from "./constants";

describe("resamplePeaks", () => {
  it("reduz a série ao número de barras, normalizada pelo maior valor", () => {
    const levels = [0, 0.5, 1, 1, 0.5, 0, 0.25, 0.25];
    expect(resamplePeaks(levels, 4)).toEqual([0.25, 1, 0.25, 0.25]);
  });

  it("estica série curta e usa o valor absoluto (amostra de áudio vai de -1 a 1)", () => {
    expect(resamplePeaks([-1, 0.5], 4)).toEqual([1, 1, 0.5, 0.5]);
  });

  it("série vazia ou muda vira barras zeradas, sem NaN", () => {
    expect(resamplePeaks([], 3)).toEqual([0, 0, 0]);
    expect(resamplePeaks([0, 0, 0], 2)).toEqual([0, 0]);
    expect(resamplePeaks(new Float32Array(10), 2)).toEqual([0, 0]);
  });

  it("padrão de 64 barras com duas casas", () => {
    const bars = resamplePeaks(Array.from({ length: 1000 }, (_, i) => i / 1000));
    expect(bars).toHaveLength(AUDIO_PEAKS_COUNT);
    expect(bars[0]).toBeLessThan(bars[63]);
    expect(bars[63]).toBe(1);
    for (const bar of bars) expect(bar).toBe(Math.round(bar * 100) / 100);
  });
});

describe("formatClock", () => {
  it("minutos:segundos com dois dígitos", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7400)).toBe("0:07");
    expect(formatClock(61_000)).toBe("1:01");
    expect(formatClock(3_600_000)).toBe("60:00");
  });

  it("lixo vira 0:00", () => {
    expect(formatClock(-5)).toBe("0:00");
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("parseDurationMs", () => {
  it("aceita inteiro dentro do teto", () => {
    expect(parseDurationMs("0")).toBe(0);
    expect(parseDurationMs("12345")).toBe(12345);
    expect(parseDurationMs(String(AUDIO_MAX_MS))).toBe(AUDIO_MAX_MS);
  });

  it("recusa vazio, decimal, negativo e acima do teto", () => {
    expect(parseDurationMs("")).toBeNull();
    expect(parseDurationMs("12.5")).toBeNull();
    expect(parseDurationMs("-1")).toBeNull();
    expect(parseDurationMs(String(AUDIO_MAX_MS + 1))).toBeNull();
    expect(parseDurationMs("abc")).toBeNull();
  });
});

describe("parsePeaks", () => {
  it("aceita lista de números entre 0 e 1 e arredonda a duas casas", () => {
    expect(parsePeaks("[0, 0.5, 1, 0.123]")).toEqual([0, 0.5, 1, 0.12]);
  });

  it("recusa JSON inválido, vazio, fora da faixa, não-número e lista comprida demais", () => {
    expect(parsePeaks("")).toBeNull();
    expect(parsePeaks("nao é json")).toBeNull();
    expect(parsePeaks("[]")).toBeNull();
    expect(parsePeaks("[1.5]")).toBeNull();
    expect(parsePeaks("[-0.1]")).toBeNull();
    expect(parsePeaks('["a"]')).toBeNull();
    expect(parsePeaks("{}")).toBeNull();
    expect(parsePeaks(JSON.stringify(new Array(AUDIO_PEAKS_MAX + 1).fill(0.5)))).toBeNull();
    expect(parsePeaks(JSON.stringify(new Array(AUDIO_PEAKS_MAX).fill(0.5)))).toHaveLength(
      AUDIO_PEAKS_MAX,
    );
  });
});

describe("parseStoredPeaks", () => {
  it("lê a lista gravada no banco e ignora o que não é lista de números", () => {
    expect(parseStoredPeaks("[0,0.5,1]")).toEqual([0, 0.5, 1]);
    expect(parseStoredPeaks(null)).toBeNull();
    expect(parseStoredPeaks("")).toBeNull();
    expect(parseStoredPeaks("lixo")).toBeNull();
    expect(parseStoredPeaks('["a"]')).toBeNull();
    expect(parseStoredPeaks("{}")).toBeNull();
  });
});

describe("recordingExt", () => {
  it("mapeia o tipo do MediaRecorder pra extensão", () => {
    expect(recordingExt("audio/webm;codecs=opus")).toBe("webm");
    expect(recordingExt("audio/webm")).toBe("webm");
    expect(recordingExt("audio/mp4")).toBe("m4a");
    expect(recordingExt("audio/ogg;codecs=opus")).toBe("ogg");
    expect(recordingExt("")).toBe("webm");
  });
});
