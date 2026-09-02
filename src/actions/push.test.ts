import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type PushActions = typeof import("./push");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "user-ana", name: "Ana", role: "member" as const };
const BIA = { id: "user-bia", name: "Bia", role: "member" as const };
const CADU = { id: "user-cadu", name: "Cadu", role: "admin" as const };
const SUMIU = { id: "user-sumiu", name: "Zé", role: "member" as const };

const CATEGORY_ID = "cat-sebo";
const SEBO = "place-sebo";
const MORTO = "place-morto";

const VAPID = {
  VAPID_PUBLIC_KEY: "chave-publica",
  VAPID_PRIVATE_KEY: "chave-privada",
  VAPID_SUBJECT: "https://eonarga.com.br",
};

const state = vi.hoisted(() => ({
  user: null as { id: string; name: string; role: "admin" | "member" } | null,
}));

const webpush = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({ default: webpush }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "Vitest/1.0 (celular da Ana)" }),
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

let actions: PushActions;
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

function sub(id: string) {
  return {
    endpoint: `https://push.example.com/${id}`,
    keys: { p256dh: `p256dh-${id}`, auth: `auth-${id}` },
  };
}

async function allSubscriptions() {
  return db.select().from(schema.pushSubscriptions);
}

async function allNotifications() {
  return db.select().from(schema.notifications);
}

/** Endpoints que o web-push recebeu nesta rodada. */
function pushedTo(): string[] {
  return webpush.sendNotification.mock.calls
    .map((call) => (call[0] as { endpoint: string }).endpoint)
    .sort();
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const EMPTY = { ok: false } as const;

const AVISO = {
  target: "all",
  title: "E o narga?",
  body: "Sexta tem rolê no Centro",
  url: "",
};

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-push-actions-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  ({ clearAllRateLimits } = await import("@/lib/rate-limit"));
  actions = await import("./push");

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

  await db
    .insert(schema.categories)
    .values([
      { id: CATEGORY_ID, name: "Sebo", slug: "sebo", emoji: "📚", color: "#8fd3b0", sortOrder: 0 },
    ]);

  await db.insert(schema.places).values([
    {
      id: SEBO,
      slug: "sebo-do-joao",
      name: "Sebo do João",
      categoryId: CATEGORY_ID,
      lat: -27.59,
      lng: -48.54,
      status: "active",
      createdBy: ANA.id,
    },
    {
      id: MORTO,
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
  Object.assign(process.env, VAPID);
  webpush.sendNotification.mockReset();
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
  clearAllRateLimits();
  await db.delete(schema.notifications);
  await db.delete(schema.pushSubscriptions);
  state.user = ANA;
});

describe("savePushSubscription", () => {
  it("guarda a assinatura com o user-agent do request", async () => {
    expect(await actions.savePushSubscription(sub("ana-celular"))).toEqual({ ok: true });

    const rows = await allSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: ANA.id,
      endpoint: "https://push.example.com/ana-celular",
      p256dh: "p256dh-ana-celular",
      userAgent: "Vitest/1.0 (celular da Ana)",
    });
    expect(rows[0].lastSeenAt).toBeTruthy();
  });

  it("mesmo endpoint atualiza em vez de duplicar", async () => {
    await actions.savePushSubscription(sub("ana-celular"));
    await actions.savePushSubscription({
      endpoint: "https://push.example.com/ana-celular",
      keys: { p256dh: "p256dh-novo", auth: "auth-novo" },
    });

    const rows = await allSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: ANA.id, p256dh: "p256dh-novo", auth: "auth-novo" });
  });

  it("outro login no mesmo aparelho reatribui a assinatura", async () => {
    await actions.savePushSubscription(sub("celular-emprestado"));

    state.user = BIA;
    await actions.savePushSubscription(sub("celular-emprestado"));

    const rows = await allSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(BIA.id);
  });

  it("recusa endpoint que não é uma URL https e exige sessão", async () => {
    expect(
      await actions.savePushSubscription({
        endpoint: "javascript:alert(1)",
        keys: { p256dh: "a", auth: "b" },
      }),
    ).toEqual({ ok: false, error: "Assinatura inválida." });

    expect(
      await actions.savePushSubscription({
        endpoint: "https://push.example.com/x",
        keys: { p256dh: "", auth: "b" },
      }),
    ).toMatchObject({ ok: false });

    expect(await allSubscriptions()).toHaveLength(0);

    state.user = null;
    await expect(actions.savePushSubscription(sub("qualquer"))).rejects.toThrow("Não autorizado");
  });
});

describe("removePushSubscription", () => {
  it("apaga só a assinatura da própria pessoa", async () => {
    await subscribe("ana-celular", ANA.id);
    await subscribe("bia-celular", BIA.id);

    // Ana tentando apagar o aparelho da Bia: não acontece nada.
    expect(await actions.removePushSubscription("https://push.example.com/bia-celular")).toEqual({
      ok: true,
    });
    expect(await allSubscriptions()).toHaveLength(2);

    expect(await actions.removePushSubscription("https://push.example.com/ana-celular")).toEqual({
      ok: true,
    });
    const rows = await allSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(BIA.id);
  });

  it("recusa endpoint vazio", async () => {
    expect(await actions.removePushSubscription("   ")).toEqual({
      ok: false,
      error: "Assinatura inválida.",
    });
  });
});

describe("callGroup", () => {
  it("manda pra todo mundo menos quem chamou e grava o disparo", async () => {
    await subscribe("ana-celular", ANA.id);
    await subscribe("bia-celular", BIA.id);
    await subscribe("bia-note", BIA.id);
    await subscribe("cadu-celular", CADU.id);

    const result = await actions.callGroup(SEBO);

    expect(result).toEqual({ ok: true, sent: 3, recipients: 2 });
    expect(pushedTo()).toEqual([
      "https://push.example.com/bia-celular",
      "https://push.example.com/bia-note",
      "https://push.example.com/cadu-celular",
    ]);

    const payload = JSON.parse(webpush.sendNotification.mock.calls[0][1] as string);
    expect(payload).toMatchObject({
      title: "E o narga?",
      body: "Ana chamou a galera pro Sebo do João",
      url: "/lugares/sebo-do-joao",
    });

    const rows = await allNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "call",
      title: "E o narga?",
      body: "Ana chamou a galera pro Sebo do João",
      url: "/lugares/sebo-do-joao",
      placeId: SEBO,
      createdBy: ANA.id,
      targetUserId: null,
      sentCount: 3,
    });
  });

  it("grava mesmo sem ninguém pra avisar", async () => {
    const result = await actions.callGroup(SEBO);

    expect(result).toEqual({ ok: true, sent: 0, recipients: 0 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(await allNotifications()).toHaveLength(1);
  });

  it("segura a mesma pessoa chamando de novo", async () => {
    expect(await actions.callGroup(SEBO)).toMatchObject({ ok: true });

    const outro = "place-outro";
    await db.insert(schema.places).values({
      id: outro,
      slug: "bar-do-ze",
      name: "Bar do Zé",
      categoryId: CATEGORY_ID,
      lat: -27.6,
      lng: -48.55,
      status: "active",
      createdBy: ANA.id,
    });

    expect(await actions.callGroup(outro)).toEqual({
      ok: false,
      error: "Calma. Você já chamou a galera há pouco.",
    });
    expect(await allNotifications()).toHaveLength(1);

    await db.delete(schema.places).where(eq(schema.places.id, outro));
  });

  it("segura duas pessoas chamando pro mesmo lugar, sem gastar a vez da segunda", async () => {
    expect(await actions.callGroup(SEBO)).toMatchObject({ ok: true });

    state.user = BIA;
    expect(await actions.callGroup(SEBO)).toEqual({
      ok: false,
      error: "Alguém acabou de chamar pra esse lugar.",
    });

    // Barrou o lugar, não a Bia: ela ainda pode chamar pra outro canto.
    const outro = "place-outro-2";
    await db.insert(schema.places).values({
      id: outro,
      slug: "bar-do-ze-2",
      name: "Bar do Zé",
      categoryId: CATEGORY_ID,
      lat: -27.6,
      lng: -48.55,
      status: "active",
      createdBy: BIA.id,
    });

    expect(await actions.callGroup(outro)).toMatchObject({ ok: true });
    await db.delete(schema.places).where(eq(schema.places.id, outro));
  });

  it("recusa lugar inexistente ou arquivado, sem gastar o limite", async () => {
    expect(await actions.callGroup("nao-existe")).toEqual({
      ok: false,
      error: "Lugar não encontrado.",
    });
    expect(await actions.callGroup(MORTO)).toEqual({
      ok: false,
      error: "Esse lugar está arquivado.",
    });

    expect(await actions.callGroup(SEBO)).toMatchObject({ ok: true });
    expect(await allNotifications()).toHaveLength(1);
  });

  it("sem chaves VAPID nem tenta", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await subscribe("bia-celular", BIA.id);

    expect(await actions.callGroup(SEBO)).toEqual({
      ok: false,
      error: "Push não está configurado no servidor.",
    });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(await allNotifications()).toHaveLength(0);
  });

  it("exige sessão", async () => {
    state.user = null;
    await expect(actions.callGroup(SEBO)).rejects.toThrow("Não autorizado");
  });
});

describe("sendAdminNotification", () => {
  beforeEach(() => {
    state.user = CADU;
  });

  it("manda pra todo mundo e guarda o histórico", async () => {
    await subscribe("ana-celular", ANA.id);
    await subscribe("bia-celular", BIA.id);

    const result = await actions.sendAdminNotification(
      EMPTY,
      form({ ...AVISO, url: "/lugares/sebo-do-joao" }),
    );

    expect(result).toEqual({ ok: true, sent: 2, recipients: 2, failed: 0 });
    expect(pushedTo()).toHaveLength(2);

    const rows = await allNotifications();
    expect(rows[0]).toMatchObject({
      kind: "admin",
      title: "E o narga?",
      body: "Sexta tem rolê no Centro",
      url: "/lugares/sebo-do-joao",
      targetUserId: null,
      placeId: null,
      createdBy: CADU.id,
      sentCount: 2,
    });
  });

  it("manda pra uma pessoa só", async () => {
    await subscribe("ana-celular", ANA.id);
    await subscribe("bia-celular", BIA.id);

    const result = await actions.sendAdminNotification(EMPTY, form({ ...AVISO, target: BIA.id }));

    expect(result).toMatchObject({ ok: true, sent: 1, recipients: 1 });
    expect(pushedTo()).toEqual(["https://push.example.com/bia-celular"]);
    expect((await allNotifications())[0].targetUserId).toBe(BIA.id);
  });

  it("recusa alvo que não existe ou está desativado", async () => {
    expect(
      await actions.sendAdminNotification(EMPTY, form({ ...AVISO, target: "nao-existe" })),
    ).toEqual({ ok: false, fieldErrors: { target: "Pessoa não encontrada." } });

    expect(
      await actions.sendAdminNotification(EMPTY, form({ ...AVISO, target: SUMIU.id })),
    ).toEqual({ ok: false, fieldErrors: { target: "Pessoa não encontrada." } });

    expect(await allNotifications()).toHaveLength(0);
  });

  it("valida título, mensagem e link", async () => {
    const curto = await actions.sendAdminNotification(
      EMPTY,
      form({ ...AVISO, title: "oi", body: "x" }),
    );
    expect(curto.fieldErrors).toMatchObject({
      title: "Título curto demais",
      body: "Mensagem curta demais",
    });

    const comprido = await actions.sendAdminNotification(
      EMPTY,
      form({ ...AVISO, title: "a".repeat(61), body: "b".repeat(201) }),
    );
    expect(comprido.fieldErrors?.title).toContain("comprido");
    expect(comprido.fieldErrors?.body).toContain("comprida");

    for (const url of ["https://evil.example.com", "//evil.example.com", "lugares/sebo"]) {
      const parsed = await actions.sendAdminNotification(EMPTY, form({ ...AVISO, url }));
      expect(parsed.fieldErrors?.url).toBeTruthy();
    }

    expect(await allNotifications()).toHaveLength(0);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("link vazio vira null e o push abre a home", async () => {
    await subscribe("ana-celular", ANA.id);

    expect(await actions.sendAdminNotification(EMPTY, form(AVISO))).toMatchObject({ ok: true });

    expect(JSON.parse(webpush.sendNotification.mock.calls[0][1] as string).url).toBe("/");
    expect((await allNotifications())[0].url).toBeNull();
  });

  it("conta os envios que falharam", async () => {
    await subscribe("ana-celular", ANA.id);
    webpush.sendNotification.mockRejectedValue(new Error("timeout"));

    expect(await actions.sendAdminNotification(EMPTY, form(AVISO))).toEqual({
      ok: true,
      sent: 0,
      recipients: 0,
      failed: 1,
    });
  });

  it("sem chaves VAPID não manda", async () => {
    delete process.env.VAPID_SUBJECT;

    expect(await actions.sendAdminNotification(EMPTY, form(AVISO))).toEqual({
      ok: false,
      error: "Push não está configurado no servidor.",
    });
    expect(await allNotifications()).toHaveLength(0);
  });

  it("membro não manda aviso", async () => {
    state.user = ANA;
    await expect(actions.sendAdminNotification(EMPTY, form(AVISO))).rejects.toThrow(
      "Não autorizado",
    );
  });
});
