import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isSharingEnabled, makeShareToken, shareUrlFor, verifyShareToken } from "./share";

const PLACE = "pl4c3id0aaaa";
const OTHER_PLACE = "0utr0lugar12";

let previousSecret: string | undefined;
let previousAppUrl: string | undefined;

beforeEach(() => {
  previousSecret = process.env.APP_SECRET;
  previousAppUrl = process.env.APP_URL;
  process.env.APP_SECRET = "segredo-de-teste-nao-use-em-producao";
  process.env.APP_URL = "https://narga.example.com";
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.APP_SECRET;
  else process.env.APP_SECRET = previousSecret;
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

describe("makeShareToken", () => {
  it("gera 22 caracteres base64url, estáveis pro mesmo lugar", () => {
    const token = makeShareToken(PLACE);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(makeShareToken(PLACE)).toBe(token);
  });

  it("dá tokens diferentes pra lugares diferentes", () => {
    expect(makeShareToken(PLACE)).not.toBe(makeShareToken(OTHER_PLACE));
  });

  it("muda quando o segredo muda (trocar APP_SECRET revoga os links)", () => {
    const antes = makeShareToken(PLACE);
    process.env.APP_SECRET = "outro-segredo";
    expect(makeShareToken(PLACE)).not.toBe(antes);
  });
});

describe("verifyShareToken", () => {
  it("aceita o token do próprio lugar", () => {
    expect(verifyShareToken(PLACE, makeShareToken(PLACE))).toBe(true);
  });

  it("recusa token de outro lugar", () => {
    expect(verifyShareToken(PLACE, makeShareToken(OTHER_PLACE))).toBe(false);
  });

  it("recusa token inválido, vazio, nulo ou de outro tamanho", () => {
    const token = makeShareToken(PLACE)!;
    expect(verifyShareToken(PLACE, "aaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(verifyShareToken(PLACE, token.slice(0, -1))).toBe(false);
    expect(verifyShareToken(PLACE, `${token}x`)).toBe(false);
    expect(verifyShareToken(PLACE, "")).toBe(false);
    expect(verifyShareToken(PLACE, null)).toBe(false);
    expect(verifyShareToken(PLACE, undefined)).toBe(false);
    // Caractere multibyte não pode explodir o timingSafeEqual.
    expect(verifyShareToken(PLACE, "á".repeat(22))).toBe(false);
  });
});

describe("sem APP_SECRET", () => {
  beforeEach(() => {
    delete process.env.APP_SECRET;
  });

  it("desliga o recurso inteiro", () => {
    expect(isSharingEnabled()).toBe(false);
    expect(makeShareToken(PLACE)).toBeNull();
    expect(shareUrlFor("sebo-do-joao", PLACE)).toBeNull();
    expect(verifyShareToken(PLACE, "aaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });

  it("segredo só com espaço conta como ausente", () => {
    process.env.APP_SECRET = "   ";
    expect(isSharingEnabled()).toBe(false);
    expect(makeShareToken(PLACE)).toBeNull();
  });
});

describe("shareUrlFor", () => {
  it("monta a URL absoluta com o token", () => {
    expect(shareUrlFor("sebo-do-joao", PLACE)).toBe(
      `https://narga.example.com/p/sebo-do-joao?t=${makeShareToken(PLACE)}`,
    );
  });

  it("tira a barra sobrando do APP_URL e cai pra caminho relativo sem ele", () => {
    process.env.APP_URL = "https://narga.example.com/";
    expect(shareUrlFor("x", PLACE)).toBe(
      `https://narga.example.com/p/x?t=${makeShareToken(PLACE)}`,
    );

    delete process.env.APP_URL;
    expect(shareUrlFor("x", PLACE)).toBe(`/p/x?t=${makeShareToken(PLACE)}`);
  });
});
