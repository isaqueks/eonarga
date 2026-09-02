/**
 * Formatação de texto pt-BR. Tudo manual de propósito: `Intl` pode divergir entre o
 * ICU do Node e o do navegador e virar warning de hidratação.
 */

/** 4.5 → "4,5" */
export function formatStars(mean: number): string {
  return (Math.round(mean * 10) / 10).toFixed(1).replace(".", ",");
}

/** 4 → "4 notas"; 1 → "1 nota" */
export function formatReviewCount(count: number): string {
  return `${count} ${count === 1 ? "nota" : "notas"}`;
}

/** ["Ana","Bia","Caio"] → "Ana, Bia e Caio" */
export function formatNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** "Rua X, 123 - Centro, Florianópolis - SC, 88010-000" → "Rua X, 123 - Centro" */
export function shortAddress(address: string | null | undefined, parts = 2): string | null {
  if (!address) return null;
  const pieces = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (pieces.length <= parts) return address;
  return pieces.slice(0, parts).join(", ");
}

/** Handle do Instagram sem @ nem URL. */
export function instagramHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  const handle = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  return handle || null;
}
