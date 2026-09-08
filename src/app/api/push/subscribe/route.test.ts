import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type RouteModule = typeof import("./route");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "user-ana", name: "Ana", role: "member" as const };

const state = vi.hoisted(() => ({
  user: null as { id: string; name: string; role: "admin" | "member" } | null,
}));

vi.mock("@/lib/auth/guards", () => ({
  assertUser: async () => {
    if (!state.user) throw new Error("Não autorizado");
    return { user: state.user, session: { id: "sess" } };
  },
}));

let route: RouteModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let clearAllRateLimits: () => void;
let tmpDir: string;

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://eonarga.test/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "SW/1.0", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function sub(id: string) {
  return {
    endpoint: `https://push.example.com/${id}`,
    keys: { p256dh: `p256dh-${id}`, auth: `auth-${id}` },
    applicationServerKey: "chave-publica",
  };
}

async function endpoints(): Promise<string[]> {
  const rows = await db
    .select({ endpoint: schema.pushSubscriptions.endpoint })
    .from(schema.pushSubscriptions);
  return rows.map((row) => row.endpoint).sort();
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-push-route-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;
  Object.assign(process.env, {
    VAPID_PUBLIC_KEY: "chave-publica",
    VAPID_PRIVATE_KEY: "chave-privada",
    VAPID_SUBJECT: "https://eonarga.com.br",
  });

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  ({ clearAllRateLimits } = await import("@/lib/rate-limit"));
  route = await import("./route");

  await db
    .insert(schema.users)
    .values({ id: ANA.id, name: ANA.name, email: "ana@example.com", passwordHash: "x" });
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
  clearAllRateLimits();
  await db.delete(schema.pushSubscriptions);
  state.user = ANA;
});

describe("POST /api/push/subscribe", () => {
  it("regrava a assinatura nova e tira a antiga", async () => {
    await db.insert(schema.pushSubscriptions).values({
      id: "antiga",
      userId: ANA.id,
      endpoint: "https://push.example.com/antiga",
      p256dh: "x",
      auth: "y",
    });

    const response = await route.POST(
      post({ ...sub("nova"), oldEndpoint: "https://push.example.com/antiga" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await endpoints()).toEqual(["https://push.example.com/nova"]);
    const [row] = await db.select().from(schema.pushSubscriptions);
    expect(row).toMatchObject({ userId: ANA.id, userAgent: "SW/1.0" });
  });

  it("chave trocada e corpo inválido dão 400, com o motivo", async () => {
    const wrongKey = await route.POST(post({ ...sub("nova"), applicationServerKey: "outra" }));
    expect(wrongKey.status).toBe(400);
    expect(await wrongKey.json()).toMatchObject({ reason: "key-changed", key: "chave-publica" });

    expect((await route.POST(post("isso não é json"))).status).toBe(400);
    expect((await route.POST(post({ endpoint: "ftp://x" }))).status).toBe(400);
    expect(await endpoints()).toEqual([]);
  });

  it("exige sessão e mesma origem", async () => {
    expect((await route.POST(post(sub("nova"), { origin: "https://evil.example" }))).status).toBe(
      400,
    );

    state.user = null;
    expect((await route.POST(post(sub("nova")))).status).toBe(401);
    expect(await endpoints()).toEqual([]);
  });
});
