import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

// O módulo lê UPLOAD_DIR na hora do import: tem que definir antes do import dinâmico.
const TMP_DIR = path.join(os.tmpdir(), `eonarga-storage-${process.pid}-${Date.now()}`);
process.env.UPLOAD_DIR = TMP_DIR;

const {
  ACCEPTED_MIME,
  deleteImage,
  imagePath,
  isValidImageId,
  MAX_UPLOAD_BYTES,
  readImage,
  saveImage,
  sniffImageMime,
  UPLOAD_DIR,
} = await import("./storage");

afterAll(async () => {
  // No Windows o sharp às vezes ainda segura o arquivo; limpeza é conveniência, não asserção.
  await fs
    .rm(TMP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    .catch(() => {});
});

/** Metadados de um arquivo salvo, lendo o buffer (não deixa handle aberto no Windows). */
async function meta(file: string) {
  return sharp(await fs.readFile(file)).metadata();
}

/** Retângulo colorido, pra dar pra conferir proporção e recorte. */
function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } },
  })
    .png()
    .toBuffer();
}

/** JPEG com EXIF de verdade, pra provar que o reprocessamento joga fora. */
function jpegWithExif(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 90 } },
  })
    .withExif({ IFD0: { Copyright: "narga", Software: "teste" } })
    .jpeg()
    .toBuffer();
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

describe("configuração", () => {
  it("UPLOAD_DIR vem do ambiente", () => {
    expect(UPLOAD_DIR).toBe(path.resolve(TMP_DIR));
  });

  it("limite de 10 MB e allowlist de mime", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(ACCEPTED_MIME).toContain("image/jpeg");
    expect(ACCEPTED_MIME).toContain("image/heic");
    expect(ACCEPTED_MIME).not.toContain("image/svg+xml");
  });
});

describe("isValidImageId", () => {
  it("aceita id de 16 caracteres do alfabeto do nanoid", () => {
    expect(isValidImageId("aB3_-xYz01234567")).toBe(true);
  });

  it("rejeita path traversal e qualquer coisa com barra ou ponto", () => {
    for (const bad of [
      "../x",
      "../../etc/passwd",
      "a/b/c/d/e/f/g/h/i",
      "abcdefgh.abcdefg",
      "abcdefgh\\abcdefg",
      "..",
      "",
      "curto",
      "comprido-demais-mesmo",
      "aB3_-xYz0123456 ",
    ]) {
      expect(isValidImageId(bad), bad).toBe(false);
    }
  });
});

describe("imagePath", () => {
  it("full e thumb têm nomes diferentes, os dois em webp", () => {
    const id = "aB3_-xYz01234567";
    expect(imagePath(id, "full")).toBe(path.join(UPLOAD_DIR, `${id}.webp`));
    expect(imagePath(id, "thumb")).toBe(path.join(UPLOAD_DIR, `${id}.thumb.webp`));
  });
});

describe("sniffImageMime", () => {
  it("reconhece png, jpeg e webp gerados pelo sharp", async () => {
    const source = await png(20, 20);
    expect(sniffImageMime(source)).toBe("image/png");
    expect(sniffImageMime(await sharp(source).jpeg().toBuffer())).toBe("image/jpeg");
    expect(sniffImageMime(await sharp(source).webp().toBuffer())).toBe("image/webp");
  });

  it("reconhece heic/heif pela caixa ftyp", () => {
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypheic", "ascii"),
      Buffer.alloc(8),
    ]);
    expect(sniffImageMime(heic)).toBe("image/heic");

    const mif1 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypmif1", "ascii"),
      Buffer.alloc(8),
    ]);
    expect(sniffImageMime(mif1)).toBe("image/heif");
  });

  it("devolve null pra lixo, pra gif, pra svg e pra buffer curto", () => {
    expect(sniffImageMime(Buffer.from("nao sou imagem nenhuma"))).toBeNull();
    expect(sniffImageMime(Buffer.from("GIF89a....................", "ascii"))).toBeNull();
    expect(sniffImageMime(Buffer.from('<svg onload="alert(1)"></svg>', "utf8"))).toBeNull();
    expect(sniffImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    // "ftyp" com marca de mp4 não é foto.
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypisom", "ascii"),
      Buffer.alloc(8),
    ]);
    expect(sniffImageMime(mp4)).toBeNull();
  });
});

describe("saveImage", () => {
  it("grava as duas variantes em webp e devolve as dimensões da full", async () => {
    const saved = await saveImage(await png(1200, 600), { maxSize: 512, thumbSize: 160 });

    expect(isValidImageId(saved.id)).toBe(true);
    expect(await exists(imagePath(saved.id, "full"))).toBe(true);
    expect(await exists(imagePath(saved.id, "thumb"))).toBe(true);
    expect(saved.bytes).toBeGreaterThan(0);

    const full = await meta(imagePath(saved.id, "full"));
    expect(full.format).toBe("webp");
    // Cabe em 512 no lado maior, mantendo a proporção 2:1.
    expect(full.width).toBe(512);
    expect(full.height).toBe(256);
    expect(saved.width).toBe(512);
    expect(saved.height).toBe(256);
    expect(saved.bytes).toBe((await fs.stat(imagePath(saved.id, "full"))).size);
  });

  it("thumb é quadrada mesmo com entrada retangular (cover)", async () => {
    const saved = await saveImage(await png(1000, 300), { thumbSize: 120 });
    const thumb = await meta(imagePath(saved.id, "thumb"));
    expect(thumb.format).toBe("webp");
    expect(thumb.width).toBe(120);
    expect(thumb.height).toBe(120);
  });

  it("não aumenta imagem menor que o limite", async () => {
    const saved = await saveImage(await png(64, 48), { maxSize: 1600 });
    expect(saved.width).toBe(64);
    expect(saved.height).toBe(48);
  });

  it("usa 1600/400 quando não passam opções", async () => {
    const saved = await saveImage(await png(3000, 3000));
    expect(saved.width).toBe(1600);
    expect(saved.height).toBe(1600);
    const thumb = await meta(imagePath(saved.id, "thumb"));
    expect(thumb.width).toBe(400);
  });

  it("joga fora o EXIF do original", async () => {
    const original = await jpegWithExif();
    // Garantia de que o fixture realmente tem EXIF (senão o teste não prova nada).
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const saved = await saveImage(original, { maxSize: 512, thumbSize: 160 });

    for (const variant of ["full", "thumb"] as const) {
      const variantMeta = await meta(imagePath(saved.id, variant));
      expect(variantMeta.exif, variant).toBeUndefined();
      expect(variantMeta.xmp, variant).toBeUndefined();
    }
  });

  it("ids são diferentes a cada upload", async () => {
    const a = await saveImage(await png(40, 40));
    const b = await saveImage(await png(40, 40));
    expect(a.id).not.toBe(b.id);
  });

  it("recusa o que não é imagem decodificável", async () => {
    await expect(saveImage(Buffer.from("nem de longe uma imagem"))).rejects.toThrow();
    await expect(saveImage(Buffer.alloc(0))).rejects.toThrow();
    // JPEG com o cabeçalho certo e o corpo destruído.
    const brokenJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2048, 0x41)]);
    expect(sniffImageMime(brokenJpeg)).toBe("image/jpeg");
    await expect(saveImage(brokenJpeg)).rejects.toThrow();
  });
});

describe("readImage e deleteImage", () => {
  it("lê as duas variantes", async () => {
    const saved = await saveImage(await png(300, 300), { maxSize: 200, thumbSize: 80 });
    const full = await readImage(saved.id, "full");
    const thumb = await readImage(saved.id, "thumb");
    expect(full?.length).toBeGreaterThan(0);
    expect(thumb?.length).toBeGreaterThan(0);
    expect((await sharp(full!).metadata()).width).toBe(200);
    expect((await sharp(thumb!).metadata()).width).toBe(80);
  });

  it("devolve null pra id que não existe e pra id inválido", async () => {
    expect(await readImage("aB3_-xYz01234567", "full")).toBeNull();
    expect(await readImage("../../package", "full")).toBeNull();
  });

  it("apaga as duas variantes e é idempotente", async () => {
    const saved = await saveImage(await png(100, 100));
    await deleteImage(saved.id);
    expect(await exists(imagePath(saved.id, "full"))).toBe(false);
    expect(await exists(imagePath(saved.id, "thumb"))).toBe(false);
    // De novo, e com id que nunca existiu: nenhum dos dois pode explodir.
    await expect(deleteImage(saved.id)).resolves.toBeUndefined();
    await expect(deleteImage("aB3_-xYz01234567")).resolves.toBeUndefined();
    await expect(deleteImage("../../package")).resolves.toBeUndefined();
  });
});
