import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type PushModule = typeof import("./push");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = "user-ana";
const BIA = "user-bia";
const CADU = "user-cadu";

const VAPID = {
  VAPID_PUBLIC_KEY: "chave-publica",
  VAPID_PRIVATE_KEY: "chave-privada",
  VAPID_SUBJECT: "https://eonarga.com.br",
};

// O web-push abre conexão de verdade com FCM/Apple/Mozilla: nos testes ele é sempre falso.
const webpush = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({ default: webpush }));

let push: PushModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

/** Erro no formato do `WebPushError`: o que interessa pra gente é o `statusCode`. */
function pushError(statusCode: number): Error {
  return Object.assign(new Error(`push respondeu ${statusCode}`), { statusCode });
}

async function subscription(id: string, userId: string) {
  await db.insert(schema.pushSubscriptions).values({
    id,
    userId,
    endpoint: `https://push.example.com/${id}`,
    p256dh: `p256dh-${id}`,
    auth: `auth-${id}`,
  });
}

async function endpoints(): Promise<string[]> {
  const rows = await db
    .select({ endpoint: schema.pushSubscriptions.endpoint })
    .from(schema.pushSubscriptions);
  return rows.map((row) => row.endpoint).sort();
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-push-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  push = await import("./push");

  await db.insert(schema.users).values(
    [ANA, BIA, CADU].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
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
  webpush.setVapidDetails.mockClear();
  await db.delete(schema.pushSubscriptions);
});

afterEach(() => {
  Object.assign(process.env, VAPID);
});

const PAYLOAD = { title: "E o narga?", body: "Ana chamou a galera pro Sebo do João" };

describe("isPushEnabled / getVapidPublicKey", () => {
  it("só liga com as três variáveis preenchidas", () => {
    expect(push.isPushEnabled()).toBe(true);
    expect(push.getVapidPublicKey()).toBe("chave-publica");

    for (const name of Object.keys(VAPID)) {
      const previous = process.env[name];
      delete process.env[name];
      expect(push.isPushEnabled()).toBe(false);
      expect(push.getVapidPublicKey()).toBeNull();
      process.env[name] = previous;
    }

    // Variável vazia é o mesmo que não ter (é o que sobra de um .env pela metade).
    process.env.VAPID_PRIVATE_KEY = "  ";
    expect(push.isPushEnabled()).toBe(false);
  });
});

describe("sendPushTo", () => {
  it("sem as chaves VAPID não chama o web-push e devolve zeros", async () => {
    await subscription("sub-1", ANA);
    delete process.env.VAPID_PRIVATE_KEY;

    expect(await push.sendPushTo(null, PAYLOAD)).toEqual({
      sent: 0,
      failed: 0,
      removed: 0,
      recipients: 0,
    });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("manda pra cada aparelho e conta as pessoas uma vez só", async () => {
    await subscription("ana-celular", ANA);
    await subscription("ana-note", ANA);
    await subscription("bia-celular", BIA);

    const report = await push.sendPushTo([ANA, BIA], PAYLOAD);

    expect(report).toEqual({ sent: 3, failed: 0, removed: 0, recipients: 2 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(3);

    const [subscriptionArg, body] = webpush.sendNotification.mock.calls[0];
    expect(subscriptionArg).toMatchObject({ keys: { p256dh: expect.any(String) } });
    expect(JSON.parse(body as string)).toEqual(PAYLOAD);
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      VAPID.VAPID_SUBJECT,
      VAPID.VAPID_PUBLIC_KEY,
      VAPID.VAPID_PRIVATE_KEY,
    );
  });

  it("`null` é todo mundo; lista vazia é ninguém", async () => {
    await subscription("ana-celular", ANA);
    await subscription("cadu-celular", CADU);

    expect(await push.sendPushTo(null, PAYLOAD)).toMatchObject({ sent: 2, recipients: 2 });

    webpush.sendNotification.mockClear();
    expect(await push.sendPushTo([], PAYLOAD)).toEqual({
      sent: 0,
      failed: 0,
      removed: 0,
      recipients: 0,
    });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("apaga a assinatura que o serviço devolve como morta (404/410)", async () => {
    await subscription("ana-velho", ANA);
    await subscription("bia-celular", BIA);

    webpush.sendNotification.mockImplementation((sub: { endpoint: string }) =>
      sub.endpoint.endsWith("ana-velho")
        ? Promise.reject(pushError(410))
        : Promise.resolve({ statusCode: 201 }),
    );

    const report = await push.sendPushTo(null, PAYLOAD);

    expect(report).toEqual({ sent: 1, failed: 0, removed: 1, recipients: 1 });
    expect(await endpoints()).toEqual(["https://push.example.com/bia-celular"]);
  });

  it("erro genérico conta como falha e a assinatura fica", async () => {
    await subscription("ana-celular", ANA);
    webpush.sendNotification.mockRejectedValue(new Error("timeout"));

    const report = await push.sendPushTo(null, PAYLOAD);

    expect(report).toEqual({ sent: 0, failed: 1, removed: 0, recipients: 0 });
    expect(await endpoints()).toEqual(["https://push.example.com/ana-celular"]);
  });

  it("`excludeUserId` tira quem chamou do envio", async () => {
    await subscription("ana-celular", ANA);
    await subscription("bia-celular", BIA);
    await subscription("cadu-celular", CADU);

    const report = await push.sendPushTo(null, PAYLOAD, { excludeUserId: ANA });

    expect(report).toMatchObject({ sent: 2, recipients: 2 });
    const alvos = webpush.sendNotification.mock.calls.map(
      (call) => (call[0] as { endpoint: string }).endpoint,
    );
    expect(alvos.some((endpoint) => endpoint.includes("ana"))).toBe(false);
  });

  it("sem ninguém assinado devolve zeros", async () => {
    expect(await push.sendPushTo(null, PAYLOAD)).toEqual({
      sent: 0,
      failed: 0,
      removed: 0,
      recipients: 0,
    });
  });
});

describe("countPushAudience", () => {
  it("conta aparelhos e pessoas", async () => {
    await subscription("ana-celular", ANA);
    await subscription("ana-note", ANA);
    await subscription("bia-celular", BIA);

    expect(await push.countPushAudience()).toEqual({ devices: 3, people: 2 });

    await db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, BIA))
      .execute();
    expect(await push.countPushAudience()).toEqual({ devices: 2, people: 1 });
  });
});
