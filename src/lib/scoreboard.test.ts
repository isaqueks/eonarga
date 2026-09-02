import { describe, expect, it } from "vitest";

import { buildScoreboard, type ScoreboardKey, type ScoreboardPerson } from "./scoreboard";

function person(overrides: Partial<ScoreboardPerson> & { name: string }): ScoreboardPerson {
  return {
    id: overrides.name.toLowerCase(),
    avatarId: null,
    placesCreated: 0,
    reviewCount: 0,
    visitedCount: 0,
    avgStarsGiven: null,
    ...overrides,
  };
}

function get(entries: ReturnType<typeof buildScoreboard>, key: ScoreboardKey) {
  return entries.find((entry) => entry.key === key)!;
}

describe("buildScoreboard", () => {
  it("elege o topo de cada categoria", () => {
    const people = [
      person({
        name: "Ana",
        reviewCount: 5,
        placesCreated: 1,
        visitedCount: 2,
        avgStarsGiven: 4.5,
      }),
      person({
        name: "Bia",
        reviewCount: 3,
        placesCreated: 7,
        visitedCount: 1,
        avgStarsGiven: 2.5,
      }),
      person({ name: "Cadu", reviewCount: 1, placesCreated: 2, visitedCount: 9, avgStarsGiven: 1 }),
    ];

    const board = buildScoreboard(people);

    expect(board.map((entry) => entry.key)).toEqual(["reviews", "places", "visited", "critic"]);
    expect(get(board, "reviews")).toMatchObject({ value: 5 });
    expect(get(board, "reviews").person?.name).toBe("Ana");
    expect(get(board, "places").person?.name).toBe("Bia");
    expect(get(board, "visited").person?.name).toBe("Cadu");
    // Cadu tem a menor média, mas só 1 nota: o crítico é a Bia (3 notas, 2,5).
    expect(get(board, "critic").person?.name).toBe("Bia");
    expect(get(board, "critic").value).toBe(2.5);
  });

  it("desempata pela ordem alfabética, com acento no lugar certo", () => {
    const people = [
      person({ name: "Zeca", reviewCount: 4 }),
      person({ name: "Ávila", reviewCount: 4 }),
      person({ name: "Bia", reviewCount: 4 }),
    ];

    expect(get(buildScoreboard(people), "reviews").person?.name).toBe("Ávila");
  });

  it("desempata o crítico pelo nome também", () => {
    const people = [
      person({ name: "Bia", reviewCount: 3, avgStarsGiven: 2 }),
      person({ name: "Ana", reviewCount: 5, avgStarsGiven: 2 }),
    ];

    expect(get(buildScoreboard(people), "critic").person?.name).toBe("Ana");
  });

  it("não põe ninguém no pódio com zero", () => {
    const board = buildScoreboard([person({ name: "Ana" }), person({ name: "Bia" })]);

    for (const entry of board) {
      expect(entry.person).toBeNull();
      expect(entry.value).toBeNull();
    }
  });

  it("exige 3 avaliações pro crítico", () => {
    const people = [
      person({ name: "Ana", reviewCount: 2, avgStarsGiven: 1 }),
      person({ name: "Bia", reviewCount: 3, avgStarsGiven: 4.5 }),
    ];

    const critic = get(buildScoreboard(people), "critic");
    expect(critic.person?.name).toBe("Bia");
    expect(critic.value).toBe(4.5);

    const semNinguem = buildScoreboard([person({ name: "Ana", reviewCount: 2, avgStarsGiven: 1 })]);
    expect(get(semNinguem, "critic").person).toBeNull();
  });

  it("aguenta lista vazia", () => {
    expect(buildScoreboard([])).toHaveLength(4);
    expect(buildScoreboard([]).every((entry) => entry.person === null)).toBe(true);
  });
});
