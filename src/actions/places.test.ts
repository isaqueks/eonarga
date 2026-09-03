import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/actions/form-state";

type PlacesModule = typeof import("./places");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const OWNER = { id: "user-dono", name: "Ana", role: "member" as const };
const OTHER = { id: "user-outro", name: "Bia", role: "member" as const };
const ADMIN = { id: "user-admin", name: "Cadu", role: "admin" as const };

const CATEGORY_ID = "cat-bar";
const OTHER_CATEGORY_ID = "cat-sebo";

// Quem está logado e pra onde a action redirecionou. `vi.hoisted` porque os
// factories de `vi.mock` sobem pro topo do arquivo.
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

let actions: PlacesModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-places-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  actions = await import("./places");

  await db.insert(schema.users).values(
    [OWNER, OTHER, ADMIN].map((u) => ({
      id: u.id,
      name: u.name,
      email: `${u.id}@example.com`,
      passwordHash: "x",
      role: u.role,
    })),
  );
  await db.insert(schema.categories).values([
    { id: CATEGORY_ID, name: "Bar", slug: "bar", emoji: "🍺", color: "#e0894a", sortOrder: 0 },
    {
      id: OTHER_CATEGORY_ID,
      name: "Sebo",
      slug: "sebo",
      emoji: "📚",
      color: "#8fd3b0",
      sortOrder: 1,
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
  await db.delete(schema.userPlaceStatus);
  await db.delete(schema.places);
  state.user = OWNER;
  state.redirects.length = 0;
});

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const BASE_FIELDS = {
  name: "Sebo do João",
  categoryId: CATEGORY_ID,
  lat: "-27.5977",
  lng: "-48.5492",
  address: "Rua Conselheiro Mafra, 255 - Centro",
  description: "Livro velho e café.",
  tips: "Pede o café coado.",
  instagram: "@sebodojoao",
  website: "sebodojoao.com.br",
  priceLevel: "2",
  hasNarga: "yes",
  googleMapsUrl: "https://maps.google.com/?q=-27.5977,-48.5492",
  googlePlaceId: "",
};

/** Roda uma action que termina em `redirect()` e devolve pra onde ela mandou. */
async function expectRedirect(run: () => Promise<unknown>): Promise<string> {
  state.redirects.length = 0;
  await expect(run()).rejects.toThrow(/NEXT_REDIRECT/);
  return state.redirects.at(-1)!;
}

const empty: FormState = { ok: false };

async function createBasePlace(overrides: Record<string, string> = {}): Promise<string> {
  return expectRedirect(() => actions.createPlace(empty, form({ ...BASE_FIELDS, ...overrides })));
}

async function placeBySlug(slug: string) {
  const found = await db.query.places.findFirst({ where: eq(schema.places.slug, slug) });
  expect(found).toBeTruthy();
  return found!;
}

describe("createPlace", () => {
  it("salva o lugar, normaliza os campos e manda pro passo da nota", async () => {
    expect(await createBasePlace()).toBe("/lugares/sebo-do-joao/avaliar?novo=1");

    const place = await placeBySlug("sebo-do-joao");
    expect(place).toMatchObject({
      name: "Sebo do João",
      categoryId: CATEGORY_ID,
      lat: -27.5977,
      lng: -48.5492,
      hasNarga: "yes",
      status: "active",
      createdBy: OWNER.id,
      priceLevel: 2,
      // @ some, e o site ganha o https://
      instagram: "sebodojoao",
      website: "https://sebodojoao.com.br",
    });
    expect(place.googlePlaceId).toBeNull();
  });

  it("não marca 'já fui' pra quem cadastrou", async () => {
    await createBasePlace();
    const statuses = await db.select().from(schema.userPlaceStatus);
    expect(statuses).toHaveLength(0);
  });

  it("dá sufixo no slug quando o nome se repete", async () => {
    expect(await createBasePlace()).toBe("/lugares/sebo-do-joao/avaliar?novo=1");
    expect(await createBasePlace()).toBe("/lugares/sebo-do-joao-2/avaliar?novo=1");
    expect(await createBasePlace()).toBe("/lugares/sebo-do-joao-3/avaliar?novo=1");
  });

  it("recusa categoria que não existe", async () => {
    const result = await actions.createPlace(
      empty,
      form({ ...BASE_FIELDS, categoryId: "nao-existe" }),
    );
    expect(result.fieldErrors?.categoryId).toBe("Categoria não encontrada.");
  });

  it("valida nome, coordenada, instagram, site, preço e link do Maps", async () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ name: "x" }, "name"],
      [{ lat: "" }, "lat"],
      [{ lat: "91" }, "lat"],
      [{ lng: "181" }, "lng"],
      [{ instagram: "não pode espaço" }, "instagram"],
      [{ website: "javascript:alert(1)" }, "website"],
      [{ priceLevel: "9" }, "priceLevel"],
      [{ hasNarga: "talvez" }, "hasNarga"],
      [{ googleMapsUrl: "https://evil.com/maps?q=-27,-48" }, "googleMapsUrl"],
      [{ description: "a".repeat(281) }, "description"],
      [{ tips: "a".repeat(1001) }, "tips"],
    ];

    for (const [override, campo] of cases) {
      const result = await actions.createPlace(empty, form({ ...BASE_FIELDS, ...override }));
      expect(result.ok, `${campo} deveria falhar`).toBe(false);
      expect(Object.keys(result.fieldErrors ?? {}), `${campo}`).toContain(campo);
    }

    // Campos opcionais podem vir vazios.
    const ok = await createBasePlace({
      address: "",
      description: "",
      tips: "",
      instagram: "",
      website: "",
      priceLevel: "",
      googleMapsUrl: "",
      name: "Lugar Pelado",
    });
    expect(ok).toBe("/lugares/lugar-pelado/avaliar?novo=1");
    const place = await placeBySlug("lugar-pelado");
    expect(place.address).toBeNull();
    expect(place.priceLevel).toBeNull();
    expect(place.googleMapsUrl).toBeNull();
  });

  it("exige sessão", async () => {
    state.user = null;
    await expect(actions.createPlace(empty, form(BASE_FIELDS))).rejects.toThrow("Não autorizado");
  });
});

describe("updatePlace", () => {
  it("deixa qualquer membro mexer em 'tem narga', dicas e endereço", async () => {
    await createBasePlace();
    const place = await placeBySlug("sebo-do-joao");

    state.user = OTHER;
    const to = await expectRedirect(() =>
      actions.updatePlace(
        empty,
        form({
          ...BASE_FIELDS,
          id: place.id,
          hasNarga: "no",
          tips: "Fecha cedo.",
          address: "Outra rua",
        }),
      ),
    );
    expect(to).toBe("/lugares/sebo-do-joao");

    const updated = await placeBySlug("sebo-do-joao");
    expect(updated).toMatchObject({ hasNarga: "no", tips: "Fecha cedo.", address: "Outra rua" });
    expect(updated.updatedAt >= place.updatedAt).toBe(true);
  });

  it("barra não-dono que tenta mudar nome, categoria ou posição", async () => {
    await createBasePlace();
    const place = await placeBySlug("sebo-do-joao");
    const erro = "Só quem cadastrou (ou admin) muda nome, categoria e posição.";

    state.user = OTHER;
    for (const override of [
      { name: "Outro nome" },
      { categoryId: OTHER_CATEGORY_ID },
      { lat: "-27.6" },
      { lng: "-48.6" },
    ]) {
      const result = await actions.updatePlace(
        empty,
        form({ ...BASE_FIELDS, id: place.id, ...override }),
      );
      expect(result).toEqual({ ok: false, error: erro });
    }

    const intacto = await placeBySlug("sebo-do-joao");
    expect(intacto).toMatchObject({ name: "Sebo do João", categoryId: CATEGORY_ID });
  });

  it("dono renomeia sem mudar o slug; admin muda a categoria", async () => {
    await createBasePlace();
    const place = await placeBySlug("sebo-do-joao");

    await expectRedirect(() =>
      actions.updatePlace(empty, form({ ...BASE_FIELDS, id: place.id, name: "Sebo da Ana" })),
    );
    let updated = await placeBySlug("sebo-do-joao");
    expect(updated.name).toBe("Sebo da Ana");

    state.user = ADMIN;
    await expectRedirect(() =>
      actions.updatePlace(
        empty,
        form({ ...BASE_FIELDS, id: place.id, name: "Sebo da Ana", categoryId: OTHER_CATEGORY_ID }),
      ),
    );
    updated = await placeBySlug("sebo-do-joao");
    expect(updated.categoryId).toBe(OTHER_CATEGORY_ID);
  });

  it("reclama de id que não existe", async () => {
    expect(await actions.updatePlace(empty, form({ ...BASE_FIELDS, id: "nada" }))).toEqual({
      ok: false,
      error: "Lugar não encontrado.",
    });
    expect(await actions.updatePlace(empty, form(BASE_FIELDS))).toEqual({
      ok: false,
      error: "Lugar não encontrado.",
    });
  });
});

describe("archivePlace / unarchivePlace", () => {
  it("só dono ou admin arquiva", async () => {
    await createBasePlace();
    const place = await placeBySlug("sebo-do-joao");

    state.user = OTHER;
    expect(await actions.archivePlace(place.id)).toEqual({
      ok: false,
      error: "Só quem cadastrou (ou admin) pode arquivar.",
    });

    state.user = OWNER;
    expect(await expectRedirect(() => actions.archivePlace(place.id))).toBe("/ranking");
    expect((await placeBySlug("sebo-do-joao")).status).toBe("archived");

    state.user = ADMIN;
    expect(await expectRedirect(() => actions.unarchivePlace(place.id))).toBe(
      "/lugares/sebo-do-joao",
    );
    expect((await placeBySlug("sebo-do-joao")).status).toBe("active");
  });
});

describe("setMyPlaceStatus", () => {
  it("marca, troca e desmarca", async () => {
    await createBasePlace();
    const place = await placeBySlug("sebo-do-joao");

    state.user = OTHER;
    expect(await actions.setMyPlaceStatus(place.id, "want")).toEqual({ ok: true, status: "want" });

    const linha = async () =>
      db.query.userPlaceStatus.findFirst({
        where: and(
          eq(schema.userPlaceStatus.userId, OTHER.id),
          eq(schema.userPlaceStatus.placeId, place.id),
        ),
      });

    expect((await linha())?.status).toBe("want");

    expect(await actions.setMyPlaceStatus(place.id, "visited")).toEqual({
      ok: true,
      status: "visited",
    });
    expect((await linha())?.status).toBe("visited");
    expect(await db.select().from(schema.userPlaceStatus)).toHaveLength(1);

    expect(await actions.setMyPlaceStatus(place.id, null)).toEqual({ ok: true, status: null });
    expect(await linha()).toBeUndefined();
  });

  it("recusa lugar inexistente, arquivado ou status inválido", async () => {
    await createBasePlace();
    const place = await placeBySlug("sebo-do-joao");

    expect(await actions.setMyPlaceStatus("nada", "want")).toEqual({
      ok: false,
      error: "Lugar não encontrado.",
    });
    expect(
      await actions.setMyPlaceStatus(place.id, "quero-muito" as unknown as "want"),
    ).toMatchObject({ ok: false });

    await expectRedirect(() => actions.archivePlace(place.id));
    expect(await actions.setMyPlaceStatus(place.id, "want")).toEqual({
      ok: false,
      error: "Esse lugar está arquivado.",
    });
  });
});
