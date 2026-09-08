import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";

/**
 * `public/sw.js` é JS puro, sem import/export, então roda aqui num contexto de `vm` com
 * os globais mínimos de um service worker falsificados. Só a parte de notificação é
 * testada (ícone e badge); cache e navegação dependem do navegador de verdade.
 */

const ORIGIN = "https://eonarga.test";
const APP_ICON = "/icons/logo-face.png";
const BADGE = "/icons/badge-96.png";
const AVATAR = "/api/uploads/abcdefghijklmnop?v=thumb";
/** Os bytes 1, 2, 3, 255 em base64. */
const AVATAR_DATA_URL = "data:image/webp;base64,AQID/w==";

const source = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");

type Listener = (event: unknown) => void;
type FetchImpl = (request: Request) => Promise<Response>;

interface Worker {
  notificationIcon: (iconPath?: unknown) => Promise<string>;
  listeners: Map<string, Listener>;
  fetch: Mock<FetchImpl>;
  showNotification: Mock<(title: string, options: Record<string, unknown>) => Promise<void>>;
  /** O `pushManager.subscribe` do registro, pro `pushsubscriptionchange`. */
  subscribe: Mock<(options: unknown) => Promise<unknown>>;
  /** O cache de uploads, em memória, indexado pela URL. */
  store: Map<string, Response>;
}

function webp(): Response {
  return new Response(new Uint8Array([1, 2, 3, 255]), {
    status: 200,
    headers: { "content-type": "image/webp" },
  });
}

const unauthorized: FetchImpl = async () => new Response("nope", { status: 401 });

/** Sobe o worker com um cache em memória e um `fetch` falso. */
function boot(fetchImpl: FetchImpl = unauthorized): Worker {
  const store = new Map<string, Response>();
  const cache = {
    match: async (request: Request) => store.get(request.url),
    put: async (request: Request, response: Response) => {
      store.set(request.url, response);
    },
    keys: async () => [...store.keys()].map((url) => new Request(url)),
    delete: async (request: Request) => store.delete(request.url),
  };
  const listeners = new Map<string, Listener>();
  const fetch = vi.fn<FetchImpl>(fetchImpl);
  const showNotification = vi.fn<
    (title: string, options: Record<string, unknown>) => Promise<void>
  >(async () => undefined);
  const subscribe = vi.fn<(options: unknown) => Promise<unknown>>(async () => null);
  const sandbox: Record<string, unknown> = {
    location: new URL(`${ORIGIN}/sw.js?v=test`),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    caches: {
      open: async () => cache,
      keys: async () => [],
      match: async () => undefined,
      delete: async () => true,
    },
    fetch,
    registration: { showNotification, pushManager: { subscribe } },
    clients: { claim: async () => undefined, matchAll: async () => [] },
    URL,
    Request,
    Response,
    Headers,
    btoa,
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "sw.js" });
  return {
    notificationIcon: sandbox.notificationIcon as Worker["notificationIcon"],
    listeners,
    fetch,
    showNotification,
    subscribe,
    store,
  };
}

/** Dispara `pushsubscriptionchange` como o navegador faria e espera o `waitUntil`. */
async function subscriptionChange(sw: Worker, event: Record<string, unknown>) {
  const waited: Promise<unknown>[] = [];
  sw.listeners.get("pushsubscriptionchange")?.({
    ...event,
    waitUntil: (promise: Promise<unknown>) => waited.push(promise),
  });
  await Promise.all(waited);
}

/** Uma `PushSubscription` de mentira: só o que o worker lê dela. */
function fakeSubscription(endpoint: string, key: Uint8Array | null) {
  return {
    endpoint,
    options: { applicationServerKey: key ? key.buffer : null },
    toJSON: () => ({ endpoint, keys: { p256dh: `p-${endpoint}`, auth: `a-${endpoint}` } }),
  };
}

/** Os bytes 4, 250, 251, 252: "BPr7/A==" em base64, "BPr7_A" em base64url. */
const VAPID_BYTES = new Uint8Array([4, 250, 251, 252]);
const OLD = "https://push.example.com/antiga";
const NEW = "https://push.example.com/nova";

function sentBody(sw: Worker): { url: string; init: RequestInit; body: Record<string, unknown> } {
  const [url, init] = sw.fetch.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

/** Dispara o evento `push` como o navegador faria e espera o `waitUntil`. */
async function push(sw: Worker, payload: Record<string, unknown> | null) {
  const waited: Promise<unknown>[] = [];
  sw.listeners.get("push")?.({
    data: payload === null ? null : { json: () => payload },
    waitUntil: (promise: Promise<unknown>) => waited.push(promise),
  });
  await Promise.all(waited);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("notificationIcon", () => {
  it("sem foto no payload, usa o rosto do cachorro sem ir à rede", async () => {
    const sw = boot();
    expect(await sw.notificationIcon(undefined)).toBe(APP_ICON);
    expect(await sw.notificationIcon("")).toBe(APP_ICON);
    expect(await sw.notificationIcon(42)).toBe(APP_ICON);
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it("foto já no cache de uploads vira data URL sem rede", async () => {
    const sw = boot();
    sw.store.set(`${ORIGIN}${AVATAR}`, webp());
    expect(await sw.notificationIcon(AVATAR)).toBe(AVATAR_DATA_URL);
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it("fora do cache, baixa com a sessão e devolve data URL", async () => {
    const sw = boot(async () => webp());
    expect(await sw.notificationIcon(AVATAR)).toBe(AVATAR_DATA_URL);
    expect(sw.fetch).toHaveBeenCalledTimes(1);
    const request = sw.fetch.mock.calls[0][0];
    expect(request.url).toBe(`${ORIGIN}${AVATAR}`);
    expect(request.credentials).toBe("same-origin");
  });

  it("sem sessão (401), sem rede ou de outra origem, cai pro ícone do app", async () => {
    expect(await boot().notificationIcon(AVATAR)).toBe(APP_ICON);

    const offline = boot(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await offline.notificationIcon(AVATAR)).toBe(APP_ICON);

    const other = boot(async () => webp());
    expect(await other.notificationIcon("https://evil.example/x.webp")).toBe(APP_ICON);
    expect(other.fetch).not.toHaveBeenCalled();
  });

  it("foto que demora mais de 3 s não segura a notificação", async () => {
    vi.useFakeTimers();
    const sw = boot(() => new Promise<Response>(() => {}));
    const pending = sw.notificationIcon(AVATAR);
    await vi.advanceTimersByTimeAsync(3_001);
    expect(await pending).toBe(APP_ICON);
  });
});

describe("push", () => {
  it("mostra a notificação com a foto de quem agiu e o badge de narguilé", async () => {
    const sw = boot(async () => webp());
    await push(sw, {
      title: "E o narga?",
      body: "Bia te mencionou num post: “oi”",
      url: "/feed#post-1",
      tag: "mention:/feed#post-1",
      icon: AVATAR,
    });

    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = sw.showNotification.mock.calls[0];
    expect(title).toBe("E o narga?");
    expect(options).toEqual(
      expect.objectContaining({
        body: "Bia te mencionou num post: “oi”",
        icon: AVATAR_DATA_URL,
        badge: BADGE,
        tag: "mention:/feed#post-1",
        renotify: true,
        data: { url: "/feed#post-1" },
      }),
    );
  });

  it("aviso sem foto (admin) e push sem corpo usam o ícone do app", async () => {
    const sw = boot();
    await push(sw, { title: "Aviso", body: "Sexta tem rolê", url: "/", tag: "admin:1" });
    await push(sw, null);

    expect(sw.showNotification).toHaveBeenCalledTimes(2);
    expect(sw.showNotification.mock.calls[0][1]).toEqual(
      expect.objectContaining({ body: "Sexta tem rolê", icon: APP_ICON, badge: BADGE }),
    );
    expect(sw.showNotification.mock.calls[1][0]).toBe("E o narga?");
    expect(sw.showNotification.mock.calls[1][1]).toEqual(
      expect.objectContaining({ body: "Tem novidade no app.", icon: APP_ICON, badge: BADGE }),
    );
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it("repassa o padrão de vibração da dedada e ignora padrão malformado", async () => {
    const sw = boot();
    await push(sw, {
      body: "Ana enfiou o dedo no seu cu",
      tag: "poke:ana",
      vibrate: [300, 100, 300],
    });
    await push(sw, { body: "sem vibrar" });
    await push(sw, { body: "lixo", vibrate: ["forte", -1] });
    await push(sw, { body: "longo demais", vibrate: [100, 100000] });

    const calls = sw.showNotification.mock.calls;
    expect(calls[0][1]).toEqual(expect.objectContaining({ vibrate: [300, 100, 300] }));
    expect(calls[1][1]).not.toHaveProperty("vibrate");
    expect(calls[2][1]).not.toHaveProperty("vibrate");
    expect(calls[3][1]).not.toHaveProperty("vibrate");
  });
});

describe("pushsubscriptionchange", () => {
  it("assina de novo com a mesma chave e regrava no servidor, tirando a antiga", async () => {
    const sw = boot(async () => new Response("{}", { status: 200 }));
    sw.subscribe.mockResolvedValue(fakeSubscription(NEW, VAPID_BYTES));

    await subscriptionChange(sw, {
      oldSubscription: fakeSubscription(OLD, VAPID_BYTES),
      newSubscription: null,
    });

    expect(sw.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: VAPID_BYTES.buffer,
    });
    const { url, init, body } = sentBody(sw);
    expect(url).toBe("/api/push/subscribe");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(body).toEqual({
      endpoint: NEW,
      keys: { p256dh: `p-${NEW}`, auth: `a-${NEW}` },
      applicationServerKey: "BPr7_A",
      oldEndpoint: OLD,
    });
  });

  it("com a assinatura nova já no evento, só regrava", async () => {
    const sw = boot(async () => new Response("{}", { status: 200 }));

    await subscriptionChange(sw, {
      oldSubscription: fakeSubscription(OLD, VAPID_BYTES),
      newSubscription: fakeSubscription(NEW, VAPID_BYTES),
    });

    expect(sw.subscribe).not.toHaveBeenCalled();
    expect(sentBody(sw).body).toMatchObject({ endpoint: NEW, oldEndpoint: OLD });
  });

  it("sem chave pra assinar de novo, deixa pra próxima abertura do app", async () => {
    const sw = boot();
    await subscriptionChange(sw, { oldSubscription: fakeSubscription(OLD, null) });
    await subscriptionChange(sw, {});

    expect(sw.subscribe).not.toHaveBeenCalled();
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it("sem rede não estoura", async () => {
    const sw = boot(async () => {
      throw new TypeError("Failed to fetch");
    });
    sw.subscribe.mockResolvedValue(fakeSubscription(NEW, VAPID_BYTES));

    await expect(
      subscriptionChange(sw, { oldSubscription: fakeSubscription(OLD, VAPID_BYTES) }),
    ).resolves.toBeUndefined();
    expect(sw.fetch).toHaveBeenCalledTimes(1);
  });
});
