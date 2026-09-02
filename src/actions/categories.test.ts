import { asc, eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/actions/form-state";

type CategoriesModule = typeof import("./categories");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ADMIN = { id: "user-admin", role: "admin" as const };
const MEMBER = { id: "user-membro", role: "member" as const };

const state = vi.hoisted(() => ({
  user: null as { id: string; role: "admin" | "member" } | null,
}));

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

let actions: CategoriesModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-categorias-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  actions = await import("./categories");

  await db.insert(schema.users).values([
    { id: ADMIN.id, name: "Cadu", email: "cadu@example.com", passwordHash: "x", role: "admin" },
    { id: MEMBER.id, name: "Bia", email: "bia@example.com", passwordHash: "x", role: "member" },
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
  await db.delete(schema.places);
  await db.delete(schema.categories);
  state.user = ADMIN;
});

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const empty: FormState = { ok: false };

const create = (fields: Record<string, string>) => actions.createCategory(empty, form(fields));

const BAR = { name: "Bar", emoji: "🍺", color: "#E0894A" };
const SEBO = { name: "Sebo", emoji: "📚", color: "#8fd3b0" };

async function allCategories() {
  return db
    .select()
    .from(schema.categories)
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
}

describe("createCategory", () => {
  it("gera slug, normaliza a cor e empilha no fim da ordem", async () => {
    expect(await create(BAR)).toEqual({ ok: true });
    expect(await create({ name: "Café & Sebo", emoji: "☕", color: "#a97c50" })).toEqual({
      ok: true,
    });

    const [primeira, segunda] = await allCategories();
    expect(primeira).toMatchObject({ name: "Bar", slug: "bar", color: "#e0894a", sortOrder: 0 });
    expect(segunda).toMatchObject({ name: "Café & Sebo", slug: "cafe-e-sebo", sortOrder: 1 });
  });

  it("recusa nome repetido", async () => {
    await create(BAR);
    const result = await create({ ...BAR, emoji: "🍸" });
    expect(result.fieldErrors?.name).toBe("Já tem uma categoria com esse nome.");
    expect(await allCategories()).toHaveLength(1);
  });

  it("valida nome, emoji e cor", async () => {
    expect((await create({ ...BAR, name: "B" })).fieldErrors).toHaveProperty("name");
    expect((await create({ ...BAR, emoji: "" })).fieldErrors).toHaveProperty("emoji");
    expect((await create({ ...BAR, emoji: "aaaaa" })).fieldErrors).toHaveProperty("emoji");
    expect((await create({ ...BAR, color: "vermelho" })).fieldErrors).toHaveProperty("color");
    expect((await create({ ...BAR, color: "#fff" })).fieldErrors).toHaveProperty("color");
    // Emoji composto (🍽️ = 2 code points) passa.
    expect(await create({ ...BAR, name: "Restaurante", emoji: "🍽️" })).toEqual({ ok: true });
  });

  it("só admin", async () => {
    state.user = MEMBER;
    await expect(create(BAR)).rejects.toThrow("Não autorizado");
    state.user = null;
    await expect(create(BAR)).rejects.toThrow("Não autorizado");
  });
});

describe("updateCategory", () => {
  it("muda nome, emoji e cor sem mexer no slug", async () => {
    await create(BAR);
    const [bar] = await allCategories();

    const result = await actions.updateCategory(
      empty,
      form({ id: bar.id, name: "Botequim", emoji: "🍸", color: "#123ABC" }),
    );
    expect(result).toEqual({ ok: true });

    const [updated] = await allCategories();
    expect(updated).toMatchObject({
      name: "Botequim",
      emoji: "🍸",
      color: "#123abc",
      slug: "bar",
    });
  });

  it("recusa id inexistente e nome já usado", async () => {
    await create(BAR);
    await create(SEBO);
    const [bar] = await allCategories();

    expect(await actions.updateCategory(empty, form({ id: "nada", ...BAR }))).toEqual({
      ok: false,
      error: "Categoria não encontrada.",
    });
    expect(
      (await actions.updateCategory(empty, form({ id: bar.id, ...SEBO }))).fieldErrors?.name,
    ).toBe("Já tem uma categoria com esse nome.");
    // Manter o próprio nome não conta como duplicata.
    expect(await actions.updateCategory(empty, form({ id: bar.id, ...BAR }))).toEqual({ ok: true });
  });
});

describe("deleteCategory", () => {
  it("apaga categoria vazia", async () => {
    await create(BAR);
    const [bar] = await allCategories();
    expect(await actions.deleteCategory(bar.id)).toEqual({ ok: true });
    expect(await allCategories()).toHaveLength(0);
  });

  it("recusa quando tem lugar vinculado", async () => {
    await create(BAR);
    const [bar] = await allCategories();
    await db.insert(schema.places).values([
      {
        id: "place-1",
        slug: "bar-do-ze",
        name: "Bar do Zé",
        categoryId: bar.id,
        lat: -27.5,
        lng: -48.5,
        createdBy: ADMIN.id,
      },
      {
        id: "place-2",
        slug: "bar-da-ana",
        name: "Bar da Ana",
        categoryId: bar.id,
        lat: -27.5,
        lng: -48.5,
        createdBy: ADMIN.id,
      },
    ]);

    expect(await actions.deleteCategory(bar.id)).toEqual({
      ok: false,
      error: "Tem 2 lugar(es) nessa categoria. Move eles antes.",
    });
    expect(await allCategories()).toHaveLength(1);
  });

  it("reclama de id inexistente", async () => {
    expect(await actions.deleteCategory("nada")).toEqual({
      ok: false,
      error: "Categoria não encontrada.",
    });
  });
});

describe("moveCategory", () => {
  async function nomesNaOrdem() {
    return (await allCategories()).map((c) => c.name);
  }

  it("troca de lugar com a vizinha", async () => {
    await create(BAR);
    await create(SEBO);
    await create({ name: "Tabacaria", emoji: "💨", color: "#8a9bb8" });
    expect(await nomesNaOrdem()).toEqual(["Bar", "Sebo", "Tabacaria"]);

    const sebo = (await allCategories())[1];
    expect(await actions.moveCategory(sebo.id, "up")).toEqual({ ok: true });
    expect(await nomesNaOrdem()).toEqual(["Sebo", "Bar", "Tabacaria"]);

    expect(await actions.moveCategory(sebo.id, "down")).toEqual({ ok: true });
    expect(await nomesNaOrdem()).toEqual(["Bar", "Sebo", "Tabacaria"]);
  });

  it("não faz nada nas pontas", async () => {
    await create(BAR);
    await create(SEBO);
    const [bar, sebo] = await allCategories();

    expect(await actions.moveCategory(bar.id, "up")).toEqual({ ok: true });
    expect(await actions.moveCategory(sebo.id, "down")).toEqual({ ok: true });
    expect(await nomesNaOrdem()).toEqual(["Bar", "Sebo"]);
  });

  it("desempata ordens iguais renumerando", async () => {
    await create(BAR);
    await create(SEBO);
    await db.update(schema.categories).set({ sortOrder: 0 });

    const sebo = (await allCategories()).find((c) => c.name === "Sebo")!;
    expect(await actions.moveCategory(sebo.id, "up")).toEqual({ ok: true });

    const ordenadas = await allCategories();
    expect(ordenadas.map((c) => c.name)).toEqual(["Sebo", "Bar"]);
    expect(ordenadas.map((c) => c.sortOrder)).toEqual([0, 1]);
  });

  it("recusa id inexistente, direção inválida e não-admin", async () => {
    expect(await actions.moveCategory("nada", "up")).toEqual({
      ok: false,
      error: "Categoria não encontrada.",
    });

    await create(BAR);
    const [bar] = await allCategories();
    expect(await actions.moveCategory(bar.id, "left" as "up")).toEqual({
      ok: false,
      error: "Direção inválida.",
    });

    state.user = MEMBER;
    await expect(actions.moveCategory(bar.id, "up")).rejects.toThrow("Não autorizado");
  });
});

describe("integração com o schema", () => {
  it("a FK de places é restrict: o banco também barra apagar categoria em uso", async () => {
    await create(BAR);
    const [bar] = await allCategories();
    await db.insert(schema.places).values({
      id: "place-fk",
      slug: "bar-fk",
      name: "Bar FK",
      categoryId: bar.id,
      lat: -27.5,
      lng: -48.5,
      createdBy: ADMIN.id,
    });

    await expect(
      db.delete(schema.categories).where(eq(schema.categories.id, bar.id)),
    ).rejects.toThrow();
  });
});
