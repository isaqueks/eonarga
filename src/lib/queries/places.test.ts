import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type QueriesModule = typeof import("./places");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "user-ana", name: "Ana" };
const BIA = { id: "user-bia", name: "Bia" };
const CADU = { id: "user-cadu", name: "Cadu" };

const CATEGORY_ID = "cat-sebo";
const SEBO = "place-sebo";
const BAR = "place-bar";
const MORTO = "place-morto";

let queries: QueriesModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

/** Notas: 2..10 (meios pontos). `updatedAt` explícito pra ordenação determinística. */
const REVIEWS = [
  {
    id: "rev-1",
    placeId: SEBO,
    userId: ANA.id,
    rating: 10,
    verdict: "Achei um Bukowski.",
    updatedAt: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "rev-2",
    placeId: SEBO,
    userId: BIA.id,
    rating: 9,
    verdict: "Café coado salvador.",
    updatedAt: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "rev-3",
    placeId: BAR,
    userId: CADU.id,
    rating: 4,
    verdict: "Narga fraco.",
    updatedAt: "2026-08-10T10:00:00.000Z",
  },
];

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-qplaces-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  queries = await import("./places");

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
    },
    {
      id: BAR,
      slug: "bar-do-ze",
      name: "Bar do Zé",
      categoryId: CATEGORY_ID,
      lat: -27.6,
      lng: -48.55,
      status: "active",
      createdBy: ANA.id,
    },
    {
      id: MORTO,
      slug: "lugar-morto",
      name: "Lugar Morto",
      categoryId: CATEGORY_ID,
      lat: -27.61,
      lng: -48.56,
      status: "archived",
      createdBy: ANA.id,
    },
  ]);
  await db.insert(schema.reviews).values(REVIEWS);
  await db.insert(schema.userPlaceStatus).values([
    { userId: ANA.id, placeId: SEBO, status: "visited" },
    { userId: BIA.id, placeId: SEBO, status: "visited" },
    { userId: CADU.id, placeId: BAR, status: "want" },
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

async function bySlug(slug: string) {
  const all = await queries.listPlaces({ userId: ANA.id });
  const found = all.find((p) => p.slug === slug);
  expect(found, slug).toBeTruthy();
  return found!;
}

describe("listPlaces com avaliações de verdade", () => {
  it("calcula média, contagem e o selo", async () => {
    const sebo = await bySlug("sebo-do-joao");
    // (10 + 9) / 2 = 9,5 em rating → 4,75 estrelas
    expect(sebo.reviewCount).toBe(2);
    expect(sebo.meanStars).toBeCloseTo(4.75, 5);
    // Média alta, mas só 2 notas: sem selo (mínimo é 3).
    expect(sebo.approved).toBe(false);

    const bar = await bySlug("bar-do-ze");
    expect(bar.reviewCount).toBe(1);
    expect(bar.meanStars).toBe(2);
    expect(bar.approved).toBe(false);
  });

  it("ganha o selo com 3 notas altas e perde quando cai", async () => {
    await db.insert(schema.reviews).values({
      id: "rev-selo",
      placeId: SEBO,
      userId: CADU.id,
      rating: 10,
      verdict: "Melhor sebo do Centro.",
      updatedAt: "2026-08-05T10:00:00.000Z",
    });

    const sebo = await bySlug("sebo-do-joao");
    expect(sebo.reviewCount).toBe(3);
    // (10 + 9 + 10) / 2 / 3 = 4,833…
    expect(sebo.meanStars).toBeCloseTo(29 / 6, 5);
    expect(sebo.approved).toBe(true);
    // A mais recente continua sendo a da Bia (20/08).
    expect(sebo.latestVerdict).toBe("Café coado salvador.");

    await db.delete(schema.reviews).where(eq(schema.reviews.id, "rev-selo"));
  });

  it("traz o veredito mais recente com o nome de quem escreveu", async () => {
    const sebo = await bySlug("sebo-do-joao");
    expect(sebo.latestVerdict).toBe("Café coado salvador.");
    expect(sebo.latestVerdictAuthor).toBe("Bia");
    // `lastReviewAt` sai preenchido pra quem tem nota.
    expect(sebo.lastReviewAt).toBeTruthy();

    const bar = await bySlug("bar-do-ze");
    expect(bar.latestVerdict).toBe("Narga fraco.");
    expect(bar.latestVerdictAuthor).toBe("Cadu");
  });

  it("editar uma avaliação antiga muda o veredito em destaque", async () => {
    await db
      .update(schema.reviews)
      .set({ verdict: "Continua ótimo.", updatedAt: "2026-09-01T10:00:00.000Z" })
      .where(eq(schema.reviews.id, "rev-1"));

    const sebo = await bySlug("sebo-do-joao");
    expect(sebo.latestVerdict).toBe("Continua ótimo.");
    expect(sebo.latestVerdictAuthor).toBe("Ana");

    await db
      .update(schema.reviews)
      .set({ verdict: "Achei um Bukowski.", updatedAt: "2026-08-01T10:00:00.000Z" })
      .where(eq(schema.reviews.id, "rev-1"));
  });

  it("não lista o arquivado, mas a ficha dele continua de pé", async () => {
    const ativos = await queries.listPlaces({ userId: ANA.id });
    expect(ativos.map((p) => p.slug)).toEqual(["bar-do-ze", "sebo-do-joao"]);

    const comArquivados = await queries.listPlaces({ userId: ANA.id, includeArchived: true });
    expect(comArquivados.map((p) => p.slug)).toContain("lugar-morto");

    const morto = await queries.getPlaceBySlug("lugar-morto", ANA.id);
    expect(morto?.status).toBe("archived");
    expect(morto?.reviewCount).toBe(0);
    expect(morto?.meanStars).toBeNull();
    expect(morto?.latestVerdict).toBeNull();
    expect(morto?.latestVerdictAuthor).toBeNull();
  });

  it("resolve quem já foi, quem quer ir e o meu status", async () => {
    const sebo = await bySlug("sebo-do-joao");
    expect(sebo.visitedUsers.map((u) => u.name)).toEqual(["Ana", "Bia"]);
    expect(sebo.myStatus).toBe("visited");

    const bar = await bySlug("bar-do-ze");
    expect(bar.wantUsers.map((u) => u.name)).toEqual(["Cadu"]);
    expect(bar.myStatus).toBeNull();
  });

  it("a média global só conta lugares ativos", async () => {
    const { totalStars, totalCount } = await queries.getGlobalRatingStats();
    expect(totalCount).toBe(3);
    // (10 + 9 + 4) / 2 = 11,5 estrelas
    expect(totalStars).toBeCloseTo(11.5, 5);
  });

  it("getPlaceBySlug devolve os mesmos números da lista", async () => {
    const daLista = await bySlug("sebo-do-joao");
    const daFicha = await queries.getPlaceBySlug("sebo-do-joao", ANA.id);
    expect(daFicha).toMatchObject({
      reviewCount: daLista.reviewCount,
      meanStars: daLista.meanStars,
      latestVerdict: daLista.latestVerdict,
      latestVerdictAuthor: daLista.latestVerdictAuthor,
    });
    expect(daFicha?.createdBy.name).toBe("Ana");
  });
});
