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

/** Foto de post ou de lugar: até 10 MB antes do reprocessamento (o formulário confere antes de subir). */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** Vídeo de post: 60 MB, guardado como veio (docs/08 #39). */
export const VIDEO_MAX_BYTES = 60 * 1024 * 1024;

/** Resposta numa avaliação: texto puro, curto de propósito (é thread, não ensaio). */
export const COMMENT_MAX = 500;

/** Tags livres por lugar: quantas cabem e o tamanho de cada uma (ver src/lib/tags.ts). */
export const TAG_MAX_PER_PLACE = 8;
export const TAG_MIN_LENGTH = 2;
export const TAG_MAX_LENGTH = 24;
