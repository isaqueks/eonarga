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
  user: null as { id: string; name: string; role: "admin" | "member" } | null,
  redirects: [] as string[],
}));

// O push de "comentou no seu post" passa pelo web-push: aqui ele vira um espião.
const webpush = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

const VAPID = {
  VAPID_PUBLIC_KEY: "chave-publica",
  VAPID_PRIVATE_KEY: "chave-privada",
  VAPID_SUBJECT: "https://eonarga.com.br",
};

vi.mock("web-push", () => ({ default: webpush }));
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

/** Um post só de texto, publicado por `as`. Devolve o id. */
async function seedTextPost(as = ANA): Promise<string> {
  state.user = as;
  await expectRedirect({ ...AQUI, body: "some daqui" });
  state.user = ANA;
  return (await onlyPost()).id;
}

async function subscribe(id: string, userId: string) {
  await db.insert(schema.pushSubscriptions).values({
    id,
    userId,
    endpoint: `https://push.example.com/${id}`,
    p256dh: `p256dh-${id}`,
    auth: `auth-${id}`,
  });
}

/** Endpoints que o web-push recebeu nesta rodada. */
function pushedTo(): string[] {
  return webpush.sendNotification.mock.calls
    .map((call) => (call[0] as { endpoint: string }).endpoint)
    .sort();
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
  // Reações e comentários somem em cascata com o post.
  await db.delete(schema.posts);
  await db.delete(schema.notifications);
  await db.delete(schema.pushSubscriptions);
  Object.assign(process.env, VAPID);
  webpush.sendNotification.mockReset();
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
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
      fieldErrors: { body: "Manda uma foto, um vídeo ou escreve alguma coisa." },
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
      fieldErrors: { photo: "Isso não é foto nem vídeo que eu reconheça." },
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

describe("togglePostReaction", () => {
  it("liga e desliga a reação, devolvendo a contagem daquele emoji", async () => {
    const id = await seedTextPost();

    state.user = BIA;
    expect(await actions.togglePostReaction(id, "🔥")).toEqual({
      ok: true,
      reacted: true,
      count: 1,
    });
    state.user = ANA;
    expect(await actions.togglePostReaction(id, "🔥")).toEqual({
      ok: true,
      reacted: true,
      count: 2,
    });
    expect(await actions.togglePostReaction(id, "🔥")).toEqual({
      ok: true,
      reacted: false,
      count: 1,
    });

    const rows = await db.select().from(schema.postReactions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ postId: id, userId: BIA.id, emoji: "🔥" });
  });

  it("recusa emoji fora da lista e post que não existe", async () => {
    const id = await seedTextPost();

    expect(await actions.togglePostReaction(id, "🍆")).toEqual({
      ok: false,
      error: "Esse emoji não existe por aqui.",
    });
    expect(await actions.togglePostReaction("nao-existe", "🔥")).toEqual({
      ok: false,
      error: "Não achei esse post.",
    });
  });

  it("exige sessão", async () => {
    const id = await seedTextPost();
    state.user = null;
    await expect(actions.togglePostReaction(id, "🔥")).rejects.toThrow("Não autorizado");
  });
});

describe("addPostComment", () => {
  it("grava o comentário e avisa quem postou por push, com registro no histórico", async () => {
    const id = await seedTextPost();
    await subscribe("ana-celular", ANA.id);
    await subscribe("bia-celular", BIA.id);

    state.user = BIA;
    expect(
      await actions.addPostComment(empty, form({ postId: id, body: "  Bora amanhã?  " })),
    ).toEqual({ ok: true });

    const comments = await db.select().from(schema.postComments);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ postId: id, userId: BIA.id, body: "Bora amanhã?" });

    // Só o celular da Ana (dona do post) apita; o da Bia, que comentou, não.
    expect(pushedTo()).toEqual(["https://push.example.com/ana-celular"]);
    expect(JSON.parse(webpush.sendNotification.mock.calls[0][1] as string)).toEqual({
      title: "E o narga?",
      body: "Bia comentou no seu post: “Bora amanhã?”",
      url: `/feed#post-${id}`,
      tag: `comment:${id}`,
    });

    const log = await db.select().from(schema.notifications);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      kind: "comment",
      createdBy: BIA.id,
      targetUserId: ANA.id,
      url: `/feed#post-${id}`,
      sentCount: 1,
    });
  });

  it("comentar no próprio post não apita nem entra no histórico", async () => {
    const id = await seedTextPost();
    await subscribe("ana-celular", ANA.id);

    expect(await actions.addPostComment(empty, form({ postId: id, body: "eu mesmo" }))).toEqual({
      ok: true,
    });
    expect(pushedTo()).toEqual([]);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);
  });

  it("sem push configurado, o comentário entra igual", async () => {
    const id = await seedTextPost();
    await subscribe("ana-celular", ANA.id);
    delete process.env.VAPID_PRIVATE_KEY;

    state.user = BIA;
    expect(await actions.addPostComment(empty, form({ postId: id, body: "sem push" }))).toEqual({
      ok: true,
    });
    expect(await db.select().from(schema.postComments)).toHaveLength(1);
    expect(pushedTo()).toEqual([]);
  });

  it("push que falha não derruba o comentário", async () => {
    const id = await seedTextPost();
    await subscribe("ana-celular", ANA.id);
    webpush.sendNotification.mockRejectedValue(new Error("serviço fora"));

    state.user = BIA;
    expect(await actions.addPostComment(empty, form({ postId: id, body: "mesmo assim" }))).toEqual({
      ok: true,
    });
    expect(await db.select().from(schema.postComments)).toHaveLength(1);
    // O envio foi tentado, ninguém recebeu, e o histórico registra zero aparelhos.
    expect((await db.select().from(schema.notifications))[0]?.sentCount).toBe(0);
  });

  it("recusa vazio, comprido demais e post que não existe", async () => {
    const id = await seedTextPost();

    const vazio = await actions.addPostComment(empty, form({ postId: id, body: "   " }));
    expect(vazio.ok).toBe(false);
    expect(vazio.fieldErrors?.body).toMatch(/até 500/);

    const longo = await actions.addPostComment(empty, form({ postId: id, body: "x".repeat(501) }));
    expect(longo.ok).toBe(false);
    expect(longo.fieldErrors?.body).toMatch(/até 500/);

    expect(await actions.addPostComment(empty, form({ postId: "nao-existe", body: "oi" }))).toEqual(
      {
        ok: false,
        error: "Não achei esse post.",
      },
    );
    expect(await db.select().from(schema.postComments)).toHaveLength(0);
  });
});

describe("deletePostComment", () => {
  /** Comentário da Bia no post da Ana. Devolve o id do comentário. */
  async function seedComment(): Promise<string> {
    const id = await seedTextPost();
    state.user = BIA;
    await actions.addPostComment(empty, form({ postId: id, body: "Bora" }));
    state.user = ANA;
    const [comment] = await db.select().from(schema.postComments);
    return comment.id;
  }

  it("quem comentou apaga", async () => {
    const id = await seedComment();
    state.user = BIA;
    expect(await actions.deletePostComment(id)).toEqual({ ok: true });
    expect(await db.select().from(schema.postComments)).toHaveLength(0);
  });

  it("quem postou apaga comentário dos outros no seu post", async () => {
    const id = await seedComment();
    state.user = ANA;
    expect(await actions.deletePostComment(id)).toEqual({ ok: true });
    expect(await db.select().from(schema.postComments)).toHaveLength(0);
  });

  it("admin apaga qualquer um; terceiro não", async () => {
    const id = await seedComment();
    state.user = ADMIN;
    expect(await actions.deletePostComment(id)).toEqual({ ok: true });

    // Limpa o post da rodada anterior: `seedComment` conta com um post só no banco.
    await db.delete(schema.posts);
    const outro = await seedComment();
    await db
      .insert(schema.users)
      .values({ id: "user-ze", name: "Zé", email: "ze@example.com", passwordHash: "x" })
      .onConflictDoNothing();
    state.user = { id: "user-ze", name: "Zé", role: "member" };
    expect(await actions.deletePostComment(outro)).toEqual({
      ok: false,
      error: "Esse comentário não é seu.",
    });
    expect(await db.select().from(schema.postComments)).toHaveLength(1);
  });

  it("reclama de id que não existe ou vazio", async () => {
    const erro = { ok: false, error: "Comentário não encontrado." };
    expect(await actions.deletePostComment("nao-existe")).toEqual(erro);
    expect(await actions.deletePostComment("")).toEqual(erro);
  });
});

describe("createPost com foto importada do Instagram", () => {
  /** Põe uma imagem real no storage e no palco, como `importInstagramPost` faria. */
  async function stageImported(as = ANA): Promise<string> {
    const { saveImage } = await import("@/lib/storage");
    const { stageImport } = await import("@/lib/staged-imports");
    const saved = await saveImage(await png(), { maxSize: 1600, thumbSize: 400 });
    stageImport({
      id: saved.id,
      userId: as.id,
      width: saved.width,
      height: saved.height,
      videoExt: null,
      posterId: null,
      sourceUrl: "https://www.instagram.com/p/C8Zxn3JJhcG/",
      sourceAuthor: "nasa",
    });
    return saved.id;
  }

  it("publica com a foto do palco e guarda a origem", async () => {
    const photoId = await stageImported();

    expect(
      await expectRedirect({ ...AQUI, body: "Roubado do Instagram", importedPhotoId: photoId }),
    ).toBe("/feed");

    expect(await onlyPost()).toMatchObject({
      userId: ANA.id,
      body: "Roubado do Instagram",
      photoId,
      photoWidth: 120,
      photoHeight: 80,
      sourceUrl: "https://www.instagram.com/p/C8Zxn3JJhcG/",
      sourceAuthor: "nasa",
    });
    expect(fileExists(photoId, ".webp")).toBe(true);

    // Saiu do palco: a mesma foto não vira dois posts.
    const { countStagedImports } = await import("@/lib/staged-imports");
    expect(countStagedImports()).toBe(0);
  });

  it("foto importada sem texto basta", async () => {
    const photoId = await stageImported();
    await expectRedirect({ ...AQUI, importedPhotoId: photoId });
    expect((await onlyPost()).photoId).toBe(photoId);
  });

  it("foto de outra pessoa ou id vencido não publica", async () => {
    const photoId = await stageImported(BIA);

    const result = await actions.createPost(
      empty,
      form({ ...AQUI, body: "x", importedPhotoId: photoId }),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { photo: "A foto importada venceu. Importa de novo." },
    });
    expect(await db.select().from(schema.posts)).toHaveLength(0);
  });

  it("mandou foto própria junto: a própria vale e a importada é descartada", async () => {
    const photoId = await stageImported();

    await expectRedirect({ ...AQUI, importedPhotoId: photoId }, await photoFile());

    const post = await onlyPost();
    expect(post.photoId).not.toBe(photoId);
    expect(post.sourceUrl).toBeNull();
    expect(fileExists(photoId, ".webp")).toBe(false);
  });
});

describe("createPost com vídeo", () => {
  const FIXTURES = path.resolve("e2e/fixtures");
  const mp4 = () => fs.readFileSync(path.join(FIXTURES, "tiny.mp4"));
  const webm = () => fs.readFileSync(path.join(FIXTURES, "tiny.webm"));

  function videoFile(buffer: Buffer, name = "rolê.mp4", type = "video/mp4"): File {
    return new File([new Uint8Array(buffer)], name, { type });
  }

  it("publica um MP4 da galeria, com as dimensões lidas do arquivo", async () => {
    const fd = form({ ...AQUI, body: "Olha o narga" });
    fd.set("media", videoFile(mp4()));
    state.redirects.length = 0;
    await expect(actions.createPost(empty, fd)).rejects.toThrow(/NEXT_REDIRECT/);

    const post = await onlyPost();
    expect(post).toMatchObject({
      body: "Olha o narga",
      photoId: null,
      videoExt: "mp4",
      videoWidth: 32,
      videoHeight: 24,
    });
    expect(post.videoId).toBeTruthy();
    expect(fs.existsSync(path.join(uploadDir, `${post.videoId}.mp4`))).toBe(true);
  });

  it("WebM entra com a proporção que o navegador informou; sem texto também vale", async () => {
    const fd = form({ ...AQUI, videoWidth: "640", videoHeight: "360" });
    fd.set("video", videoFile(webm(), "gravado.webm", "video/webm"));
    await expect(actions.createPost(empty, fd)).rejects.toThrow(/NEXT_REDIRECT/);

    expect(await onlyPost()).toMatchObject({
      body: null,
      videoExt: "webm",
      videoWidth: 640,
      videoHeight: 360,
    });
  });

  it("recusa vídeo grande demais e arquivo que não é foto nem vídeo", async () => {
    const big = new File([new Uint8Array(60 * 1024 * 1024 + 1)], "grande.mp4", {
      type: "video/mp4",
    });
    const fd = form({ ...AQUI, body: "x" });
    fd.set("video", big);
    expect(await actions.createPost(empty, fd)).toEqual({
      ok: false,
      fieldErrors: { photo: "Vídeo grande demais (máximo 60 MB)." },
    });

    const fd2 = form({ ...AQUI, body: "x" });
    fd2.set("media", videoFile(Buffer.from("isso nao e video nenhum, so texto"), "x.mp4"));
    expect(await actions.createPost(empty, fd2)).toEqual({
      ok: false,
      fieldErrors: { photo: "Isso não é foto nem vídeo que eu reconheça." },
    });
    expect(await db.select().from(schema.posts)).toHaveLength(0);
  });

  it("a galeria também aceita foto", async () => {
    const fd = form({ ...AQUI, body: "foto pela galeria" });
    fd.set("media", await photoFile());
    await expect(actions.createPost(empty, fd)).rejects.toThrow(/NEXT_REDIRECT/);
    const post = await onlyPost();
    expect(post.photoId).toBeTruthy();
    expect(post.videoId).toBeNull();
  });

  it("apagar o post apaga o vídeo", async () => {
    const fd = form({ ...AQUI, body: "some" });
    fd.set("media", videoFile(mp4()));
    await expect(actions.createPost(empty, fd)).rejects.toThrow(/NEXT_REDIRECT/);
    const post = await onlyPost();

    expect(await actions.deletePost(post.id)).toEqual({ ok: true });
    expect(fs.existsSync(path.join(uploadDir, `${post.videoId}.mp4`))).toBe(false);
  });

  it("reel importado vira post com vídeo e a capa como foto", async () => {
    const { saveImage } = await import("@/lib/storage");
    const { saveVideo } = await import("@/lib/video-storage");
    const { stageImport } = await import("@/lib/staged-imports");
    const video = await saveVideo(mp4(), "mp4");
    const poster = await saveImage(await png(), { maxSize: 1600, thumbSize: 400 });
    stageImport({
      id: video.id,
      userId: ANA.id,
      width: 1080,
      height: 1920,
      videoExt: "mp4",
      posterId: poster.id,
      sourceUrl: "https://www.instagram.com/reel/DX7PnqbFL50/",
      sourceAuthor: "nasainternships",
    });

    await expectRedirect({ ...AQUI, body: "reel", importedPhotoId: video.id });

    expect(await onlyPost()).toMatchObject({
      videoId: video.id,
      videoExt: "mp4",
      videoWidth: 1080,
      videoHeight: 1920,
      photoId: poster.id,
      sourceUrl: "https://www.instagram.com/reel/DX7PnqbFL50/",
      sourceAuthor: "nasainternships",
    });
  });
});

describe("menções (@Nome:)", () => {
  /** Payloads (JSON) que o web-push recebeu, por endpoint. */
  function pushes(): { endpoint: string; body: string }[] {
    return webpush.sendNotification.mock.calls.map((call) => ({
      endpoint: (call[0] as { endpoint: string }).endpoint,
      body: (JSON.parse(call[1] as string) as { body: string }).body,
    }));
  }

  it("post que cita alguém manda push só pra quem foi citado, com registro no histórico", async () => {
    await subscribe("ana-celular", ANA.id);
    await subscribe("bia-celular", BIA.id);
    await subscribe("cadu-celular", ADMIN.id);

    await expectRedirect({ ...AQUI, body: "@Bia: bora hoje? @Ana: eu mesmo" });

    // A Bia foi citada; a Ana citou a si mesma e não apita; o Cadu não foi citado.
    expect(pushes()).toEqual([
      {
        endpoint: "https://push.example.com/bia-celular",
        body: "Ana te mencionou num post: “@Bia: bora hoje? @Ana: eu mesmo”",
      },
    ]);
    const log = await db.select().from(schema.notifications);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      kind: "mention",
      createdBy: ANA.id,
      targetUserId: BIA.id,
      sentCount: 1,
    });
    expect(log[0].url).toMatch(/^\/feed#post-/);
  });

  it("nome sem acento e sem caixa acha a pessoa; nome inventado é ignorado", async () => {
    await db
      .insert(schema.users)
      .values({ id: "user-joao", name: "João", email: "joao@example.com", passwordHash: "x" })
      .onConflictDoNothing();
    await subscribe("joao-celular", "user-joao");

    await expectRedirect({ ...AQUI, body: "@joao: cola aí @Ninguem: oi" });

    expect(pushes().map((p) => p.endpoint)).toEqual(["https://push.example.com/joao-celular"]);
  });

  it("comentário que cita alguém apita pro citado, mas o dono do post só leva o push de comentário", async () => {
    const id = await seedTextPost(); // post da Ana
    await subscribe("ana-celular", ANA.id);
    await subscribe("cadu-celular", ADMIN.id);

    state.user = BIA;
    expect(
      await actions.addPostComment(empty, form({ postId: id, body: "@Ana: viu? @Cadu: vem" })),
    ).toEqual({
      ok: true,
    });

    const got = pushes();
    // Ana: um push só (o de comentário). Cadu: o de menção.
    expect(got.filter((p) => p.endpoint.endsWith("ana-celular")).map((p) => p.body)).toEqual([
      "Bia comentou no seu post: “@Ana: viu? @Cadu: vem”",
    ]);
    expect(got.filter((p) => p.endpoint.endsWith("cadu-celular")).map((p) => p.body)).toEqual([
      "Bia te mencionou num comentário: “@Ana: viu? @Cadu: vem”",
    ]);
    const kinds = (await db.select().from(schema.notifications)).map((n) => n.kind).sort();
    expect(kinds).toEqual(["comment", "mention"]);
  });

  it("sem push configurado, menção não faz nada e o post entra igual", async () => {
    await subscribe("bia-celular", BIA.id);
    delete process.env.VAPID_PRIVATE_KEY;
    await expectRedirect({ ...AQUI, body: "@Bia: oi" });
    expect(pushes()).toEqual([]);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);
  });
});
