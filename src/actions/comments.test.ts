import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/actions/form-state";

type CommentsModule = typeof import("./comments");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "user-ana", name: "Ana", role: "member" as const };
const BIA = { id: "user-bia", name: "Bia", role: "member" as const };
const CADU = { id: "user-cadu", name: "Cadu", role: "member" as const };
const ADMIN = { id: "user-admin", name: "Dani", role: "admin" as const };

const CATEGORY_ID = "cat-sebo";
const PLACE_ID = "place-sebo";
const PLACE_SLUG = "sebo-do-joao";
const ARCHIVED_ID = "place-morto";

// Avaliação da Ana no lugar ativo; a do Cadu mora no lugar arquivado.
const REVIEW_ID = "rev-ana";
const ARCHIVED_REVIEW_ID = "rev-morto";

const state = vi.hoisted(() => ({
  user: null as { id: string; name?: string; role: "admin" | "member" } | null,
}));

// Menção numa resposta vira push: o web-push vira um espião aqui.
const webpush = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));
vi.mock("web-push", () => ({ default: webpush }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

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

let actions: CommentsModule;
let comments: typeof import("@/lib/queries/comments");
let reviewQueries: typeof import("@/lib/queries/reviews");
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

const empty: FormState = { ok: false };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function add(body: string, reviewId = REVIEW_ID) {
  return actions.addComment(empty, form({ reviewId, body }));
}

async function rows() {
  return db.select().from(schema.reviewComments);
}

/** Escreve uma resposta como `who` e devolve o id dela. */
async function seed(who: typeof ANA, body: string, reviewId = REVIEW_ID): Promise<string> {
  const before = state.user;
  state.user = who;
  expect(await add(body, reviewId)).toEqual({ ok: true });
  state.user = before;
  const all = await db
    .select()
    .from(schema.reviewComments)
    .where(eq(schema.reviewComments.body, body));
  return all[0].id;
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-comments-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  actions = await import("./comments");
  comments = await import("@/lib/queries/comments");
  reviewQueries = await import("@/lib/queries/reviews");

  await db.insert(schema.users).values(
    [ANA, BIA, CADU, ADMIN].map((u) => ({
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
      lat: -27.59,
      lng: -48.54,
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
  await db.insert(schema.reviews).values([
    {
      id: REVIEW_ID,
      placeId: PLACE_ID,
      userId: ANA.id,
      rating: 9,
      verdict: "Café bom, livro barato.",
    },
    {
      id: ARCHIVED_REVIEW_ID,
      placeId: ARCHIVED_ID,
      userId: CADU.id,
      rating: 4,
      verdict: "Fechou.",
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
  await db.delete(schema.reviewComments);
  state.user = BIA;
});

describe("addComment", () => {
  it("grava a resposta com o autor logado", async () => {
    expect(await add("Discordo, o café é ruim.")).toEqual({ ok: true });

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      reviewId: REVIEW_ID,
      userId: BIA.id,
      body: "Discordo, o café é ruim.",
    });
  });

  it("apara o texto e aceita 500 caracteres cravados", async () => {
    expect(await add("   sem espaço sobrando   ")).toEqual({ ok: true });
    expect((await rows())[0].body).toBe("sem espaço sobrando");

    await db.delete(schema.reviewComments);
    expect(await add("a".repeat(500))).toEqual({ ok: true });
    expect((await rows())[0].body).toHaveLength(500);
  });

  it("recusa vazio, só espaço e texto acima de 500", async () => {
    for (const body of ["", "   ", "\n\t ", "a".repeat(501)]) {
      const result = await add(body);
      expect(result.ok, JSON.stringify(body)).toBe(false);
      expect(result.fieldErrors?.body).toBe("Escreve alguma coisa (até 500 caracteres).");
    }
    expect(await rows()).toHaveLength(0);
  });

  it("recusa avaliação que não existe", async () => {
    expect(await add("oi", "nada")).toEqual({ ok: false, error: "Avaliação não encontrada." });
    expect(await rows()).toHaveLength(0);
  });

  it("recusa responder em lugar arquivado", async () => {
    expect(await add("oi", ARCHIVED_REVIEW_ID)).toEqual({
      ok: false,
      error: "Esse lugar está arquivado.",
    });
    expect(await rows()).toHaveLength(0);
  });

  it("exige sessão", async () => {
    state.user = null;
    await expect(add("oi")).rejects.toThrow("Não autorizado");
  });
});

describe("deleteComment", () => {
  it("quem escreveu apaga a própria", async () => {
    const id = await seed(BIA, "minha resposta");
    state.user = BIA;
    expect(await actions.deleteComment(id)).toEqual({ ok: true });
    expect(await rows()).toHaveLength(0);
  });

  it("o autor da avaliação apaga resposta dos outros (a thread é dele)", async () => {
    const id = await seed(BIA, "resposta da Bia");
    state.user = ANA;
    expect(await actions.deleteComment(id)).toEqual({ ok: true });
    expect(await rows()).toHaveLength(0);
  });

  it("admin apaga qualquer uma", async () => {
    const id = await seed(BIA, "resposta da Bia");
    state.user = ADMIN;
    expect(await actions.deleteComment(id)).toEqual({ ok: true });
    expect(await rows()).toHaveLength(0);
  });

  it("terceiro não apaga", async () => {
    const id = await seed(BIA, "resposta da Bia");
    state.user = CADU;
    expect(await actions.deleteComment(id)).toEqual({
      ok: false,
      error: "Essa resposta não é sua.",
    });
    expect(await rows()).toHaveLength(1);
  });

  it("reclama de resposta que não existe", async () => {
    expect(await actions.deleteComment("nada")).toEqual({
      ok: false,
      error: "Resposta não encontrada.",
    });
  });

  it("exige sessão", async () => {
    const id = await seed(BIA, "resposta da Bia");
    state.user = null;
    await expect(actions.deleteComment(id)).rejects.toThrow("Não autorizado");
  });

  it("some junto com a avaliação (cascade)", async () => {
    await seed(BIA, "vai sumir");
    await db.delete(schema.reviews).where(eq(schema.reviews.id, REVIEW_ID));
    expect(await rows()).toHaveLength(0);

    // Recoloca a avaliação pros outros testes.
    await db.insert(schema.reviews).values({
      id: REVIEW_ID,
      placeId: PLACE_ID,
      userId: ANA.id,
      rating: 9,
      verdict: "Café bom, livro barato.",
    });
  });
});

describe("listCommentsForReviews", () => {
  it("devolve em ordem cronológica, com autor e permissão", async () => {
    const daBia = await seed(BIA, "primeira");
    // Envelhece a primeira na mão: dois inserts podem cair no mesmo milissegundo.
    await db
      .update(schema.reviewComments)
      .set({ createdAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(schema.reviewComments.id, daBia));
    await seed(CADU, "segunda");

    const byReview = await comments.listCommentsForReviews([REVIEW_ID], {
      id: CADU.id,
      role: "member",
    });
    const list = byReview.get(REVIEW_ID)!;
    expect(list.map((c) => c.body)).toEqual(["primeira", "segunda"]);
    expect(list[0].author).toEqual({ id: BIA.id, name: "Bia", avatarId: null });
    // O Cadu só apaga a dele.
    expect(list.map((c) => c.canDelete)).toEqual([false, true]);

    // A Ana escreveu a avaliação: apaga as duas.
    const daAna = await comments.listCommentsForReviews([REVIEW_ID], {
      id: ANA.id,
      role: "member",
    });
    expect(daAna.get(REVIEW_ID)!.map((c) => c.canDelete)).toEqual([true, true]);

    // Admin também.
    const doAdmin = await comments.listCommentsForReviews([REVIEW_ID], {
      id: ADMIN.id,
      role: "admin",
    });
    expect(doAdmin.get(REVIEW_ID)!.map((c) => c.canDelete)).toEqual([true, true]);
  });

  it("devolve mapa vazio sem ids", async () => {
    expect(await comments.listCommentsForReviews([], { id: ANA.id, role: "member" })).toEqual(
      new Map(),
    );
  });

  it("chega junto na avaliação da ficha", async () => {
    await seed(BIA, "resposta na ficha");
    const lista = await reviewQueries.getReviewsForPlace(PLACE_ID, {
      id: ANA.id,
      role: "member",
    });
    expect(lista[0].comments.map((c) => c.body)).toEqual(["resposta na ficha"]);
    // `listMyReviews` não carrega a thread de propósito.
    expect((await reviewQueries.listMyReviews(PLACE_ID, ANA.id))[0]?.comments).toEqual([]);
  });
});

describe("menção numa resposta", () => {
  it("cita alguém e a pessoa leva push apontando pra ficha", async () => {
    Object.assign(process.env, {
      VAPID_PUBLIC_KEY: "chave-publica",
      VAPID_PRIVATE_KEY: "chave-privada",
      VAPID_SUBJECT: "https://eonarga.com.br",
    });
    webpush.sendNotification.mockReset();
    webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
    await db.delete(schema.notifications);
    await db.insert(schema.pushSubscriptions).values({
      id: "sub-bia",
      userId: BIA.id,
      endpoint: "https://push.example.com/bia-celular",
      p256dh: "p",
      auth: "a",
    });

    state.user = { ...ANA, name: "Ana" };
    expect(
      await actions.addComment(empty, form({ reviewId: REVIEW_ID, body: "@Bia: concorda?" })),
    ).toEqual({ ok: true });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(webpush.sendNotification.mock.calls[0][1] as string) as {
      body: string;
      url: string;
    };
    expect(payload.body).toBe("Ana te mencionou num comentário: “@Bia: concorda?”");
    expect(payload.url).toBe(`/lugares/${PLACE_SLUG}#avaliacoes`);
    expect((await db.select().from(schema.notifications))[0]).toMatchObject({
      kind: "mention",
      targetUserId: BIA.id,
    });

    delete process.env.VAPID_PRIVATE_KEY;
    await db.delete(schema.pushSubscriptions);
  });
});
