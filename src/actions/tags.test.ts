import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type TagsModule = typeof import("./tags");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "user-ana", name: "Ana", role: "member" as const };
const BIA = { id: "user-bia", name: "Bia", role: "member" as const };

const CATEGORY_ID = "cat-sebo";
const SEBO = "place-sebo";
const BAR = "place-bar";
const MORTO = "place-morto";

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

let actions: TagsModule;
let queries: typeof import("@/lib/queries/places");
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

async function tagsOf(placeId: string): Promise<string[]> {
  const rows = await db
    .select()
    .from(schema.placeTags)
    .where(eq(schema.placeTags.placeId, placeId));
  return rows.map((r) => r.tag).sort();
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-tags-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  actions = await import("./tags");
  queries = await import("@/lib/queries/places");

  await db.insert(schema.users).values(
    [ANA, BIA].map((u) => ({
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
  await db.delete(schema.placeTags);
  state.user = ANA;
});

describe("setPlaceTags", () => {
  it("normaliza, deduplica e devolve em ordem alfabética", async () => {
    const result = await actions.setPlaceTags(SEBO, [
      "Fecha CEDO",
      "aceita pix",
      "  fecha cedo  ",
      "Café!",
    ]);
    expect(result.ok).toBe(true);
    expect(result.tags).toEqual(["aceita pix", "cafe", "fecha cedo"]);
    expect(await tagsOf(SEBO)).toEqual(["aceita pix", "cafe", "fecha cedo"]);
  });

  it("guarda quem colocou", async () => {
    state.user = BIA;
    await actions.setPlaceTags(SEBO, ["bom e barato"]);
    const rows = await db.select().from(schema.placeTags);
    expect(rows[0].createdBy).toBe(BIA.id);
  });

  it("substitui o conjunto inteiro, não acumula", async () => {
    await actions.setPlaceTags(SEBO, ["aceita pix", "fecha cedo"]);
    await actions.setPlaceTags(SEBO, ["fecha cedo", "tem narga"]);
    expect(await tagsOf(SEBO)).toEqual(["fecha cedo", "tem narga"]);

    // Lista vazia limpa tudo.
    expect(await actions.setPlaceTags(SEBO, [])).toEqual({ ok: true, tags: [] });
    expect(await tagsOf(SEBO)).toEqual([]);
  });

  it("qualquer membro mexe nas tags de qualquer lugar", async () => {
    state.user = BIA;
    expect((await actions.setPlaceTags(SEBO, ["da bia"])).ok).toBe(true);
    expect(await tagsOf(SEBO)).toEqual(["da bia"]);
  });

  it("aceita 8 tags e recusa a nona", async () => {
    const oito = Array.from({ length: 8 }, (_, i) => `tag ${i}`);
    expect((await actions.setPlaceTags(SEBO, oito)).ok).toBe(true);
    expect(await tagsOf(SEBO)).toHaveLength(8);

    const nove = [...oito, "tag 8"];
    expect(await actions.setPlaceTags(SEBO, nove)).toEqual({
      ok: false,
      error: "No máximo 8 tags. Escolhe.",
    });
    // Falhou: o conjunto antigo continua lá.
    expect(await tagsOf(SEBO)).toHaveLength(8);
  });

  it("ignora campo em branco e reclama de tag impossível", async () => {
    expect((await actions.setPlaceTags(SEBO, ["aceita pix", "  ", ""])).tags).toEqual([
      "aceita pix",
    ]);
    const result = await actions.setPlaceTags(SEBO, ["!!!"]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Tag esquisita");
  });

  it("recusa lugar inexistente e lugar arquivado", async () => {
    expect(await actions.setPlaceTags("nada", ["x y"])).toEqual({
      ok: false,
      error: "Lugar não encontrado.",
    });
    expect(await actions.setPlaceTags(MORTO, ["x y"])).toEqual({
      ok: false,
      error: "Esse lugar está arquivado.",
    });
    expect(await db.select().from(schema.placeTags)).toHaveLength(0);
  });

  it("exige sessão", async () => {
    state.user = null;
    await expect(actions.setPlaceTags(SEBO, ["x y"])).rejects.toThrow("Não autorizado");
  });

  it("some junto com o lugar (cascade)", async () => {
    await actions.setPlaceTags(BAR, ["vai sumir"]);
    await db.delete(schema.places).where(eq(schema.places.id, BAR));
    expect(await db.select().from(schema.placeTags)).toHaveLength(0);

    // Recoloca o bar pros outros testes.
    await db.insert(schema.places).values({
      id: BAR,
      slug: "bar-do-ze",
      name: "Bar do Zé",
      categoryId: CATEGORY_ID,
      lat: -27.6,
      lng: -48.55,
      status: "active",
      createdBy: ANA.id,
    });
  });
});

describe("tags nas listagens", () => {
  beforeEach(async () => {
    await actions.setPlaceTags(SEBO, ["fecha cedo", "aceita pix"]);
    await actions.setPlaceTags(BAR, ["aceita pix"]);
    // Arquivado também tem tag, pra provar que ela não entra na contagem.
    await db
      .insert(schema.placeTags)
      .values([{ placeId: MORTO, tag: "aceita pix", createdBy: ANA.id }]);
  });

  it("listPlaces devolve as tags em ordem alfabética", async () => {
    const all = await queries.listPlaces({ userId: ANA.id });
    const sebo = all.find((p) => p.id === SEBO)!;
    expect(sebo.tags).toEqual(["aceita pix", "fecha cedo"]);
    expect(all.find((p) => p.id === BAR)!.tags).toEqual(["aceita pix"]);
  });

  it("listPlaces filtra por tag", async () => {
    const comPix = await queries.listPlaces({ userId: ANA.id, tag: "aceita pix" });
    expect(comPix.map((p) => p.id).sort()).toEqual([BAR, SEBO].sort());

    const fechaCedo = await queries.listPlaces({ userId: ANA.id, tag: "fecha cedo" });
    expect(fechaCedo.map((p) => p.id)).toEqual([SEBO]);

    // Normaliza o que veio da URL antes de filtrar.
    expect(await queries.listPlaces({ userId: ANA.id, tag: "Fecha CEDO" })).toHaveLength(1);
    // Arquivado só aparece com includeArchived.
    expect(
      (await queries.listPlaces({ userId: ANA.id, tag: "aceita pix", includeArchived: true })).map(
        (p) => p.id,
      ),
    ).toContain(MORTO);
    // Tag que não existe (ou nem seria válida) devolve lista vazia.
    expect(await queries.listPlaces({ userId: ANA.id, tag: "nada disso" })).toEqual([]);
    expect(await queries.listPlaces({ userId: ANA.id, tag: "!" })).toEqual([]);
  });

  it("getPlaceBySlug traz as tags da ficha", async () => {
    const place = await queries.getPlaceBySlug("sebo-do-joao", ANA.id);
    expect(place?.tags).toEqual(["aceita pix", "fecha cedo"]);
  });

  it("listTagsWithCounts conta só lugar ativo, da mais usada pra menos", async () => {
    expect(await queries.listTagsWithCounts()).toEqual([
      { tag: "aceita pix", count: 2 },
      { tag: "fecha cedo", count: 1 },
    ]);
  });
});
