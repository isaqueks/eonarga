import { asc } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportState } from "@/actions/form-state";

type ImportModule = typeof import("./import");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ADMIN = { id: "user-admin", name: "Cadu", role: "admin" as const };
const MEMBER = { id: "user-membro", name: "Ana", role: "member" as const };
const CATEGORY_ID = "cat-sebo";

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

let actions: ImportModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

/**
 * Link completo do Maps: `resolveGoogleMapsLink` resolve pelo parser, sem rede.
 * É de propósito — o teste não depende do Google estar de pé.
 */
function mapsUrl(name: string, lat: number, lng: number): string {
  return `https://www.google.com/maps/place/${encodeURIComponent(name)}/@${lat},${lng},17z`;
}

const SEBO = mapsUrl("Sebo do João", -27.5977, -48.5492);
const BAR = mapsUrl("Bar do Zé", -27.6, -48.55);

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-import-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  actions = await import("./import");

  await db.insert(schema.users).values(
    [ADMIN, MEMBER].map((u) => ({
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
  state.user = ADMIN;
});

const empty: ImportState = { ok: false };

function form(fields: Record<string, string>, csv?: string): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  if (csv !== undefined) fd.set("csv", new File([csv], "lista.csv", { type: "text/csv" }));
  return fd;
}

async function allPlaces() {
  return db.select().from(schema.places).orderBy(asc(schema.places.slug));
}

describe("importPlaces", () => {
  it("cria os lugares dos links colados", async () => {
    const result = await actions.importPlaces(
      empty,
      form({ categoryId: CATEGORY_ID, links: `${SEBO}\n\n${BAR}\n` }),
    );

    expect(result.ok).toBe(true);
    expect(result.report?.created).toEqual(["Sebo do João", "Bar do Zé"]);
    expect(result.report?.skipped).toEqual([]);
    expect(result.report?.failed).toEqual([]);

    const rows = await allPlaces();
    expect(rows.map((r) => r.slug)).toEqual(["bar-do-ze", "sebo-do-joao"]);
    expect(rows[1]).toMatchObject({
      name: "Sebo do João",
      categoryId: CATEGORY_ID,
      hasNarga: "unknown",
      status: "active",
      createdBy: ADMIN.id,
      lat: -27.5977,
      lng: -48.5492,
    });
    expect(rows[1].googleMapsUrl).toContain("google.com/maps/place");
  });

  it("pula o que já existe pelo link e pelo par nome+coordenada", async () => {
    await actions.importPlaces(empty, form({ categoryId: CATEGORY_ID, links: SEBO }));

    // Mesmo link e, logo depois, o mesmo nome a ~10 m de distância.
    const quase = mapsUrl("Sebo do João", -27.5977, -48.5491);
    const result = await actions.importPlaces(
      empty,
      form({ categoryId: CATEGORY_ID, links: `${SEBO}\n${quase}` }),
    );

    expect(result.report?.created).toEqual([]);
    expect(result.report?.skipped).toEqual(["Sebo do João", "Sebo do João"]);
    expect(await allPlaces()).toHaveLength(1);
  });

  it("cadastra homônimo que fica longe", async () => {
    await actions.importPlaces(empty, form({ categoryId: CATEGORY_ID, links: SEBO }));

    const longe = mapsUrl("Sebo do João", -27.62, -48.51);
    const result = await actions.importPlaces(
      empty,
      form({ categoryId: CATEGORY_ID, links: longe }),
    );

    expect(result.report?.created).toEqual(["Sebo do João"]);
    // Slug repetido ganha sufixo.
    expect((await allPlaces()).map((r) => r.slug)).toEqual(["sebo-do-joao", "sebo-do-joao-2"]);
  });

  it("reprova link que não é do Google Maps", async () => {
    const result = await actions.importPlaces(
      empty,
      form({ categoryId: CATEGORY_ID, links: "https://evil.com/maps?q=-27,-48\nnem url isso é" }),
    );

    expect(result.report?.created).toEqual([]);
    expect(result.report?.failed).toEqual([
      { line: "https://evil.com/maps?q=-27,-48", reason: "Não é link do Google Maps." },
      { line: "nem url isso é", reason: "Não é link do Google Maps." },
    ]);
    expect(await allPlaces()).toHaveLength(0);
  });

  it("importa do CSV, usando o nome da planilha", async () => {
    // A URL do Maps tem vírgula nas coordenadas: no CSV ela vem entre aspas.
    const csv = ["Title,Note,URL,Tags", `"Sebo da Ana",achei bom,"${SEBO}",`, "Sem link,,,"].join(
      "\n",
    );

    const result = await actions.importPlaces(empty, form({ categoryId: CATEGORY_ID }, csv));

    expect(result.report?.created).toEqual(["Sebo da Ana"]);
    expect(result.report?.failed).toEqual([
      { line: "Sem link", reason: "Essa linha não tem link." },
    ]);
    expect((await allPlaces())[0].name).toBe("Sebo da Ana");
  });

  it("recusa mais de 100 linhas de uma vez", async () => {
    const links = Array.from({ length: 101 }, (_, i) =>
      mapsUrl(`Lugar ${i}`, -27.5 - i / 1000, -48.5),
    );
    const result = await actions.importPlaces(
      empty,
      form({ categoryId: CATEGORY_ID, links: links.join("\n") }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("100");
    expect(await allPlaces()).toHaveLength(0);
  });

  it("reclama de categoria vazia ou inexistente e de linha nenhuma", async () => {
    expect(await actions.importPlaces(empty, form({ categoryId: "", links: SEBO }))).toMatchObject({
      ok: false,
      fieldErrors: { categoryId: "Escolhe uma categoria" },
    });

    expect(
      await actions.importPlaces(empty, form({ categoryId: "nao-existe", links: SEBO })),
    ).toMatchObject({ fieldErrors: { categoryId: "Categoria não encontrada." } });

    expect(
      await actions.importPlaces(empty, form({ categoryId: CATEGORY_ID, links: "  \n \n" })),
    ).toMatchObject({ ok: false });
  });

  it("é só pra admin", async () => {
    state.user = MEMBER;
    await expect(
      actions.importPlaces(empty, form({ categoryId: CATEGORY_ID, links: SEBO })),
    ).rejects.toThrow("Não autorizado");

    state.user = null;
    await expect(
      actions.importPlaces(empty, form({ categoryId: CATEGORY_ID, links: SEBO })),
    ).rejects.toThrow("Não autorizado");
  });
});
