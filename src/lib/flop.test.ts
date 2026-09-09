import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type FlopModule = typeof import("./flop");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "user-ana", name: "Ana" };
const BIA = { id: "user-bia", name: "Bia" };

const VAPID = {
  VAPID_PUBLIC_KEY: "chave-publica",
  VAPID_PRIVATE_KEY: "chave-privada",
  VAPID_SUBJECT: "https://eonarga.com.br",
};

const webpush = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({ default: webpush }));

let flop: FlopModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

/** "Agora" fixo pra cada caso; os posts são criados relativos a ele. */
const NOW = new Date("2026-09-08T18:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

let seq = 0;

async function seedPost(opts: {
  by?: { id: string };
  ageHours: number;
  body?: string | null;
  photoId?: string | null;
  placeId?: string | null;
}): Promise<string> {
  const id = `post-${++seq}`;
  const at = hoursAgo(opts.ageHours);
  await db.insert(schema.posts).values({
    id,
    userId: (opts.by ?? ANA).id,
    body: opts.body === undefined ? `post ${id}` : opts.body,
    photoId: opts.photoId ?? null,
    placeId: opts.placeId ?? null,
    lat: -27.5975,
    lng: -48.55,
    address: "Praça XV",
    createdAt: at,
    updatedAt: at,
  });
  return id;
}

async function flopPostsOf(postId: string) {
  return db
    .select()
    .from(schema.posts)
    .where((await import("drizzle-orm")).eq(schema.posts.flopOfPostId, postId));
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

function lastPayload(): Record<string, unknown> {
  const calls = webpush.sendNotification.mock.calls;
  return JSON.parse(calls[calls.length - 1][1] as string) as Record<string, unknown>;
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-flop-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  flop = await import("./flop");

  await db.insert(schema.users).values(
    [ANA, BIA].map((u) => ({
      id: u.id,
      name: u.name,
      email: `${u.id}@example.com`,
      passwordHash: "x",
    })),
  );
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
  Object.assign(process.env, VAPID);
  webpush.sendNotification.mockReset();
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
  await db.delete(schema.notifications);
  await db.delete(schema.pushSubscriptions);
  await db.delete(schema.posts);
});

describe("flopBody", () => {
  it("é a frase do aviso", () => {
    expect(flop.flopBody("Ana")).toBe("O post de Ana flopou 200%");
  });
});

describe("sweepFlops", () => {
  it("post com 4 h sem ninguém vira aviso no feed e push pro autor", async () => {
    await subscribe("sub-ana", ANA.id);
    await subscribe("sub-bia", BIA.id);
    const postId = await seedPost({ ageHours: 4.5, body: "ninguém viu isso", placeId: null });

    const flopped = await flop.sweepFlops(NOW);

    expect(flopped).toHaveLength(1);
    expect(flopped[0]).toMatchObject({ postId, authorId: ANA.id, sent: 1 });

    // O aviso: assinado pelo autor no banco, apontando pro original, herdando o "de onde".
    const [aviso] = await flopPostsOf(postId);
    expect(aviso).toMatchObject({
      id: flopped[0].flopPostId,
      userId: ANA.id,
      body: "O post de Ana flopou 200%",
      flopOfPostId: postId,
      lat: -27.5975,
      lng: -48.55,
      address: "Praça XV",
      photoId: null,
      floppedAt: null,
    });

    // O original fica marcado.
    const [original] = await db
      .select({ floppedAt: schema.posts.floppedAt })
      .from(schema.posts)
      .where((await import("drizzle-orm")).eq(schema.posts.id, postId));
    expect(original.floppedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // O push: só pra Ana, abrindo o feed no aviso.
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect((webpush.sendNotification.mock.calls[0][0] as { endpoint: string }).endpoint).toBe(
      "https://push.example.com/sub-ana",
    );
    expect(lastPayload()).toEqual({
      title: "E o narga?",
      body: "Seu post flopou 200%",
      url: `/feed#post-${flopped[0].flopPostId}`,
      tag: `flop:${postId}`,
    });

    // E o registro no histórico do admin.
    const log = await db.select().from(schema.notifications);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      kind: "flop",
      body: "Seu post flopou 200%",
      createdBy: ANA.id,
      targetUserId: ANA.id,
      sentCount: 1,
    });
  });

  it("reação ou comentário de outra pessoa salva o post; do próprio autor, não", async () => {
    const comReacao = await seedPost({ ageHours: 7 });
    const comComentario = await seedPost({ ageHours: 7 });
    const soAutoCurtida = await seedPost({ ageHours: 7 });
    const soAutoComentario = await seedPost({ ageHours: 7 });

    await db
      .insert(schema.postReactions)
      .values({ postId: comReacao, userId: BIA.id, emoji: "😂" });
    await db
      .insert(schema.postComments)
      .values({ id: "c1", postId: comComentario, userId: BIA.id, body: "kkk" });
    await db
      .insert(schema.postReactions)
      .values({ postId: soAutoCurtida, userId: ANA.id, emoji: "🔥" });
    await db
      .insert(schema.postComments)
      .values({ id: "c2", postId: soAutoComentario, userId: ANA.id, body: "alô?" });

    const flopped = await flop.sweepFlops(NOW);

    expect(flopped.map((f) => f.postId).sort()).toEqual([soAutoComentario, soAutoCurtida].sort());
  });

  it("respeita a janela: menos de 4 h não flopou ainda, mais de 12 h é deixado em paz", async () => {
    const novo = await seedPost({ ageHours: 3.9 });
    const naJanela = await seedPost({ ageHours: 11.9 });
    const velho = await seedPost({ ageHours: 12.1 });

    const flopped = await flop.sweepFlops(NOW);

    expect(flopped.map((f) => f.postId)).toEqual([naJanela]);
    expect(await flopPostsOf(novo)).toHaveLength(0);
    expect(await flopPostsOf(velho)).toHaveLength(0);
  });

  it("nunca flopa duas vezes, nem flopa o próprio aviso", async () => {
    const postId = await seedPost({ ageHours: 8 });

    const first = await flop.sweepFlops(NOW);
    expect(first).toHaveLength(1);

    // Segunda passada: nada novo. Nem sete horas depois, quando o aviso já teria "idade".
    expect(await flop.sweepFlops(NOW)).toEqual([]);
    const later = new Date(NOW.getTime() + 7 * 3_600_000);
    expect(await flop.sweepFlops(later)).toEqual([]);
    expect(await flopPostsOf(postId)).toHaveLength(1);
    expect(await flopPostsOf(first[0].flopPostId)).toHaveLength(0);
  });

  it("aviso apagado não volta; original apagado leva o aviso junto", async () => {
    const { eq } = await import("drizzle-orm");
    const a = await seedPost({ ageHours: 8 });
    const b = await seedPost({ ageHours: 8 });
    const [flopA, flopB] = await flop.sweepFlops(NOW);

    await db.delete(schema.posts).where(eq(schema.posts.id, flopA.flopPostId));
    expect(await flop.sweepFlops(NOW)).toEqual([]);
    expect(await flopPostsOf(a)).toHaveLength(0);

    await db.delete(schema.posts).where(eq(schema.posts.id, b));
    const rest = await db.select({ id: schema.posts.id }).from(schema.posts);
    expect(rest.map((r) => r.id)).toEqual([a]);
    expect(flopB.flopPostId).not.toEqual(a);
  });

  it("com push desligado o aviso vai pro feed do mesmo jeito, sem push nem histórico", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await subscribe("sub-ana", ANA.id);
    const postId = await seedPost({ ageHours: 9 });

    const flopped = await flop.sweepFlops(NOW);

    expect(flopped).toEqual([expect.objectContaining({ postId, sent: 0 })]);
    expect(await flopPostsOf(postId)).toHaveLength(1);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(await db.select().from(schema.notifications)).toEqual([]);
  });

  it("push que falha não desfaz o aviso", async () => {
    webpush.sendNotification.mockRejectedValue(new Error("serviço fora"));
    await subscribe("sub-ana", ANA.id);
    const postId = await seedPost({ ageHours: 9 });

    const flopped = await flop.sweepFlops(NOW);

    expect(flopped).toEqual([expect.objectContaining({ postId, sent: 0 })]);
    expect(await flopPostsOf(postId)).toHaveLength(1);
    const log = await db.select().from(schema.notifications);
    expect(log).toHaveLength(1);
    expect(log[0].sentCount).toBe(0);
  });
});
