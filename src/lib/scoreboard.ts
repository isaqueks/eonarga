/**
 * Placar da galera (docs/01 — "Placar de pessoas"): quem mais avaliou, quem mais
 * cadastrou, quem mais rodou e o crítico mais chato (menor média das próprias
 * notas). Puro de propósito: a query devolve os números, aqui só se decide quem
 * sobe no pódio. Empate vai pela ordem alfabética.
 */

export interface ScoreboardPerson {
  id: string;
  name: string;
  avatarId: string | null;
  placesCreated: number;
  reviewCount: number;
  visitedCount: number;
  /** Média das notas que a pessoa deu, em estrelas (1,0..5,0). Null se nunca avaliou. */
  avgStarsGiven: number | null;
}

export type ScoreboardKey = "reviews" | "places" | "visited" | "critic";

export interface ScoreboardEntry<P extends ScoreboardPerson = ScoreboardPerson> {
  key: ScoreboardKey;
  /** Null quando ninguém qualifica — o card mostra "ninguém ainda". */
  person: P | null;
  value: number | null;
}

/** Abaixo disso não dá pra chamar de crítico: é só quem deu uma nota baixa. */
export const CRITIC_MIN_REVIEWS = 3;

export const SCOREBOARD_LABELS: Record<ScoreboardKey, string> = {
  reviews: "Mais avaliou",
  places: "Mais cadastrou",
  visited: "Mais rodado",
  critic: "Crítico mais chato",
};

/**
 * Melhor pessoa segundo `value`, com `better` decidindo o sentido (maior ou menor).
 * Quem devolve `null` em `value` está fora da disputa.
 */
function pickBest<P extends ScoreboardPerson>(
  people: readonly P[],
  value: (person: P) => number | null,
  better: (candidate: number, current: number) => boolean,
): { person: P; value: number } | null {
  let best: { person: P; value: number } | null = null;

  for (const person of people) {
    const current = value(person);
    if (current === null || !Number.isFinite(current)) continue;

    if (
      best === null ||
      better(current, best.value) ||
      (current === best.value && person.name.localeCompare(best.person.name, "pt-BR") < 0)
    ) {
      best = { person, value: current };
    }
  }

  return best;
}

const higher = (candidate: number, current: number) => candidate > current;
const lower = (candidate: number, current: number) => candidate < current;

/** Zero não sobe no pódio: "0 notas" não é o mais avaliou, é ninguém. */
const positive = (count: number) => (count > 0 ? count : null);

export function buildScoreboard<P extends ScoreboardPerson>(
  people: readonly P[],
): ScoreboardEntry<P>[] {
  const entry = (
    key: ScoreboardKey,
    found: { person: P; value: number } | null,
  ): ScoreboardEntry<P> => ({ key, person: found?.person ?? null, value: found?.value ?? null });

  return [
    entry(
      "reviews",
      pickBest(people, (person) => positive(person.reviewCount), higher),
    ),
    entry(
      "places",
      pickBest(people, (person) => positive(person.placesCreated), higher),
    ),
    entry(
      "visited",
      pickBest(people, (person) => positive(person.visitedCount), higher),
    ),
    entry(
      "critic",
      pickBest(
        people,
        (person) => (person.reviewCount >= CRITIC_MIN_REVIEWS ? person.avgStarsGiven : null),
        lower,
      ),
    ),
  ];
}
