import { describe, expect, it } from "vitest";

import {
  applyMention,
  currentMentionQuery,
  extractMentionNames,
  mentionNotificationBody,
  mentionToken,
  normalizeName,
  resolveMentions,
  splitMentions,
} from "./mentions";

const GALERA = [
  { id: "u-ana", name: "Ana" },
  { id: "u-breno", name: "Breno o de Lima" },
  { id: "u-joao", name: "João" },
];

describe("extractMentionNames", () => {
  it("acha menções no começo, no meio e com nome composto", () => {
    expect(extractMentionNames("@Ana: bora? e aí @Breno o de Lima: vem também")).toEqual([
      "Ana",
      "Breno o de Lima",
    ]);
  });

  it("ignora @ sem dois-pontos, e-mail e menção duplicada", () => {
    expect(extractMentionNames("manda pra ana@exemplo.com e @Ana sem fechar")).toEqual([]);
    expect(extractMentionNames("@Ana: oi @ana: de novo")).toEqual(["Ana"]);
  });

  it("não atravessa quebra de linha nem outro @", () => {
    expect(extractMentionNames("@Ana\ntexto: nada")).toEqual([]);
    expect(extractMentionNames("@Ana @Breno: oi")).toEqual(["Breno"]);
  });
});

describe("resolveMentions / normalizeName", () => {
  it("bate nome sem acento e sem caixa, e devolve quem existe", () => {
    expect(normalizeName("  JOÃO  da  Silva ")).toBe("joao da silva");
    expect(resolveMentions("@joao: e @ANA: e @Ninguém: oi", GALERA).map((p) => p.id)).toEqual([
      "u-ana",
      "u-joao",
    ]);
    expect(resolveMentions("sem menção", GALERA)).toEqual([]);
  });
});

describe("currentMentionQuery / applyMention", () => {
  it("só depois de @ mais três letras, sem fechar e no cursor", () => {
    expect(currentMentionQuery("oi @An", 6)).toBeNull();
    expect(currentMentionQuery("oi @Ana", 7)).toEqual({ start: 3, query: "Ana" });
    expect(currentMentionQuery("oi @Breno o", 11)).toEqual({ start: 3, query: "Breno o" });
    expect(currentMentionQuery("oi @Ana: pronto", 15)).toBeNull();
    expect(currentMentionQuery("ana@exemplo", 11)).toBeNull();
    expect(currentMentionQuery("@Ana\nlinha", 10)).toBeNull();
  });

  it("aplica a menção no lugar do token e põe o cursor depois do espaço", () => {
    const token = mentionToken(" Ana ");
    expect(token).toBe("@Ana: ");
    expect(applyMention("oi @Ana tudo", 3, 7, "Ana")).toEqual({
      text: "oi @Ana: tudo",
      caret: 3 + token.length,
    });
  });
});

describe("mentionNotificationBody", () => {
  it("diz onde foi e corta o trecho", () => {
    expect(mentionNotificationBody("Bia", "post", "@Ana: bora?")).toBe(
      "Bia te mencionou num post: “@Ana: bora?”",
    );
    const longo = mentionNotificationBody("Bia", "comment", "x".repeat(200));
    expect(longo.startsWith("Bia te mencionou num comentário: “")).toBe(true);
    expect(longo.endsWith("…”")).toBe(true);
  });
});

describe("splitMentions", () => {
  it("separa o texto nos pedaços de menção", () => {
    expect(splitMentions("oi @Ana: tudo (@João: né)")).toEqual([
      { text: "oi ", mention: false },
      { text: "@Ana:", mention: true },
      { text: " tudo (", mention: false },
      { text: "@João:", mention: true },
      { text: " né)", mention: false },
    ]);
    expect(splitMentions("sem nada")).toEqual([{ text: "sem nada", mention: false }]);
  });
});
