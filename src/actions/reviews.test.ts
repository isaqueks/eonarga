import { and, asc, eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/actions/form-state";

type ReviewsModule = typeof import("./reviews");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "user-ana", name: "Ana", role: "member" as const };
const BIA = { id: "user-bia", name: "Bia", role: "member" as const };
const ADMIN = { id: "user-admin", name: "Cadu", role: "admin" as const };

const CATEGORY_ID = "cat-sebo";
const PLACE_ID = "place-sebo";
const PLACE_SLUG = "sebo-do-joao";
const OTHER_ID = "place-bar";
const ARCHIVED_ID = "place-morto";

// Quem está logado e pra onde a action redirecionou (mesmo padrão de places.test.ts).
const state = vi.hoisted(() => ({
  user: null as { id: string; role: "admin" | "member" } | null,
  redirects: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.redirects.push(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  assertUser: async () => {
    if (!state.user) throw new Error("Não autorizado");
    return { user: state.user, session: { id: "sess" } };
  },
  assertAdmin: async () => {
    if (!state.user || state.user.role !== "admin") throw new Error("Não autorizado");
    return { user: state.user, session: { id: "sess" } };
  },
}));

let actions: ReviewsModule;
let queries: typeof import("@/lib/queries/reviews");
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-reviews-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  actions = await import("./reviews");
  queries = await import("@/lib/queries/reviews");

  await db.insert(schema.users).values(
    [ANA, BIA, ADMIN].map((u) => ({
      id: u.id,
      name: u.name,
      email: `${u.id}@example.com`,
      passwordHash: "x",
      role: u.role,
    })),
  );
  await db
    .insert(schema.categories)
    .values([
      { id: CATEGORY_ID, name: "Sebo", slug: "sebo", emoji: "📚", color: "#8fd3b0", sortOrder: 0 },
    ]);
  await db.insert(schema.places).values([
    {
      id: PLACE_ID,
      slug: PLACE_SLUG,
      name: "Sebo do João",
      categoryId: CATEGORY_ID,
      lat: -27.5977,
      lng: -48.5492,
      status: "active",
      createdBy: ANA.id,
    },
    {
      id: OTHER_ID,
      slug: "bar-do-ze",
      name: "Bar do Ze",
      categoryId: CATEGORY_ID,
      lat: -27.598,
      lng: -48.549,
      status: "active",
      createdBy: ANA.id,
    },
    {
      id: ARCHIVED_ID,
      slug: "lugar-morto",
      name: "Lugar Morto",
      categoryId: CATEGORY_ID,
      lat: -27.6,
      lng: -48.55,
      status: "archived",
      createdBy: ANA.id,
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

beforeEach(async () => {
  await db.delete(schema.reviewReactions);
  await db.delete(schema.reviews);
  await db.delete(schema.userPlaceStatus);
  state.user = ANA;
  state.redirects.length = 0;
});

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const BASE_FIELDS = {
  placeId: PLACE_ID,
  rating: "9",
  verdict: "Café bom, livro barato.",
  contentHtml: "<p>Achei um Bukowski.</p>",
  visitedAt: "",
};

const empty: FormState = { ok: false };

async function expectRedirect(run: () => Promise<unknown>): Promise<string> {
  state.redirects.length = 0;
  await expect(run()).rejects.toThrow(/NEXT_REDIRECT/);
  return state.redirects.at(-1)!;
}

function submit(overrides: Record<string, string> = {}) {
  return expectRedirect(() => actions.upsertReview(empty, form({ ...BASE_FIELDS, ...overrides })));
}

async function myReview(userId = ANA.id) {
  return db.query.reviews.findFirst({
    where: and(eq(schema.reviews.placeId, PLACE_ID), eq(schema.reviews.userId, userId)),
  });
}

/** Todas as minhas avaliacoes do lugar, da mais antiga pra mais nova. */
async function myReviews(userId = ANA.id, placeId = PLACE_ID) {
  return db
    .select()
    .from(schema.reviews)
    .where(and(eq(schema.reviews.placeId, placeId), eq(schema.reviews.userId, userId)))
    .orderBy(asc(schema.reviews.createdAt), asc(schema.reviews.id));
}

describe("upsertReview", () => {
  it("cria a avaliação e manda pra ficha, na âncora das avaliações", async () => {
    expect(await submit()).toBe(`/lugares/${PLACE_SLUG}#avaliacoes`);

    const review = await myReview();
    expect(review).toMatchObject({
      placeId: PLACE_ID,
      userId: ANA.id,
      rating: 9,
      verdict: "Café bom, livro barato.",
      contentHtml: "<p>Achei um Bukowski.</p>",
      visitedAt: null,
    });
  });

  it("marca 'já fui' pra quem avaliou", async () => {
    await submit();
    const status = await db.query.userPlaceStatus.findFirst({
      where: and(
        eq(schema.userPlaceStatus.userId, ANA.id),
        eq(schema.userPlaceStatus.placeId, PLACE_ID),
      ),
    });
    expect(status?.status).toBe("visited");
  });

  it("sem reviewId cria linha nova: fui duas vezes, dei duas notas", async () => {
    await submit();
    await submit({ rating: "4", verdict: "Segunda visita, mais fraca.", visitedAt: "2026-08-12" });

    const linhas = await myReviews();
    expect(linhas).toHaveLength(2);
    expect(linhas.map((r) => r.rating).sort()).toEqual([4, 9]);
    // Ids diferentes: são visitas diferentes, não uma edição.
    expect(new Set(linhas.map((r) => r.id)).size).toBe(2);
  });

  it("com reviewId edita aquela avaliação, sem criar outra", async () => {
    await submit();
    const antes = await myReview();

    await submit({
      reviewId: antes!.id,
      rating: "4",
      verdict: "Mudei de ideia.",
      contentHtml: "<p>Fechou cedo.</p>",
    });

    const linhas = await db.select().from(schema.reviews);
    expect(linhas).toHaveLength(1);

    const depois = await myReview();
    expect(depois).toMatchObject({
      id: antes!.id,
      rating: 4,
      verdict: "Mudei de ideia.",
      contentHtml: "<p>Fechou cedo.</p>",
    });
    expect(depois!.createdAt).toBe(antes!.createdAt);
    expect(depois!.updatedAt >= antes!.updatedAt).toBe(true);
  });

  it("recusa reviewId de outra pessoa, de outro lugar ou inexistente", async () => {
    await submit();
    const daAna = (await myReview())!.id;

    // Ana tem outra avaliação, mas no Bar do Ze: não serve pro formulário do Sebo.
    await expectRedirect(() =>
      actions.upsertReview(empty, form({ ...BASE_FIELDS, placeId: OTHER_ID })),
    );
    const noBar = (await myReviews(ANA.id, OTHER_ID))[0]!.id;

    state.user = BIA;
    expect(await actions.upsertReview(empty, form({ ...BASE_FIELDS, reviewId: daAna }))).toEqual({
      ok: false,
      error: "Essa avaliação não é sua.",
    });

    state.user = ANA;
    expect(await actions.upsertReview(empty, form({ ...BASE_FIELDS, reviewId: noBar }))).toEqual({
      ok: false,
      error: "Avaliação não encontrada.",
    });
    expect(await actions.upsertReview(empty, form({ ...BASE_FIELDS, reviewId: "nada" }))).toEqual({
      ok: false,
      error: "Avaliação não encontrada.",
    });

    // Nada foi criado nem mexido pelas recusas.
    expect(await db.select().from(schema.reviews)).toHaveLength(2);
    expect((await myReview())!.verdict).toBe("Café bom, livro barato.");
  });

  it("cada pessoa tem as suas: a avaliação da Bia não mexe na da Ana", async () => {
    await submit();
    state.user = BIA;
    await submit({ rating: "6", verdict: "Achei caro." });

    expect(await db.select().from(schema.reviews)).toHaveLength(2);
    expect((await myReview(ANA.id))?.rating).toBe(9);
    expect((await myReview(BIA.id))?.rating).toBe(6);
  });

  it("sanitiza o HTML antes de gravar", async () => {
    await submit({
      contentHtml:
        '<p onclick="alert(1)">oi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
    });
    const review = await myReview();
    expect(review!.contentHtml).toBe("<p>oi</p>x");
  });

  it("recusa texto puro acima de 5000 caracteres", async () => {
    const gordo = `<p>${"a".repeat(5001)}</p>`;
    const result = await actions.upsertReview(empty, form({ ...BASE_FIELDS, contentHtml: gordo }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.contentHtml).toBe("Texto longo demais (máximo 5000 caracteres).");
    expect(await myReview()).toBeUndefined();

    // 5000 exatos passam; a marcação em volta não conta.
    await submit({ contentHtml: `<p><strong>${"a".repeat(5000)}</strong></p>` });
    expect(await myReview()).toBeTruthy();
  });

  it("recusa veredito curto, nota fora da faixa e data no futuro", async () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ verdict: "ok" }, "verdict"],
      [{ verdict: "" }, "verdict"],
      [{ verdict: "a".repeat(121) }, "verdict"],
      [{ rating: "11" }, "rating"],
      [{ rating: "" }, "rating"],
      [{ visitedAt: "2999-01-01" }, "visitedAt"],
      [{ visitedAt: "ontem" }, "visitedAt"],
    ];
    for (const [override, campo] of cases) {
      const result = await actions.upsertReview(empty, form({ ...BASE_FIELDS, ...override }));
      expect(result.ok, campo).toBe(false);
      expect(Object.keys(result.fieldErrors ?? {}), campo).toContain(campo);
    }
    expect(await db.select().from(schema.reviews)).toHaveLength(0);
  });

  it("recusa lugar que não existe ou está arquivado", async () => {
    expect(await actions.upsertReview(empty, form({ ...BASE_FIELDS, placeId: "nada" }))).toEqual({
      ok: false,
      error: "Lugar não encontrado.",
    });
    expect(
      await actions.upsertReview(empty, form({ ...BASE_FIELDS, placeId: ARCHIVED_ID })),
    ).toEqual({ ok: false, error: "Esse lugar está arquivado." });
    expect(await db.select().from(schema.reviews)).toHaveLength(0);
  });

  it("exige sessão", async () => {
    state.user = null;
    await expect(actions.upsertReview(empty, form(BASE_FIELDS))).rejects.toThrow("Não autorizado");
  });
});

describe("deleteReview", () => {
  async function seedAnaReview(): Promise<string> {
    await submit();
    return (await myReview())!.id;
  }

  it("dono apaga a própria, junto com as reações, e mantém o 'já fui'", async () => {
    const id = await seedAnaReview();
    state.user = BIA;
    await actions.toggleReaction(id, "🔥");

    state.user = ANA;
    expect(await actions.deleteReview(id)).toEqual({ ok: true });
    expect(await db.select().from(schema.reviews)).toHaveLength(0);
    expect(await db.select().from(schema.reviewReactions)).toHaveLength(0);
    // "Já fui" continua: a pessoa foi mesmo.
    expect(await db.select().from(schema.userPlaceStatus)).toHaveLength(1);
  });

  it("outro membro não apaga; admin apaga", async () => {
    const id = await seedAnaReview();

    state.user = BIA;
    expect(await actions.deleteReview(id)).toEqual({
      ok: false,
      error: "Você só apaga a sua avaliação.",
    });
    expect(await db.select().from(schema.reviews)).toHaveLength(1);

    state.user = ADMIN;
    expect(await actions.deleteReview(id)).toEqual({ ok: true });
    expect(await db.select().from(schema.reviews)).toHaveLength(0);
  });

  it("reclama de avaliação que não existe", async () => {
    expect(await actions.deleteReview("nada")).toEqual({
      ok: false,
      error: "Avaliação não encontrada.",
    });
  });
});

describe("toggleReaction", () => {
  async function seedAnaReview(): Promise<string> {
    await submit();
    return (await myReview())!.id;
  }

  it("liga e desliga a reação, devolvendo a contagem nova", async () => {
    const id = await seedAnaReview();

    state.user = BIA;
    expect(await actions.toggleReaction(id, "👍")).toEqual({ ok: true, reacted: true, count: 1 });

    state.user = ADMIN;
    expect(await actions.toggleReaction(id, "👍")).toEqual({ ok: true, reacted: true, count: 2 });

    state.user = BIA;
    expect(await actions.toggleReaction(id, "👍")).toEqual({ ok: true, reacted: false, count: 1 });
    expect(await db.select().from(schema.reviewReactions)).toHaveLength(1);
  });

  it("emojis diferentes convivem na mesma avaliação", async () => {
    const id = await seedAnaReview();
    state.user = BIA;
    await actions.toggleReaction(id, "😂");
    await actions.toggleReaction(id, "💨");
    expect(await db.select().from(schema.reviewReactions)).toHaveLength(2);
  });

  it("recusa emoji fora da lista e avaliação inexistente", async () => {
    const id = await seedAnaReview();
    for (const emoji of ["🍕", "", "<script>", "👍👍"]) {
      expect(await actions.toggleReaction(id, emoji), emoji).toEqual({
        ok: false,
        error: "Esse emoji não existe por aqui.",
      });
    }
    expect(await actions.toggleReaction("nada", "👍")).toEqual({
      ok: false,
      error: "Avaliação não encontrada.",
    });
    expect(await db.select().from(schema.reviewReactions)).toHaveLength(0);
  });

  it("exige sessão", async () => {
    const id = await seedAnaReview();
    state.user = null;
    await expect(actions.toggleReaction(id, "👍")).rejects.toThrow("Não autorizado");
  });
});

describe("queries de avaliação", () => {
  it("lista com autor, reações agregadas e permissões", async () => {
    await submit();
    const anaId = (await myReview())!.id;

    state.user = BIA;
    await submit({ rating: "6", verdict: "Achei caro." });
    await actions.toggleReaction(anaId, "🔥");
    state.user = ADMIN;
    await actions.toggleReaction(anaId, "🔥");
    await actions.toggleReaction(anaId, "👍");

    // Envelhece a da Ana na mão: dois inserts podem cair no mesmo milissegundo.
    await db
      .update(schema.reviews)
      .set({ updatedAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(schema.reviews.id, anaId));

    const lista = await queries.getReviewsForPlace(PLACE_ID, { id: BIA.id, role: "member" });
    expect(lista).toHaveLength(2);
    // Mais recentemente editada primeiro: a da Bia.
    expect(lista[0].author.name).toBe("Bia");

    const daAna = lista.find((r) => r.author.id === ANA.id)!;
    expect(daAna.stars).toBe(4.5);
    // Ordem da lista fixa: 👍 vem antes de 🔥.
    expect(daAna.reactions).toEqual([
      { emoji: "👍", count: 1, mine: false },
      { emoji: "🔥", count: 2, mine: true },
    ]);
    expect(daAna.canEdit).toBe(false);
    expect(daAna.canDelete).toBe(false);

    const comoAdmin = await queries.getReviewsForPlace(PLACE_ID, { id: ADMIN.id, role: "admin" });
    const daAnaAdmin = comoAdmin.find((r) => r.author.id === ANA.id)!;
    expect(daAnaAdmin.canEdit).toBe(false);
    expect(daAnaAdmin.canDelete).toBe(true);
  });

  it("listMyReviews devolve todas as minhas, da mais nova pra mais velha", async () => {
    await submit();
    await submit({ rating: "4", verdict: "Segunda visita, mais fraca." });

    // Dois inserts podem cair no mesmo milissegundo: envelhece a primeira na mão.
    const [primeira] = await myReviews();
    await db
      .update(schema.reviews)
      .set({ createdAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(schema.reviews.id, primeira.id));

    const minhas = await queries.listMyReviews(PLACE_ID, ANA.id);
    expect(minhas).toHaveLength(2);
    expect(minhas[0].verdict).toBe("Segunda visita, mais fraca.");
    expect(minhas[1].verdict).toBe("Café bom, livro barato.");
    expect(minhas.every((r) => r.canEdit && r.canDelete)).toBe(true);

    expect(await queries.listMyReviews(PLACE_ID, BIA.id)).toEqual([]);
  });

  it("getReviewById acha pelo id e marca canEdit só pra quem escreveu", async () => {
    await submit();
    const id = (await myReview())!.id;

    const daAna = await queries.getReviewById(id, { id: ANA.id, role: "member" });
    expect(daAna?.verdict).toBe("Café bom, livro barato.");
    expect(daAna?.placeId).toBe(PLACE_ID);
    expect(daAna?.canEdit).toBe(true);

    // Nem admin edita avaliação dos outros (só apaga).
    const comoAdmin = await queries.getReviewById(id, { id: ADMIN.id, role: "admin" });
    expect(comoAdmin?.canEdit).toBe(false);
    expect(comoAdmin?.canDelete).toBe(true);

    expect(await queries.getReviewById("nada", { id: ANA.id, role: "member" })).toBeNull();
  });

  it("listReviewsByUser traz o lugar junto, inclusive duas do mesmo lugar", async () => {
    await submit();
    await submit({ rating: "4", verdict: "Segunda visita, mais fraca." });
    expect(await queries.listReviewsByUser(ANA.id, { id: ANA.id, role: "member" })).toHaveLength(2);

    await db.delete(schema.reviews).where(eq(schema.reviews.rating, 4));
    const minhas = await queries.listReviewsByUser(ANA.id, { id: ANA.id, role: "member" });
    expect(minhas).toHaveLength(1);
    expect(minhas[0].place).toEqual({
      id: PLACE_ID,
      slug: PLACE_SLUG,
      name: "Sebo do João",
      emoji: "📚",
    });
    expect(await queries.listReviewsByUser(BIA.id, { id: BIA.id, role: "member" })).toEqual([]);
  });
});
