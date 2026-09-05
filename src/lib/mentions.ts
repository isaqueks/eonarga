/**
 * Menções (docs/08 #41): `@Nome: ` no texto de um post, comentário ou resposta.
 *
 * O dois-pontos fecha a menção — nome tem espaço ("Breno o de Lima"), então sem um
 * terminador não dá pra saber onde o nome acaba. Só a parte pura fica aqui; quem
 * resolve contra a lista de gente e dispara push é `src/lib/notify-mentions.ts`.
 */

/** Tamanho máximo de um nome dentro da menção (o `users.name` também é curto). */
export const MENTION_NAME_MAX = 60;

/** Quantas letras depois do `@` antes de o autocomplete aparecer. */
export const MENTION_MIN_QUERY = 3;

/** Trecho do texto que vai no push de menção. */
export const MENTION_PUSH_EXCERPT_MAX = 90;

/** `@Nome: ` — o que o autocomplete e o "Responder" escrevem. */
export function mentionToken(name: string): string {
  return `@${name.trim()}: `;
}

/** `@` no começo do texto ou depois de espaço/quebra, nome sem `@`, `:` nem quebra, e o `:`. */
const MENTION_RE = /(^|[\s(])@([^@:\n]{1,60}?):/gu;

/** Compara nome sem acento, sem caixa e sem espaço duplicado: "Joao" acha "João". */
export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Os nomes mencionados, na ordem, sem repetir (comparação normalizada). */
export function extractMentionNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const name = match[2].trim();
    if (name.length === 0 || name.length > MENTION_NAME_MAX) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export interface Mentionable {
  id: string;
  name: string;
}

/** Quem, da lista, foi mencionado no texto. Nome que não bate com ninguém é ignorado. */
export function resolveMentions<T extends Mentionable>(text: string, people: T[]): T[] {
  const wanted = new Set(extractMentionNames(text).map(normalizeName));
  if (wanted.size === 0) return [];
  const found: T[] = [];
  const taken = new Set<string>();
  for (const person of people) {
    const key = normalizeName(person.name);
    if (wanted.has(key) && !taken.has(person.id)) {
      taken.add(person.id);
      found.push(person);
    }
  }
  return found;
}

/**
 * O que a pessoa está digitando depois de um `@` na posição do cursor: começo do
 * token no texto e a consulta (sem o `@`). Null quando não há menção em andamento —
 * o `@` fechou com `:`, tem quebra de linha no meio, ou ainda faltam letras.
 */
export function currentMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/[\s(]/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.includes(":") || query.includes("\n") || query.includes("@")) return null;
  if (query.length < MENTION_MIN_QUERY || query.length > MENTION_NAME_MAX) return null;
  return { start: at, query };
}

/** Troca o token em andamento pela menção fechada e devolve o texto e onde o cursor fica. */
export function applyMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const token = mentionToken(name);
  // O token já termina em espaço: se o resto começa com outro, não dobra.
  const rest = text.slice(caret);
  const next = text.slice(0, start) + token + (rest.startsWith(" ") ? rest.slice(1) : rest);
  return { text: next, caret: start + token.length };
}

/** "Bia te mencionou num post: “trecho”" — o trecho vira uma linha só e é cortado. */
export function mentionNotificationBody(
  authorName: string,
  where: "post" | "comment",
  text: string,
): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const excerpt =
    oneLine.length > MENTION_PUSH_EXCERPT_MAX
      ? `${oneLine.slice(0, MENTION_PUSH_EXCERPT_MAX - 1).trimEnd()}…`
      : oneLine;
  const place = where === "post" ? "num post" : "num comentário";
  return `${authorName} te mencionou ${place}: “${excerpt}”`;
}

/** Pedaços do texto pra pintar as menções na tela: `{ mention: true }` é um `@Nome:`. */
export function splitMentions(text: string): { text: string; mention: boolean }[] {
  const parts: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_RE)) {
    const lead = match[1];
    const start = (match.index ?? 0) + lead.length;
    const end = (match.index ?? 0) + match[0].length;
    if (start > last) parts.push({ text: text.slice(last, start), mention: false });
    parts.push({ text: text.slice(start, end), mention: true });
    last = end;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false });
  return parts;
}
