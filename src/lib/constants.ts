/**
 * Constantes puras compartilhadas entre servidor e cliente. Sem zod, sem drizzle:
 * componentes client importam daqui pra não arrastar essas libs pro bundle.
 */

/** Reações permitidas nas avaliações, nesta ordem. */
export const REACTION_EMOJIS = ["👍", "😂", "🔥", "🤮", "💨"] as const;

/** Veredito: a frase curta obrigatória que vira citação no card do ranking. */
export const VERDICT_MAX = 120;
/** Limite do texto puro da avaliação (docs/04: "Limite de 5.000 caracteres"). */
export const CONTENT_TEXT_MAX = 5000;
/** Teto do HTML cru. Marcação pesada cabe folgada; payload gigante não passa. */
export const CONTENT_HTML_MAX = 40_000;
