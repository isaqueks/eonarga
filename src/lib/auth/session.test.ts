import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

type SessionModule = typeof import("./session");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

let auth: SessionModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

const USER_ID = "user-teste-1";
const OTHER_USER_ID = "user-teste-2";

beforeAll(async () => {
  // Banco descartável: precisa existir ANTES de o client ser importado (ele lê DATABASE_URL no load).
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-session-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  auth = await import("./session");

  await db.insert(schema.users).values([
    { id: USER_ID, name: "Ana", email: "ana@example.com", passwordHash: "x" },
    { id: OTHER_USER_ID, name: "Bia", email: "bia@example.com", passwordHash: "x" },
  ]);
});

afterAll(() => {
  db.$client.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // No Windows o arquivo às vezes segue travado por um instante; o temp se resolve sozinho.
  }
});

beforeEach(async () => {
  await db.delete(schema.sessions);
  await db.update(schema.users).set({ isActive: true }).where(eq(schema.users.id, USER_ID)).run();
});

async function setExpiry(sessionId: string, at: Date) {
  await db
    .update(schema.sessions)
    .set({ expiresAt: at.toISOString() })
    .where(eq(schema.sessions.id, sessionId));
}

describe("createSession", () => {
  it("grava só o sha256 do token e expira em 30 dias", async () => {
    const { token, sessionId, expiresAt } = await auth.createSession(USER_ID, "vitest/1.0");

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes em base64url
    expect(sessionId).toBe(auth.hashSessionToken(token));

    const row = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, sessionId) });
    expect(row).toBeDefined();
    expect(row!.userId).toBe(USER_ID);
    expect(row!.userAgent).toBe("vitest/1.0");
    // O token cru não aparece em lugar nenhum da linha.
    expect(JSON.stringify(row)).not.toContain(token);

    const dias = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(29.9);
    expect(dias).toBeLessThan(30.1);
  });
});

describe("validateSessionToken", () => {
  it("devolve sessão e usuário pro token certo", async () => {
    const { token, sessionId } = await auth.createSession(USER_ID);
    const result = await auth.validateSessionToken(token);

    expect(result).not.toBeNull();
    expect(result!.session.id).toBe(sessionId);
    expect(result!.user.id).toBe(USER_ID);
    expect(result!.user.email).toBe("ana@example.com");
  });

  it("devolve null pra token inexistente ou vazio", async () => {
    expect(await auth.validateSessionToken("")).toBeNull();
    expect(await auth.validateSessionToken("token-que-nunca-existiu")).toBeNull();
  });

  it("rejeita sessão expirada e apaga a linha", async () => {
    const { token, sessionId } = await auth.createSession(USER_ID);
    await setExpiry(sessionId, new Date(Date.now() - 1000));

    expect(await auth.validateSessionToken(token)).toBeNull();
    const row = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, sessionId) });
    expect(row).toBeUndefined();
  });

  it("renova quando passou da metade da vida", async () => {
    const { token, sessionId } = await auth.createSession(USER_ID);
    const quaseVencendo = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 dia
    await setExpiry(sessionId, quaseVencendo);

    const result = await auth.validateSessionToken(token);
    expect(result).not.toBeNull();

    const novo = new Date(result!.session.expiresAt).getTime();
    expect(novo).toBeGreaterThan(quaseVencendo.getTime());
    expect((novo - Date.now()) / 86_400_000).toBeGreaterThan(29.9);

    const row = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, sessionId) });
    expect(row!.expiresAt).toBe(result!.session.expiresAt);
  });

  it("não renova quando ainda tem mais da metade da vida", async () => {
    const { token, sessionId } = await auth.createSession(USER_ID);
    const antes = (await db.query.sessions.findFirst({
      where: eq(schema.sessions.id, sessionId),
    }))!.expiresAt;

    const result = await auth.validateSessionToken(token);
    expect(result!.session.expiresAt).toBe(antes);
  });

  it("rejeita usuário desativado", async () => {
    const { token, sessionId } = await auth.createSession(USER_ID);
    await db
      .update(schema.users)
      .set({ isActive: false })
      .where(eq(schema.users.id, USER_ID))
      .run();

    expect(await auth.validateSessionToken(token)).toBeNull();
    // A linha continua lá; quem derruba as sessões é o `setUserActive`.
    const row = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, sessionId) });
    expect(row).toBeDefined();
  });
});

describe("invalidateSession / invalidateUserSessions", () => {
  it("invalida uma sessão só", async () => {
    const a = await auth.createSession(USER_ID);
    const b = await auth.createSession(USER_ID);

    await auth.invalidateSession(a.sessionId);

    expect(await auth.validateSessionToken(a.token)).toBeNull();
    expect(await auth.validateSessionToken(b.token)).not.toBeNull();
  });

  it("invalida todas as sessões do usuário", async () => {
    const a = await auth.createSession(USER_ID);
    const b = await auth.createSession(USER_ID);
    const outro = await auth.createSession(OTHER_USER_ID);

    await auth.invalidateUserSessions(USER_ID);

    expect(await auth.validateSessionToken(a.token)).toBeNull();
    expect(await auth.validateSessionToken(b.token)).toBeNull();
    expect(await auth.validateSessionToken(outro.token)).not.toBeNull();
  });

  it("poupa a sessão atual quando pedido", async () => {
    const atual = await auth.createSession(USER_ID);
    const antiga = await auth.createSession(USER_ID);

    await auth.invalidateUserSessions(USER_ID, atual.sessionId);

    expect(await auth.validateSessionToken(atual.token)).not.toBeNull();
    expect(await auth.validateSessionToken(antiga.token)).toBeNull();
  });
});
