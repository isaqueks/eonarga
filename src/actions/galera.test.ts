import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type GaleraActions = typeof import("./galera");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "user-ana", name: "Ana", role: "member" as const, avatarId: "abcdefghijklmnop" };
const BIA = { id: "user-bia", name: "Bia", role: "member" as const, avatarId: null };
const CADU = { id: "user-cadu", name: "Cadu", role: "admin" as const, avatarId: null };
const SUMIU = { id: "user-sumiu", name: "Zé", role: "member" as const, avatarId: null };

const VAPID = {
  VAPID_PUBLIC_KEY: "chave-publica",
  VAPID_PRIVATE_KEY: "chave-privada",
  VAPID_SUBJECT: "https://eonarga.com.br",
};

const state = vi.hoisted(() => ({
  user: null as {
    id: string;
    name: string;
    role: "admin" | "member";
    avatarId?: string | null;
  } | null,
}));

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
}));

let actions: GaleraActions;
let db: ClientModule["db"];
let schema: SchemaModule;
let clearAllRateLimits: () => void;
let tmpDir: string;

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

function lastPayload(): Record<string, unknown> {
  const calls = webpush.sendNotification.mock.calls;
  return JSON.parse(calls[calls.length - 1][1] as string) as Record<string, unknown>;
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-galera-actions-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  ({ clearAllRateLimits } = await import("@/lib/rate-limit"));
  actions = await import("./galera");

  await db.insert(schema.users).values(
    [ANA, BIA, CADU, SUMIU].map((u) => ({
      id: u.id,
      name: u.name,
      email: `${u.id}@example.com`,
      passwordHash: "x",
      role: u.role,
      isActive: u.id !== SUMIU.id,
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
  clearAllRateLimits();
  await db.delete(schema.notifications);
  await db.delete(schema.pushSubscriptions);
  state.user = ANA;
});

describe("pokeUser", () => {
  it("deda uma pessoa só: push com vibração, foto de quem dedou e registro no histórico", async () => {
    await subscribe("bia-celular", BIA.id);
    await subscribe("bia-tablet", BIA.id);
    await subscribe("cadu-celular", CADU.id);
    await subscribe("ana-celular", ANA.id);

    expect(await actions.pokeUser(BIA.id)).toEqual({ ok: true, sent: 2, recipients: 1 });

    expect(pushedTo()).toEqual([
      "https://push.example.com/bia-celular",
      "https://push.example.com/bia-tablet",
    ]);
    expect(lastPayload()).toEqual({
      title: "E o narga?",
      body: "Ana enfiou o dedo no seu cu",
      url: "/galera",
      tag: `poke:${ANA.id}`,
      icon: "/api/uploads/abcdefghijklmnop?v=thumb",
      vibrate: [300, 100, 300, 100, 500],
    });

    const log = await db.select().from(schema.notifications);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      kind: "poke",
      body: "Ana enfiou o dedo no seu cu",
      url: "/galera",
      createdBy: ANA.id,
      targetUserId: BIA.id,
      sentCount: 2,
    });
  });

  it("quem não ligou notificação é dedado no vazio, mas fica no histórico", async () => {
    expect(await actions.pokeUser(BIA.id)).toEqual({ ok: true, sent: 0, recipients: 0 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(await db.select().from(schema.notifications)).toHaveLength(1);
  });

  it("uma dedada por minuto, seja lá quem for o alvo", async () => {
    await subscribe("bia-celular", BIA.id);
    await subscribe("cadu-celular", CADU.id);

    expect(await actions.pokeUser(BIA.id)).toMatchObject({ ok: true });
    expect(await actions.pokeUser(CADU.id)).toEqual({
      ok: false,
      error: "Calma. Uma dedada por minuto.",
    });
    expect(await actions.pokeUser(BIA.id)).toMatchObject({ ok: false });
    expect(pushedTo()).toEqual(["https://push.example.com/bia-celular"]);
    expect(await db.select().from(schema.notifications)).toHaveLength(1);

    // Outra pessoa tem a própria vez.
    state.user = CADU;
    expect(await actions.pokeUser(BIA.id)).toMatchObject({ ok: true, recipients: 1 });
  });

  it("dedar quem não existe ou está desativado não gasta a vez", async () => {
    await subscribe("bia-celular", BIA.id);

    expect(await actions.pokeUser("ninguem")).toEqual({
      ok: false,
      error: "Essa pessoa não está mais na galera.",
    });
    expect(await actions.pokeUser(SUMIU.id)).toMatchObject({ ok: false });
    expect(await actions.pokeUser("")).toMatchObject({ ok: false });

    expect(await actions.pokeUser(BIA.id)).toMatchObject({ ok: true, recipients: 1 });
  });

  it("se dedar sozinho não vale", async () => {
    expect(await actions.pokeUser(ANA.id)).toEqual({
      ok: false,
      error: "Se dedar sozinho não vale.",
    });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("sem push configurado, avisa em vez de fingir", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(await actions.pokeUser(BIA.id)).toEqual({
      ok: false,
      error: "Push não está configurado no servidor.",
    });
    expect(await db.select().from(schema.notifications)).toEqual([]);
  });

  it("sem sessão não deda", async () => {
    state.user = null;
    await expect(actions.pokeUser(BIA.id)).rejects.toThrow();
  });
});
