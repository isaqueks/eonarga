import { describe, expect, it } from "vitest";

import { parseCsv, parseTakeoutCsv } from "./csv";

describe("parseCsv", () => {
  it("lê linhas e colunas simples", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("mantém vírgula e quebra de linha dentro de aspas", () => {
    const csv = 'Title,Note\n"Sebo do João, 255","linha 1\nlinha 2"';
    expect(parseCsv(csv)).toEqual([
      ["Title", "Note"],
      ["Sebo do João, 255", "linha 1\nlinha 2"],
    ]);
  });

  it("entende aspas escapadas com aspas duplas", () => {
    expect(parseCsv('a,"ele disse ""oi""",b')).toEqual([["a", 'ele disse "oi"', "b"]]);
  });

  it("aceita CRLF e ignora a linha vazia do fim", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserva campos vazios", () => {
    expect(parseCsv("a,,c\n,,")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("come o BOM do Excel", () => {
    expect(parseCsv("﻿Title,URL")).toEqual([["Title", "URL"]]);
  });

  it("pula linha totalmente em branco", () => {
    expect(parseCsv("a\n\nb")).toEqual([["a"], ["b"]]);
  });

  it("devolve nada pra texto vazio", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n")).toEqual([]);
    expect(parseCsv("\r\n\r\n")).toEqual([]);
  });
});

describe("parseTakeoutCsv", () => {
  it("lê o CSV do Takeout em inglês", () => {
    const csv = [
      "Title,Note,URL,Tags",
      '"Sebo do João","livro velho",https://maps.app.goo.gl/abc,',
      "Bar do Zé,,https://maps.app.goo.gl/def,narga",
    ].join("\n");

    expect(parseTakeoutCsv(csv)).toEqual([
      { title: "Sebo do João", note: "livro velho", url: "https://maps.app.goo.gl/abc" },
      { title: "Bar do Zé", note: null, url: "https://maps.app.goo.gl/def" },
    ]);
  });

  it("lê o CSV em português, na ordem que vier", () => {
    const csv = "URL,Título,Nota\nhttps://maps.app.goo.gl/abc,Café X,bom café";

    expect(parseTakeoutCsv(csv)).toEqual([
      { title: "Café X", note: "bom café", url: "https://maps.app.goo.gl/abc" },
    ]);
  });

  it("sem cabeçalho, adivinha quem é URL e quem é nome", () => {
    const csv = "Café X,https://maps.app.goo.gl/abc\nhttps://maps.app.goo.gl/def,Bar do Zé";

    expect(parseTakeoutCsv(csv)).toEqual([
      { title: "Café X", note: null, url: "https://maps.app.goo.gl/abc" },
      { title: "Bar do Zé", note: null, url: "https://maps.app.goo.gl/def" },
    ]);
  });

  it("ignora linhas em branco", () => {
    const csv = "Title,URL\n\nCafé X,https://maps.app.goo.gl/abc\n,\n";

    expect(parseTakeoutCsv(csv)).toEqual([
      { title: "Café X", note: null, url: "https://maps.app.goo.gl/abc" },
    ]);
  });

  it("devolve lista vazia pra arquivo vazio", () => {
    expect(parseTakeoutCsv("")).toEqual([]);
  });
});
