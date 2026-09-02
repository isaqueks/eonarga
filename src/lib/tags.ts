import { z } from "zod";

import { TAG_MAX_LENGTH, TAG_MAX_PER_PLACE, TAG_MIN_LENGTH } from "@/lib/constants";

// As constantes moram em lib/constants (sem zod) e são reexportadas aqui por conveniência.
export { TAG_MAX_LENGTH, TAG_MAX_PER_PLACE, TAG_MIN_LENGTH };

export const TAG_INVALID = `Tag esquisita. Só letras, números e espaço, de ${TAG_MIN_LENGTH} a ${TAG_MAX_LENGTH} caracteres.`;
export const TAG_TOO_MANY = `No máximo ${TAG_MAX_PER_PLACE} tags. Escolhe.`;

/** Teto do texto cru antes de normalizar: acima disso nem vale tentar limpar. */
const RAW_MAX = 200;

/**
 * "Aceita PIX!" -> "aceita pix"; "Bom & Barato" -> "bom barato"; "Café" -> "cafe".
 * Minúscula, sem acento, só `[a-z0-9 ]` com espaços simples. Devolve `null` quando
 * não sobra nada aproveitável (curta demais, comprida demais ou só pontuação).
 */
export function normalizeTag(input: string): string | null {
  if (typeof input !== "string" || input.length > RAW_MAX) return null;

  const cleaned = input
    .toLowerCase()
    // NFD separa a acentuação em combining marks, que a gente joga fora (igual ao slug).
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Todo o resto vira espaço; o `+` já colapsa as sequências.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (cleaned.length < TAG_MIN_LENGTH || cleaned.length > TAG_MAX_LENGTH) return null;
  return cleaned;
}

/** Uma tag válida, já normalizada. */
export const tagSchema = z.string().transform((value, ctx) => {
  const tag = normalizeTag(value);
  if (tag === null) {
    ctx.addIssue({ code: "custom", message: TAG_INVALID });
    return z.NEVER;
  }
  return tag;
});

/** Lista de tags do lugar: no máximo `TAG_MAX_PER_PLACE`, sem repetida. */
export const tagListSchema = z
  .array(tagSchema)
  .max(50, TAG_TOO_MANY)
  .transform((tags) => [...new Set(tags)].sort((a, b) => a.localeCompare(b, "pt-BR")))
  .refine((tags) => tags.length <= TAG_MAX_PER_PLACE, TAG_TOO_MANY);
