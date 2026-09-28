/**
 * Storage de imagens em disco. É o único lugar do app que escreve arquivo de usuário,
 * justamente pra trocar por S3 depois sem mexer em mais nada (docs/02).
 *
 * Regra de segurança (docs/05, "Upload malicioso"): nada do que chega é servido de volta.
 * Todo upload é *reprocessado* pelo sharp e regravado como webp — isso destrói qualquer
 * payload escondido no arquivo e joga fora EXIF (inclusive GPS). O nome do arquivo é um
 * id gerado aqui; o nome original do upload nunca toca o disco.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { nanoid } from "nanoid";
import sharp, { type OutputInfo } from "sharp";

import { PHOTO_MAX_BYTES } from "@/lib/constants";

/**
 * `full` é a original reprocessada (até 1600 px); `thumb` a quadrada de 400 px; `medium`
 * (até 800 px) é a que o card do feed mostra (docs/08 #56): metade dos bytes da full
 * numa tela de celular, e gerada sob demanda a partir da full na primeira vez que alguém
 * pede — as fotos de antes ganham a variante sem reprocessar nada em massa.
 */
export type ImageVariant = "full" | "medium" | "thumb";

export interface StoredImage {
  id: string;
  width: number;
  height: number;
  bytes: number;
}

/** Pasta dos uploads. No Docker é `/app/data/uploads` (volume), em dev `./data/uploads`. */
export const UPLOAD_DIR: string = path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");

/** 10 MB. Foto de celular passa folgada; PDF disfarçado de foto não. */
export const MAX_UPLOAD_BYTES = PHOTO_MAX_BYTES;

export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

/** Ids têm 16 caracteres do alfabeto do nanoid: `A-Za-z0-9_-`. Sem `/`, sem `.`. */
const ID_LENGTH = 16;
const ID_RE = /^[A-Za-z0-9_-]{16}$/;

/** Tamanho padrão do lado maior da variante `full`. */
const DEFAULT_MAX_SIZE = 1600;
/** Lado da thumb quadrada. */
const DEFAULT_THUMB_SIZE = 400;
/** Lado maior da variante `medium`. */
export const MEDIUM_MAX_SIZE = 800;

/** ~100 megapixels: trava simples contra "zip bomb" de imagem. */
const MAX_INPUT_PIXELS = 100_000_000;

/** Erro de imagem que o sharp não conseguiu decodificar (ou que não é imagem). */
export class InvalidImageError extends Error {
  constructor(message = "Isso não é uma imagem que eu reconheça.", options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidImageError";
  }
}

/**
 * Só aceita id gerado por nós. Serve de guarda contra path traversal: qualquer coisa
 * com `/`, `\`, `.` ou `..` cai fora antes de virar caminho de arquivo.
 */
export function isValidImageId(id: string): boolean {
  return typeof id === "string" && ID_RE.test(id);
}

/** Caminho no disco de uma variante. Nunca chame sem validar o id antes. */
export function imagePath(id: string, variant: ImageVariant): string {
  const suffix = variant === "full" ? ".webp" : `.${variant}.webp`;
  return path.join(UPLOAD_DIR, `${id}${suffix}`);
}

let dirReady: Promise<void> | null = null;

/** `mkdir -p` no primeiro uso, uma vez por processo. */
function ensureUploadDir(): Promise<void> {
  dirReady ??= fs.mkdir(UPLOAD_DIR, { recursive: true }).then(() => undefined);
  return dirReady;
}

const FTYP_BRANDS = new Set(["heic", "heix", "hevc", "mif1"]);

/**
 * Tipo pelos magic bytes, não pelo `Content-Type` que o cliente mandou (que é chute dele).
 * Devolve `null` quando não bate com nada da allowlist.
 */
export function sniffImageMime(buf: Buffer): AcceptedMime | null {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" ....  "WEBP"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }

  // HEIC/HEIF (foto de iPhone): caixa "ftyp" no offset 4, marca no offset 8.
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (FTYP_BRANDS.has(brand)) return brand === "mif1" ? "image/heif" : "image/heic";
  }

  return null;
}

/**
 * Reprocessa e grava as duas variantes. Devolve as dimensões da `full`.
 * Lança `InvalidImageError` se o buffer não for uma imagem decodificável.
 */
export async function saveImage(
  input: Buffer,
  opts: { maxSize?: number; thumbSize?: number } = {},
): Promise<StoredImage> {
  const maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
  const thumbSize = opts.thumbSize ?? DEFAULT_THUMB_SIZE;

  // `failOn: "error"` aceita foto de celular meio torta, mas recusa lixo.
  const open = () =>
    sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      // Sem argumento, `rotate()` aplica a orientação do EXIF antes de a gente jogá-lo fora.
      .rotate();

  let full: { data: Buffer; info: OutputInfo };
  let thumb: Buffer;
  try {
    full = await open()
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    thumb = await open()
      .resize(thumbSize, thumbSize, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (cause) {
    throw new InvalidImageError(undefined, { cause });
  }

  await ensureUploadDir();
  const id = nanoid(ID_LENGTH);
  await fs.writeFile(imagePath(id, "full"), full.data);
  await fs.writeFile(imagePath(id, "thumb"), thumb);

  return { id, width: full.info.width, height: full.info.height, bytes: full.data.length };
}

/**
 * Conteúdo da variante, ou `null` se o id for inválido / o arquivo não existir.
 * A `medium` que ainda não existe é gerada da `full` e guardada pra próxima vez.
 */
export async function readImage(id: string, variant: ImageVariant): Promise<Buffer | null> {
  if (!isValidImageId(id)) return null;
  try {
    return await fs.readFile(imagePath(id, variant));
  } catch {
    if (variant !== "medium") return null;
    return buildMedium(id);
  }
}

/** Gera a `medium` a partir da `full`; grava num temporário e renomeia, pra duas
 * requisições ao mesmo tempo não deixarem um arquivo pela metade. */
async function buildMedium(id: string): Promise<Buffer | null> {
  let full: Buffer;
  try {
    full = await fs.readFile(imagePath(id, "full"));
  } catch {
    return null;
  }
  const medium = await sharp(full, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({
      width: MEDIUM_MAX_SIZE,
      height: MEDIUM_MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
  const target = imagePath(id, "medium");
  const temp = `${target}.${nanoid(6)}.tmp`;
  try {
    await fs.writeFile(temp, medium);
    await fs.rename(temp, target);
  } catch {
    // Disco cheio ou corrida perdida: a foto sai do mesmo jeito, só não fica guardada.
    await fs.rm(temp, { force: true }).catch(() => {});
  }
  return medium;
}

/** Apaga todas as variantes. Idempotente: arquivo que não existe não é erro. */
export async function deleteImage(id: string): Promise<void> {
  if (!isValidImageId(id)) return;
  await Promise.all(
    (["full", "medium", "thumb"] as const).map((variant) =>
      fs.rm(imagePath(id, variant), { force: true }).catch(() => {}),
    ),
  );
}
