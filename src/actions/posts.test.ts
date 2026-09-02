import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/actions/form-state";

type PostsModule = typeof import("./posts");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");
type RateLimitModule = typeof import("@/lib/rate-limit");

const ANA = { id: "user-ana", name: "Ana", role: "member" as const };
const BIA = { id: "user-bia", name: "Bia", role: "member" as const };
const ADMIN = { id: "user-admin", name: "Cadu", role: "admin" as const };

const CATEGORY_ID = "cat-sebo";
const PLACE_ID = "place-sebo";
const ARCHIVED_ID = "place-morto";

/** Praça XV: é de lá que a pessoa posta quando não escolhe lugar. */
const AQUI = { lat: "-27.5975", lng: "-48.55" };

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

let actions: PostsModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let clearAllRateLimits: RateLimitModule["clearAllRateLimits"];
let tmpDir: string;
let uploadDir: string;

const empty: FormState = { ok: false };

/** PNG de verdade, pra o sharp ter o que reprocessar. */
async function png(width = 120, height = 80): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#f4b942" } })
    .png()
    .toBuffer();
}

function form(fields: Record<string, string>, photo?: File): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  if (photo) fd.set("photo", photo);
  return fd;
}

async function photoFile(buffer?: Buffer, name = "foto.png", type = "image/png"): Promise<File> {
  const data = buffer ?? (await png());
  // `new Uint8Array(buffer)` copia pra um ArrayBuffer normal, que é o que o File aceita.
  return new File([new Uint8Array(data)], name, { type });
}

/** Roda a action e devolve pra onde ela mandou (o sucesso sempre termina em redirect). */
async function expectRedirect(fields: Record<string, string>, photo?: File): Promise<string> {
  state.redirects.length = 0;
  await expect(actions.createPost(empty, form(fields, photo))).rejects.toThrow(/NEXT_REDIRECT/);
  return state.redirects.at(-1)!;
}

function fileExists(id: string, suffix: string): boolean {
  return fs.existsSync(path.join(uploadDir, `${id}${suffix}`));
}

async function onlyPost() {
  const rows = await db.select().from(schema.posts);
  expect(rows).toHaveLength(1);
  return rows[0];
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-posts-"));
  uploadDir = path.join(tmpDir, "uploads");
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;
  // storage.ts lê UPLOAD_DIR no import: tem que estar de pé antes do primeiro import.
  process.env.UPLOAD_DIR = uploadDir;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  ({ clearAllRateLimits } = await import("@/lib/rate-limit"));
  actions = await import("./posts");

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
    .values([{ id: CATEGORY_ID, name: "Sebo", slug: "sebo", emoji: "📚", color: "#8fd3b0" }]);
  await db.insert(schema.places).values([
    {
      id: PLACE_ID,
      slug: "sebo-do-joao",
      name: "Sebo do João",
      categoryId: CATEGORY_ID,
      address: "Rua Felipe Schmidt, 123 - Centro",
      lat: -27.5968,
      lng: -48.5489,
      createdBy: ANA.id,
    },
    {
      id: ARCHIVED_ID,
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
  await db.delete(schema.posts);
  clearAllRateLimits();
  state.user = ANA;
});

describe("createPost", () => {
  it("posta só texto, com a posição do formulário", async () => {
    expect(await expectRedirect({ ...AQUI, body: "  Tô aqui e tem narga  " })).toBe("/feed");

    expect(await onlyPost()).toMatchObject({
      userId: ANA.id,
      body: "Tô aqui e tem narga",
      photoId: null,
      photoWidth: null,
      photoHeight: null,
      placeId: null,
      lat: -27.5975,
      lng: -48.55,
      address: null,
    });
  });

  it("guarda o endereço do reverse geocoding quando vem sem lugar", async () => {
    await expectRedirect({ ...AQUI, body: "oi", address: "Rua Felipe Schmidt, 123 - Centro" });
    expect((await onlyPost()).address).toBe("Rua Felipe Schmidt, 123 - Centro");
  });

  it("posta só foto: grava o id, as dimensões e os dois arquivos", async () => {
    await expectRedirect(AQUI, await photoFile());

    const post = await onlyPost();
    expect(post.body).toBeNull();
    expect(post.photoId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(post).toMatchObject({ photoWidth: 120, photoHeight: 80 });
    expect(fileExists(post.photoId!, ".webp")).toBe(true);
    expect(fileExists(post.photoId!, ".thumb.webp")).toBe(true);
  });

  it("recusa post sem foto e sem texto", async () => {
    const result = await actions.createPost(empty, form(AQUI));
    expect(result).toEqual({
      ok: false,
      fieldErrors: { body: "Manda uma foto ou escreve alguma coisa." },
    });
    expect(await db.select().from(schema.posts)).toHaveLength(0);
  });

  it("com lugar, pega lat/lng e endereço do lugar e ignora o que veio do form", async () => {
    await expectRedirect({
      placeId: PLACE_ID,
      lat: "10",
      lng: "20",
      address: "Curitiba, sei lá",
      body: "cheiro de mofo bom",
    });

    expect(await onlyPost()).toMatchObject({
      placeId: PLACE_ID,
      lat: -27.5968,
      lng: -48.5489,
      address: "Rua Felipe Schmidt, 123 - Centro",
    });
  });

  it("recusa lugar arquivado e lugar que não existe", async () => {
    expect(await actions.createPost(empty, form({ placeId: ARCHIVED_ID, body: "oi" }))).toEqual({
      ok: false,
      error: "Esse lugar está arquivado.",
    });
    expect(await actions.createPost(empty, form({ placeId: "nao-existe", body: "oi" }))).toEqual({
      ok: false,
      error: "Lugar não encontrado.",
    });
    expect(await db.select().from(schema.posts)).toHaveLength(0);
  });

  it("exige localização", async () => {
    const result = await actions.createPost(empty, form({ body: "de onde? sei lá" }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Diz de onde você tá postando.");
    expect(await db.select().from(schema.posts)).toHaveLength(0);
  });

  it("recusa texto comprido demais", async () => {
    const result = await actions.createPost(empty, form({ ...AQUI, body: "a".repeat(1001) }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.body).toMatch(/máximo 1000/);
  });

  it("recusa arquivo que não é imagem, sem deixar arquivo no disco", async () => {
    const antes = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).length : 0;

    const result = await actions.createPost(
      empty,
      form(AQUI, await photoFile(Buffer.from("%PDF-1.4 nem de longe uma foto"))),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { photo: "Isso não é uma imagem que eu reconheça." },
    });
    expect(await db.select().from(schema.posts)).toHaveLength(0);
    expect(fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).length : 0).toBe(antes);
  });

  it("recusa foto grande demais sem abrir o arquivo", async () => {
    const gigante = new File([new Uint8Array(11 * 1024 * 1024)], "gigante.png", {
      type: "image/png",
    });
    const result = await actions.createPost(empty, form(AQUI, gigante));

    expect(result).toEqual({
      ok: false,
      fieldErrors: { photo: "Foto grande demais (máximo 10 MB)." },
    });
    expect(await db.select().from(schema.posts)).toHaveLength(0);
  });

  it("para em 20 posts por hora", async () => {
    for (let i = 0; i < 20; i++) {
      expect(await expectRedirect({ ...AQUI, body: `post ${i}` })).toBe("/feed");
    }

    expect(await actions.createPost(empty, form({ ...AQUI, body: "mais um" }))).toEqual({
      ok: false,
      error: "Calma, influencer.",
    });
    expect(await db.select().from(schema.posts)).toHaveLength(20);

    // O limite é por pessoa: quem não postou ainda continua podendo.
    state.user = BIA;
    expect(await expectRedirect({ ...AQUI, body: "cheguei" })).toBe("/feed");
  });

  it("exige sessão", async () => {
    state.user = null;
    await expect(actions.createPost(empty, form({ ...AQUI, body: "oi" }))).rejects.toThrow(
      "Não autorizado",
    );
  });
});

describe("deletePost", () => {
  /** Um post com foto, publicado por `as`. Devolve id do post e id da imagem. */
  async function seedPost(as = ANA): Promise<{ id: string; photoId: string }> {
    state.user = as;
    await expectRedirect({ ...AQUI, body: "some daqui" }, await photoFile());
    state.user = ANA;
    const post = await onlyPost();
    return { id: post.id, photoId: post.photoId! };
  }

  it("autor apaga o post e a foto", async () => {
    const { id, photoId } = await seedPost();

    expect(await actions.deletePost(id)).toEqual({ ok: true });
    expect(await db.select().from(schema.posts)).toHaveLength(0);
    expect(fileExists(photoId, ".webp")).toBe(false);
    expect(fileExists(photoId, ".thumb.webp")).toBe(false);
  });

  it("admin apaga post dos outros", async () => {
    const { id } = await seedPost(BIA);
    state.user = ADMIN;

    expect(await actions.deletePost(id)).toEqual({ ok: true });
    expect(await db.select().from(schema.posts)).toHaveLength(0);
  });

  it("terceiro não apaga, e a foto continua no disco", async () => {
    const { id, photoId } = await seedPost();
    state.user = BIA;

    expect(await actions.deletePost(id)).toEqual({
      ok: false,
      error: "Só quem postou (ou admin) pode apagar.",
    });
    expect(await db.select().from(schema.posts)).toHaveLength(1);
    expect(fileExists(photoId, ".webp")).toBe(true);
  });

  it("reclama de id que não existe ou vazio", async () => {
    const erro = { ok: false, error: "Não achei esse post." };
    expect(await actions.deletePost("nao-existe")).toEqual(erro);
    expect(await actions.deletePost("")).toEqual(erro);
  });

  it("exige sessão", async () => {
    const { id } = await seedPost();
    state.user = null;
    await expect(actions.deletePost(id)).rejects.toThrow("Não autorizado");
  });
});
