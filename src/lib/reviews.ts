import { z } from "zod";

import { CONTENT_HTML_MAX, CONTENT_TEXT_MAX, REACTION_EMOJIS, VERDICT_MAX } from "@/lib/constants";

// As constantes moram em lib/constants (sem zod) e são reexportadas aqui por compatibilidade.
export { CONTENT_HTML_MAX, CONTENT_TEXT_MAX, REACTION_EMOJIS, VERDICT_MAX };

export const RATING_ERROR = "Dá uma nota de 1 a 5.";
export const VERDICT_ERROR = `Resume em uma frase (até ${VERDICT_MAX} caracteres).`;
export const CONTENT_TOO_LONG = `Texto longo demais (máximo ${CONTENT_TEXT_MAX} caracteres).`;
export const VISITED_AT_INVALID = "Data inválida.";
export const VISITED_AT_FUTURE = "Você ainda não foi. Ou foi?";

export interface ReviewInput {
  placeId: string;
  /** 2..10 = 1,0 a 5,0 em meios pontos. */
  rating: number;
  verdict: string;
  contentHtml: string;
  visitedAt: string | null;
}

/** "2026-09-02" de verdade (rejeita 2026-02-31 e afins). */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Hoje em UTC. O grupo é UTC-3, então a janela de tolerância é de algumas horas
 * a mais — de propósito: melhor aceitar do que reclamar de uma data válida.
 */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const visitedAtField = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value === null || isIsoDate(value), VISITED_AT_INVALID)
  .refine((value) => value === null || value <= todayIso(), VISITED_AT_FUTURE);

const schema = z.object({
  placeId: z.string().trim().min(1, "Lugar não encontrado."),
  // Vem do form como string ("2".."10"); guardamos inteiro.
  rating: z.coerce
    .number({ error: RATING_ERROR })
    .int(RATING_ERROR)
    .min(2, RATING_ERROR)
    .max(10, RATING_ERROR),
  verdict: z.string().trim().min(3, VERDICT_ERROR).max(VERDICT_MAX, VERDICT_ERROR),
  // O texto puro só dá pra medir depois de sanitizar: essa checagem fica na action.
  contentHtml: z.string().max(CONTENT_HTML_MAX, CONTENT_TOO_LONG),
  visitedAt: visitedAtField,
});

export const reviewInputSchema: z.ZodType<ReviewInput> = schema;

export function isReactionEmoji(value: string): value is (typeof REACTION_EMOJIS)[number] {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}
