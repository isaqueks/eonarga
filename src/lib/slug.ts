/** Slug de URL a partir do nome do lugar: ASCII, minúsculo, kebab-case. */

export const MAX_SLUG_LENGTH = 60;
export const SLUG_FALLBACK = "lugar";

/** Letras que o NFD não decompõe (não têm acento separável). */
const TRANSLITERATION: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  þ: "th",
  ł: "l",
  ħ: "h",
  ı: "i",
  "&": " e ",
};

/**
 * "Café do Zé & Cia." → "cafe-do-ze-e-cia".
 * Nunca devolve string vazia: cai em "lugar" quando não sobra nada (ex.: só emoji).
 */
export function slugify(input: string): string {
  const replaced = input.toLowerCase().replace(/[ßæœøđðþłħı&]/g, (c) => TRANSLITERATION[c] ?? c);

  const ascii = replaced
    // NFD separa a acentuação em combining marks, que a gente joga fora.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const kebab = ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  // Corta no limite e limpa o hífen que possa ter sobrado na ponta.
  const trimmed = kebab.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");

  return trimmed || SLUG_FALLBACK;
}
