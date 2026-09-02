import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type FeedModule = typeof import("./feed");
type FeedEvent = Awaited<ReturnType<FeedModule["listFeed"]>>[number];
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "user-ana", name: "Ana" };
const BIA = { id: "user-bia", name: "Bia" };
const CADU = { id: "user-cadu", name: "Cadu" };

const CATEGORY_ID = "cat-sebo";
const SEBO = "place-sebo";
const BAR = "place-bar";
const MORTO = "place-morto";

let feed: FeedModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

/** Uma data por evento, pra ordem ficar previsível. */
const T = {
  seboCriado: "2026-08-01T10:00:00.000Z",
  barCriado: "2026-08-02T10:00:00.000Z",
  mortoCriado: "2026-08-03T10:00:00.000Z",
  notaAna: "2026-08-04T10:00:00.000Z",
  notaCadu: "2026-08-05T10:00:00.000Z",
  querIr: "2026-08-06T10:00:00.000Z",
  jaFui: "2026-08-07T10:00:00.000Z",
  reacao: "2026-08-08T10:00:00.000Z",
  notaArquivada: "2026-08-09T10:00:00.000Z",
  chamada: "2026-08-10T10:00:00.000Z",
  chamadaMorto: "2026-08-11T10:00:00.000Z",
  aviso: "2026-08-12T10:00:00.000Z",
};

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-feed-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  feed = await import("./feed");

  await db.insert(schema.users).values(
    [ANA, BIA, CADU].map((u) => ({
      id: u.id,
      name: u.name,
      email: `${u.id}@example.com`,
      passwordHash: "x",
    })),
  );

  await db
    .insert(schema.categories)
    .values([
      { id: CATEGORY_ID, name: "Sebo", slug: "sebo", emoji: "📚", color: "#8fd3b0", sortOrder: 0 },
    ]);

  await db.insert(schema.places).values([
    {
      id: SEBO,
      slug: "sebo-do-joao",
      name: "Sebo do João",
      categoryId: CATEGORY_ID,
      lat: -27.59,
      lng: -48.54,
      status: "active",
      createdBy: ANA.id,
      createdAt: T.seboCriado,
      updatedAt: T.seboCriado,
    },
    {
      id: BAR,
      slug: "bar-do-ze",
      name: "Bar do Zé",
      categoryId: CATEGORY_ID,
      lat: -27.6,
      lng: -48.55,
      status: "active",
      createdBy: BIA.id,
      createdAt: T.barCriado,
      updatedAt: T.barCriado,
    },
    {
      id: MORTO,
      slug: "lugar-morto",
      name: "Lugar Morto",
      categoryId: CATEGORY_ID,
      lat: -27.61,
      lng: -48.56,
      status: "archived",
      createdBy: CADU.id,
      createdAt: T.mortoCriado,
      updatedAt: T.mortoCriado,
    },
  ]);

  await db.insert(schema.reviews).values([
    {
      id: "rev-ana",
      placeId: SEBO,
      userId: ANA.id,
      rating: 9,
      verdict: "Achei um Bukowski",
      createdAt: T.notaAna,
      updatedAt: T.notaAna,
    },
    {
      id: "rev-cadu",
      placeId: BAR,
      userId: CADU.id,
      rating: 4,
      verdict: "Narga fraco",
      createdAt: T.notaCadu,
      updatedAt: T.notaCadu,
    },
    {
      id: "rev-morto",
      placeId: MORTO,
      userId: BIA.id,
      rating: 10,
      verdict: "Nota de lugar arquivado",
      createdAt: T.notaArquivada,
      updatedAt: T.notaArquivada,
    },
  ]);

  await db.insert(schema.userPlaceStatus).values([
    { userId: BIA.id, placeId: SEBO, status: "want", updatedAt: T.querIr },
    { userId: CADU.id, placeId: SEBO, status: "visited", updatedAt: T.jaFui },
    { userId: ANA.id, placeId: MORTO, status: "want", updatedAt: T.notaArquivada },
  ]);

  await db.insert(schema.reviewReactions).values([
    { reviewId: "rev-ana", userId: CADU.id, emoji: "🔥", createdAt: T.reacao },
    { reviewId: "rev-morto", userId: ANA.id, emoji: "👍", createdAt: T.notaArquivada },
  ]);

  await db.insert(schema.notifications).values([
    {
      id: "notif-chamada",
      kind: "call",
      title: "E o narga?",
      body: "Bia chamou a galera pro Sebo do João",
      url: "/lugares/sebo-do-joao",
      placeId: SEBO,
      createdBy: BIA.id,
      sentCount: 2,
      createdAt: T.chamada,
    },
    {
      id: "notif-chamada-morto",
      kind: "call",
      title: "E o narga?",
      body: "Cadu chamou a galera pro Lugar Morto",
      url: "/lugares/lugar-morto",
      placeId: MORTO,
      createdBy: CADU.id,
      sentCount: 1,
      createdAt: T.chamadaMorto,
    },
    // Aviso do admin não tem lugar e não é novidade do grupo: fica fora do feed.
    {
      id: "notif-aviso",
      kind: "admin",
      title: "Aviso",
      body: "Sexta tem rolê",
      createdBy: CADU.id,
      sentCount: 3,
      createdAt: T.aviso,
    },
  ]);
});

afterAll(() => {
  db.$client.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // No Windows o arquivo às vezes segue travado por um instante.
  }
});

describe("listFeed", () => {
  it("junta os cinco tipos de evento, do mais novo pro mais velho", async () => {
    const events = await feed.listFeed();

    expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort().reverse());
    expect(events.map((e) => `${e.kind}@${e.at}`)).toEqual([
      `call@${T.chamada}`,
      `reaction@${T.reacao}`,
      `status@${T.jaFui}`,
      `status@${T.querIr}`,
      `review@${T.notaCadu}`,
      `review@${T.notaAna}`,
      `place@${T.barCriado}`,
      `place@${T.seboCriado}`,
    ]);
  });

  it("traz pessoa, lugar e os campos de cada tipo", async () => {
    const events = await feed.listFeed();
    const byKind = <K extends FeedEvent["kind"]>(kind: K) =>
      events.filter((e): e is Extract<FeedEvent, { kind: K }> => e.kind === kind);

    const review = byKind("review")[1];
    expect(review).toMatchObject({
      user: { id: ANA.id, name: "Ana", avatarId: null },
      place: { slug: "sebo-do-joao", name: "Sebo do João", emoji: "📚" },
      // rating 9 = 4,5 nargas
      stars: 4.5,
      verdict: "Achei um Bukowski",
      reviewId: "rev-ana",
    });

    expect(byKind("place")[0]).toMatchObject({
      user: { id: BIA.id, name: "Bia" },
      place: { slug: "bar-do-ze", name: "Bar do Zé" },
    });

    expect(byKind("status").map((e) => e.status)).toEqual(["visited", "want"]);
    expect(byKind("status")[0].user.name).toBe("Cadu");

    expect(byKind("reaction")[0]).toMatchObject({
      user: { id: CADU.id, name: "Cadu" },
      place: { slug: "sebo-do-joao" },
      emoji: "🔥",
      reviewAuthor: "Ana",
    });

    expect(byKind("call")[0]).toMatchObject({
      at: T.chamada,
      user: { id: BIA.id, name: "Bia", avatarId: null },
      place: { slug: "sebo-do-joao", name: "Sebo do João", emoji: "📚" },
    });
  });

  it("ignora o aviso do admin, que não é evento do grupo", async () => {
    const events = await feed.listFeed();

    expect(events.filter((e) => e.kind === "call")).toHaveLength(1);
    expect(events.some((e) => e.at === T.aviso)).toBe(false);
  });

  it("ignora tudo que é de lugar arquivado", async () => {
    const events = await feed.listFeed();

    expect(events.some((e) => e.place.slug === "lugar-morto")).toBe(false);
    expect(events).toHaveLength(8);
  });

  it("respeita o limite", async () => {
    const events = await feed.listFeed({ limit: 3 });

    expect(events).toHaveLength(3);
    expect(events[0].kind).toBe("call");
    expect(events[2].at).toBe(T.jaFui);
  });

  it("pagina com o cursor `before`", async () => {
    const primeira = await feed.listFeed({ limit: 3 });
    const segunda = await feed.listFeed({ limit: 3, before: primeira[2].at });

    expect(segunda).toHaveLength(3);
    expect(segunda.every((e) => e.at < primeira[2].at)).toBe(true);
    expect(segunda.map((e) => e.at)).toEqual([T.querIr, T.notaCadu, T.notaAna]);

    const terceira = await feed.listFeed({ limit: 3, before: segunda[2].at });
    expect(terceira.map((e) => e.at)).toEqual([T.barCriado, T.seboCriado]);

    expect(await feed.listFeed({ before: T.seboCriado })).toEqual([]);
  });

  it("gera chave única por evento", async () => {
    const events = await feed.listFeed();
    const keys = events.map(feed.feedEventKey);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
