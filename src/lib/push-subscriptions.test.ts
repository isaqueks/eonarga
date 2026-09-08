import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

type Module = typeof import("./push-subscriptions");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = "user-ana";
const BIA = "user-bia";

const VAPID = {
  VAPID_PUBLIC_KEY: "BCikMoHv-chave_publica-de-teste",
  VAPID_PRIVATE_KEY: "chave-privada",
  VAPID_SUBJECT: "https://eonarga.com.br",
};

let lib: Module;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

function sub(id: string, extra: Record<string, unknown> = {}) {
  return {
    endpoint: `https://push.example.com/${id}`,
    keys: { p256dh: `p256dh-${id}`, auth: `auth-${id}` },
    ...extra,
  };
}

async function rows() {
  return db
    .select({
      userId: schema.pushSubscriptions.userId,
      endpoint: schema.pushSubscriptions.endpoint,
      p256dh: schema.pushSubscriptions.p256dh,
      userAgent: schema.pushSubscriptions.userAgent,
    })
    .from(schema.pushSubscriptions)
    .orderBy(schema.pushSubscriptions.endpoint);
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-push-subs-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  lib = await import("./push-subscriptions");

  await db
    .insert(schema.users)
    .values(
      [ANA, BIA].map((id) => ({ id, name: id, email: `${id}@example.com`, passwordHash: "x" })),
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
  await db.delete(schema.pushSubscriptions);
});

afterEach(() => {
  Object.assign(process.env, VAPID);
});

describe("sameKey", () => {
  it("ignora padding e a diferença entre base64 e base64url", () => {
    expect(lib.sameKey("abc+/x==", "abc-_x")).toBe(true);
    expect(lib.sameKey(" abc-_x ", "abc-_x")).toBe(true);
    expect(lib.sameKey("abc", "abd")).toBe(false);
  });
});

describe("upsertPushSubscription", () => {
  it("grava, regrava a mesma e troca o dono quando outra conta usa o mesmo navegador", async () => {
    expect(await lib.upsertPushSubscription(ANA, sub("celular"), "UA 1")).toEqual({ ok: true });
    expect(await rows()).toEqual([
      {
        userId: ANA,
        endpoint: "https://push.example.com/celular",
        p256dh: "p256dh-celular",
        userAgent: "UA 1",
      },
    ]);

    // Regravar é o que a abertura do app faz: mesma linha, chaves e user-agent novos.
    const again = sub("celular", { keys: { p256dh: "novo", auth: "novo" } });
    expect(await lib.upsertPushSubscription(ANA, again, "UA 2")).toEqual({ ok: true });
    expect(await rows()).toMatchObject([{ userId: ANA, p256dh: "novo", userAgent: "UA 2" }]);

    expect(await lib.upsertPushSubscription(BIA, sub("celular"), "UA 2")).toEqual({ ok: true });
    expect(await rows()).toMatchObject([{ userId: BIA }]);
  });

  it("chave de outra época é recusada com a chave atual; a certa passa em qualquer grafia", async () => {
    expect(
      await lib.upsertPushSubscription(
        ANA,
        sub("celular", { applicationServerKey: "outra" }),
        null,
      ),
    ).toEqual({
      ok: false,
      error: "A chave do servidor mudou. Assina de novo.",
      reason: "key-changed",
      key: VAPID.VAPID_PUBLIC_KEY,
    });
    expect(await rows()).toEqual([]);

    const base64 = VAPID.VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/") + "=";
    expect(
      await lib.upsertPushSubscription(ANA, sub("celular", { applicationServerKey: base64 }), null),
    ).toEqual({ ok: true });
    // Sem chave (navegador que não expõe) e sem VAPID no servidor, não confere nada.
    expect(
      await lib.upsertPushSubscription(ANA, sub("tablet", { applicationServerKey: null }), null),
    ).toEqual({ ok: true });
    delete process.env.VAPID_PUBLIC_KEY;
    expect(
      await lib.upsertPushSubscription(ANA, sub("pc", { applicationServerKey: "outra" }), null),
    ).toEqual({ ok: true });
  });

  it("assinatura trocada pelo navegador: a nova entra e a antiga sai, se for da mesma pessoa", async () => {
    await lib.upsertPushSubscription(ANA, sub("antiga"), null);
    await lib.upsertPushSubscription(BIA, sub("da-bia"), null);

    expect(
      await lib.upsertPushSubscription(ANA, sub("nova"), null, {
        oldEndpoint: "https://push.example.com/antiga",
      }),
    ).toEqual({ ok: true });
    expect((await rows()).map((r) => r.endpoint)).toEqual([
      "https://push.example.com/da-bia",
      "https://push.example.com/nova",
    ]);

    // `oldEndpoint` de outra pessoa não apaga nada.
    await lib.upsertPushSubscription(ANA, sub("nova"), null, {
      oldEndpoint: "https://push.example.com/da-bia",
    });
    expect(await rows()).toHaveLength(2);
  });

  it("recusa lixo sem tocar no banco", async () => {
    expect(await lib.upsertPushSubscription(ANA, null, null)).toEqual({
      ok: false,
      error: "Assinatura inválida.",
      reason: "invalid",
    });
    expect(
      await lib.upsertPushSubscription(ANA, { endpoint: "http://inseguro", keys: {} }, null),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(await rows()).toEqual([]);
  });
});

describe("deletePushSubscription", () => {
  it("apaga só a assinatura da própria pessoa", async () => {
    await lib.upsertPushSubscription(ANA, sub("celular"), null);
    await lib.deletePushSubscription(BIA, "https://push.example.com/celular");
    expect(await rows()).toHaveLength(1);
    await lib.deletePushSubscription(ANA, "https://push.example.com/celular");
    expect(await rows()).toHaveLength(0);
  });
});
