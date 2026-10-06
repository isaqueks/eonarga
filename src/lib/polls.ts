/**
 * Regras puras da enquete (docs/08 #57): limites, validação das opções e a conta do
 * voto. Nada aqui toca banco nem `next/*`: a action, o formulário e o card importam daqui.
 *
 * A enquete é um post: a pergunta é o texto dele e as opções moram em
 * `post_poll_options`. Como no WhatsApp, quem cria escolhe se dá pra marcar várias.
 */

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 12;
/** Uma opção é uma linha curta, não um parágrafo. */
export const POLL_OPTION_MAX = 100;

export const POLL_NO_QUESTION = "Faz a pergunta da enquete.";
export const POLL_FEW_OPTIONS = "Enquete precisa de pelo menos duas opções.";
export const POLL_TOO_MANY = `No máximo ${POLL_MAX_OPTIONS} opções.`;
export const POLL_OPTION_TOO_LONG = `Opção comprida demais (máximo ${POLL_OPTION_MAX} caracteres).`;
export const POLL_DUPLICATE = "Tem opção repetida.";
export const POLL_NO_MEDIA = "Enquete não leva foto, vídeo nem áudio.";

export type PollOptionsResult = { ok: true; options: string[] } | { ok: false; error: string };

/** "Sim", "sim " e "SIM" são a mesma opção. */
function fold(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

/**
 * As opções como o formulário manda (um campo por opção, o último quase sempre vazio):
 * apara, joga fora as vazias e confere quantidade, tamanho e repetição. A ordem fica.
 */
export function parsePollOptions(raw: readonly unknown[]): PollOptionsResult {
  const options = raw
    .map((value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""))
    .filter((value) => value !== "");

  if (options.length < POLL_MIN_OPTIONS) return { ok: false, error: POLL_FEW_OPTIONS };
  if (options.length > POLL_MAX_OPTIONS) return { ok: false, error: POLL_TOO_MANY };
  if (options.some((option) => option.length > POLL_OPTION_MAX)) {
    return { ok: false, error: POLL_OPTION_TOO_LONG };
  }
  if (new Set(options.map(fold)).size !== options.length) {
    return { ok: false, error: POLL_DUPLICATE };
  }
  return { ok: true, options };
}

/**
 * Meus votos depois de tocar numa opção. Com várias respostas, o toque liga ou desliga
 * aquela opção. Com uma só, o toque troca o voto — e tocar na que já é minha tira o voto.
 */
export function nextVotes(
  current: readonly string[],
  optionId: string,
  multiple: boolean,
): string[] {
  const had = current.includes(optionId);
  if (multiple) {
    return had ? current.filter((id) => id !== optionId) : [...current, optionId];
  }
  return had ? [] : [optionId];
}

/** Largura da barra: a opção mais votada enche a barra, as outras são proporcionais a ela. */
export function barFraction(votes: number, top: number): number {
  if (!Number.isFinite(votes) || !Number.isFinite(top) || votes <= 0 || top <= 0) return 0;
  return Math.min(1, votes / top);
}

/** "1 voto" / "3 votos" / "Nenhum voto". */
export function votesLabel(votes: number): string {
  if (votes <= 0) return "Nenhum voto";
  return votes === 1 ? "1 voto" : `${votes} votos`;
}

/** Quantas pessoas votaram (numa enquete de várias respostas, votos ≠ pessoas). */
export function votersLabel(voters: number): string {
  if (voters <= 0) return "Ninguém votou ainda";
  return voters === 1 ? "1 pessoa votou" : `${voters} pessoas votaram`;
}
