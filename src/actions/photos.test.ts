import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/actions/form-state";

type PhotosModule = typeof import("./photos");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const OWNER = { id: "user-dono", name: "Ana", role: "member" as const };
const OTHER = { id: "user-outro", name: "Bia", role: "member" as const };
const ADMIN = { id: "user-admin", name: "Cadu", role: "admin" as const };

const CATEGORY_ID = "cat-bar";
const PLACE_ID = "place-ativo";
const ARCHIVED_ID = "place-arquivado";

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

let actions: PhotosModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;
let uploadDir: string;

/** PNG de verdade, pra o sharp ter o que reprocessar. */
async function png(width = 120, height = 80): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#f4b942" } })
    .png()
    .toBuffer();
}

function form(placeId: string, file: File): FormData {
  const fd = new FormData();
  fd.set("placeId", placeId);
  fd.set("photo", file);
  return fd;
}

const empty: FormState & { photoId?: string } = { ok: false };

async function upload(placeId = PLACE_ID, buffer?: Buffer, name = "foto.png", type = "image/png") {
  const data = buffer ?? (await png());
  // `new Uint8Array(buffer)` copia pra um ArrayBuffer normal, que é o que o File aceita.
  const file = new File([new Uint8Array(data)], name, { type });
  return actions.uploadPlacePhoto(empty, form(placeId, file));
}

function fileExists(id: string, suffix: string): boolean {
  return fs.existsSync(path.join(uploadDir, `${id}${suffix}`));
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-photos-"));
  uploadDir = path.join(tmpDir, "uploads");
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;
  // storage.ts lê UPLOAD_DIR no import: tem que estar de pé antes do primeiro import.
  process.env.UPLOAD_DIR = uploadDir;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  actions = await import("./photos");

  await db.insert(schema.users).values(
    [OWNER, OTHER, ADMIN].map((u) => ({
      id: u.id,
      name: u.name,
      email: `${u.id}@example.com`,
      passwordHash: "x",
      role: u.role,
    })),
  );
  await db
    .insert(schema.categories)
    .values([{ id: CATEGORY_ID, name: "Bar", slug: "bar", emoji: "🍺", color: "#e0894a" }]);
  await db.insert(schema.places).values([
    {
      id: PLACE_ID,
      slug: "bar-do-teste",
      name: "Bar do Teste",
      categoryId: CATEGORY_ID,
      lat: -27.6,
      lng: -48.55,
      createdBy: OWNER.id,
    },
    {
      id: ARCHIVED_ID,
      slug: "bar-arquivado",
      name: "Bar Arquivado",
      categoryId: CATEGORY_ID,
      lat: -27.6,
      lng: -48.55,
      status: "archived",
      createdBy: OWNER.id,
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
  await db.delete(schema.photos);
  state.user = OWNER;
});

describe("uploadPlacePhoto", () => {
  it("grava a linha e os dois arquivos com o mesmo id", async () => {
    const result = await upload();
    expect(result.ok).toBe(true);
    expect(result.photoId).toMatch(/^[A-Za-z0-9_-]{16}$/);

    const row = await db.query.photos.findFirst({
      where: eq(schema.photos.id, result.photoId!),
    });
    expect(row).toMatchObject({
      placeId: PLACE_ID,
      uploadedBy: OWNER.id,
      width: 120,
      height: 80,
      reviewId: null,
    });

    expect(fileExists(result.photoId!, ".webp")).toBe(true);
    expect(fileExists(result.photoId!, ".thumb.webp")).toBe(true);
  });

  it("recusa arquivo que não é imagem", async () => {
    const result = await upload(PLACE_ID, Buffer.from("%PDF-1.4 nem de longe uma foto"));
    expect(result).toEqual({ ok: false, error: "Isso não é uma imagem que eu reconheça." });
    expect(await db.select().from(schema.photos)).toHaveLength(0);
  });

  it("recusa envio vazio", async () => {
    const result = await actions.uploadPlacePhoto(
      empty,
      form(PLACE_ID, new File([], "nada.png", { type: "image/png" })),
    );
    expect(result).toEqual({ ok: false, error: "Escolhe uma foto." });
  });

  it("recusa lugar inexistente e lugar arquivado", async () => {
    expect(await upload("nao-existe")).toEqual({ ok: false, error: "Lugar não encontrado." });
    expect(await upload(ARCHIVED_ID)).toEqual({ ok: false, error: "Esse lugar está arquivado." });
  });

  it("para no limite de 30 fotos por lugar", async () => {
    await db.insert(schema.photos).values(
      Array.from({ length: 30 }, (_, i) => ({
        id: `fake-${i}`,
        placeId: PLACE_ID,
        uploadedBy: OWNER.id,
        width: 10,
        height: 10,
      })),
    );

    expect(await upload()).toEqual({ ok: false, error: "Esse lugar já tem foto demais." });

    // Abriu uma vaga: volta a aceitar.
    await db.delete(schema.photos).where(eq(schema.photos.id, "fake-0"));
    expect((await upload()).ok).toBe(true);
  });

  it("exige sessão", async () => {
    state.user = null;
    await expect(upload()).rejects.toThrow("Não autorizado");
  });
});

describe("deletePhoto", () => {
  async function seedPhoto(as = OWNER) {
    state.user = as;
    const result = await upload();
    expect(result.ok).toBe(true);
    state.user = OWNER;
    return result.photoId!;
  }

  it("dono apaga a linha e os arquivos", async () => {
    const id = await seedPhoto();
    expect(await actions.deletePhoto(id)).toEqual({ ok: true });
    expect(await db.select().from(schema.photos)).toHaveLength(0);
    expect(fileExists(id, ".webp")).toBe(false);
    expect(fileExists(id, ".thumb.webp")).toBe(false);
  });

  it("admin apaga foto dos outros", async () => {
    const id = await seedPhoto(OTHER);
    state.user = ADMIN;
    expect(await actions.deletePhoto(id)).toEqual({ ok: true });
    expect(await db.select().from(schema.photos)).toHaveLength(0);
  });

  it("terceiro não apaga, e a foto continua no disco", async () => {
    const id = await seedPhoto();
    state.user = OTHER;
    expect(await actions.deletePhoto(id)).toEqual({
      ok: false,
      error: "Só quem mandou a foto (ou admin) pode apagar.",
    });
    expect(await db.select().from(schema.photos)).toHaveLength(1);
    expect(fileExists(id, ".webp")).toBe(true);
  });

  it("reclama de id que não existe ou vazio", async () => {
    const erro = { ok: false, error: "Não achei essa foto." };
    expect(await actions.deletePhoto("nao-existe")).toEqual(erro);
    expect(await actions.deletePhoto("")).toEqual(erro);
  });

  it("exige sessão", async () => {
    const id = await seedPhoto();
    state.user = null;
    await expect(actions.deletePhoto(id)).rejects.toThrow("Não autorizado");
  });
});
