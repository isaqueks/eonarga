/**
 * Encolhe a foto no próprio aparelho antes de subir (docs/08 #54).
 *
 * O servidor já reduz toda foto pra 1600 px (`src/lib/storage.ts`), então mandar os 4 MB
 * originais do celular só serve pra demorar no 4G e cair no meio do caminho. Aqui a foto
 * vira um JPEG de até 1600 px, com a orientação do EXIF já aplicada, e o resto do EXIF
 * (inclusive GPS) fica pra trás. Qualquer tropeço (formato que o navegador não abre,
 * canvas sem memória) devolve o arquivo original: o servidor continua decidindo.
 *
 * As funções puras ficam separadas do `shrinkImage` pra ter teste sem navegador.
 */

/** O mesmo lado maior que o servidor usa; abaixo disso a recompressão não perde nada. */
export const SHRINK_MAX_SIDE = 1600;
/** Foto menor que isso sobe como veio: não vale o trabalho (nem o risco) de recomprimir. */
export const SHRINK_MIN_BYTES = 700 * 1024;
/** Qualidade do JPEG que sai do aparelho. O servidor regrava em webp 82 de qualquer jeito. */
export const SHRINK_QUALITY = 0.85;

/** Vale encolher? Só imagem, e só quando é grande de verdade. */
export function shouldShrink(file: { type: string; size: number }): boolean {
  return file.type.startsWith("image/") && file.size > SHRINK_MIN_BYTES;
}

/** As dimensões finais: o lado maior vira `maxSide`, o outro acompanha; nunca amplia. */
export function shrinkTargets(
  width: number,
  height: number,
  maxSide: number = SHRINK_MAX_SIDE,
): { width: number; height: number } | null {
  if (!(width > 0 && height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** `IMG_1234.HEIC` → `IMG_1234.jpg`; sem nome, `foto.jpg`. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim() || "foto";
  return `${base}.jpg`;
}

/**
 * A foto encolhida, ou o arquivo original quando não precisa, não dá ou não ajudou
 * (o JPEG novo saiu maior que o de entrada). Só roda no navegador.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!shouldShrink(file)) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | null = null;
  try {
    // `from-image` aplica a orientação do EXIF: a foto deitada do celular sobe em pé.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const target = shrinkTargets(bitmap.width, bitmap.height);
    if (!target) return file;
    const blob = await drawJpeg(bitmap, target.width, target.height);
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

/** Desenha no canvas (fora da tela quando dá) e exporta em JPEG. */
async function drawJpeg(bitmap: ImageBitmap, width: number, height: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality: SHRINK_QUALITY });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", SHRINK_QUALITY));
}
