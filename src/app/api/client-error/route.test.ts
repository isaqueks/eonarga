import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type RouteModule = typeof import("./route");

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
let clearAllRateLimits: () => void;

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://eonarga.test/api/client-error", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Pixel/7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const report = {
  message: 'Failed to find Server Action "abc".\nThis request might be from an older deployment.',
  digest: "123456",
  stack: "Error: x\n    at a\n    at b",
  path: "/feed",
  version: "0.18.2",
};

beforeAll(async () => {
  ({ clearAllRateLimits } = await import("@/lib/rate-limit"));
  route = await import("./route");
});

beforeEach(() => {
  clearAllRateLimits();
  state.user = ANA;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/client-error", () => {
  it("põe o erro no log com quem, versão, tela e a mensagem numa linha só", async () => {
    const response = await route.POST(post(report));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(console.warn).toHaveBeenCalledTimes(1);
    const line = String(vi.mocked(console.warn).mock.calls[0][0]);
    expect(line).toContain("[eonarga] erro no cliente (Ana v0.18.2 em /feed) digest=123456:");
    expect(line).toContain('Failed to find Server Action "abc". This request might be');
    expect(line).toContain("ua=Pixel/7");
    expect(line).toContain("\nError: x\n    at a");
  });

  it("recusa corpo que não é JSON, mensagem vazia e origem estranha", async () => {
    expect((await route.POST(post("isso não é json"))).status).toBe(400);
    expect((await route.POST(post({ message: "   " }))).status).toBe(400);
    expect((await route.POST(post(report, { origin: "https://evil.example" }))).status).toBe(400);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("exige sessão e para em 10 por minuto", async () => {
    for (let i = 0; i < 10; i++) expect((await route.POST(post(report))).status).toBe(200);
    expect((await route.POST(post(report))).status).toBe(429);

    state.user = null;
    expect((await route.POST(post(report))).status).toBe(401);
  });
});
