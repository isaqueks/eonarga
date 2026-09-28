import { describe, expect, it } from "vitest";

import {
  jpegName,
  SHRINK_MAX_SIDE,
  SHRINK_MIN_BYTES,
  shouldShrink,
  shrinkImage,
  shrinkTargets,
} from "./image-client";

describe("shouldShrink", () => {
  it("só imagem grande", () => {
    expect(shouldShrink({ type: "image/jpeg", size: SHRINK_MIN_BYTES + 1 })).toBe(true);
    expect(shouldShrink({ type: "image/heic", size: 5 * 1024 * 1024 })).toBe(true);
    expect(shouldShrink({ type: "image/jpeg", size: SHRINK_MIN_BYTES })).toBe(false);
    expect(shouldShrink({ type: "video/mp4", size: 50 * 1024 * 1024 })).toBe(false);
    expect(shouldShrink({ type: "", size: 5 * 1024 * 1024 })).toBe(false);
  });
});

describe("shrinkTargets", () => {
  it("o lado maior vira 1600 e o outro acompanha, sem ampliar", () => {
    expect(shrinkTargets(4000, 3000)).toEqual({ width: SHRINK_MAX_SIDE, height: 1200 });
    expect(shrinkTargets(3000, 4000)).toEqual({ width: 1200, height: SHRINK_MAX_SIDE });
    expect(shrinkTargets(800, 600)).toEqual({ width: 800, height: 600 });
    expect(shrinkTargets(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("arredonda e nunca chega a zero", () => {
    expect(shrinkTargets(10_000, 3)).toEqual({ width: 1600, height: 1 });
    expect(shrinkTargets(3333, 2222)).toEqual({ width: 1600, height: 1067 });
  });

  it("dimensão quebrada vira null", () => {
    expect(shrinkTargets(0, 100)).toBeNull();
    expect(shrinkTargets(100, Number.NaN)).toBeNull();
    expect(shrinkTargets(-5, 10)).toBeNull();
  });
});

describe("jpegName", () => {
  it("troca a extensão e cobre nome vazio", () => {
    expect(jpegName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
    expect(jpegName("foto.png")).toBe("foto.jpg");
    expect(jpegName("sem-extensao")).toBe("sem-extensao.jpg");
    expect(jpegName("")).toBe("foto.jpg");
    expect(jpegName(".jpg")).toBe("foto.jpg");
  });
});

describe("shrinkImage fora do navegador", () => {
  it("sem createImageBitmap devolve o arquivo como veio", async () => {
    const file = new File([new Uint8Array(SHRINK_MIN_BYTES + 10)], "grande.jpg", {
      type: "image/jpeg",
    });
    expect(await shrinkImage(file)).toBe(file);
    const small = new File([new Uint8Array(10)], "pequena.jpg", { type: "image/jpeg" });
    expect(await shrinkImage(small)).toBe(small);
  });
});
