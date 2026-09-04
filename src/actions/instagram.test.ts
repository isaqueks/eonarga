import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type InstagramActions = typeof import("./instagram");
type StagedModule = typeof import("@/lib/staged-imports");
type StorageModule = typeof import("@/lib/storage");
type RateLimitModule = typeof import("@/lib/rate-limit");

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

let actions: InstagramActions;
let staged: StagedModule;
let storage: StorageModule;
let clearAllRateLimits: RateLimitModule["clearAllRateLimits"];
let tmpDir: string;

const EMBED_URL = "https://www.instagram.com/p/C8Zxn3JJhcG/embed/captioned/";
const IMAGE_URL = "https://scontent.cdninstagram.com/v/t51/foto.jpg";

function embedHtml(imageUrl = IMAGE_URL): string {
  return `<html><body>
<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;nasa" src="${imageUrl.replace(/&/g, "&amp;")}" />
<div class="Caption"><a class="CaptionUsername">nasa</a><br /><br />Galveston vista do espaço &#x1F30E;<div class="CaptionComments">x</div></div>
</body></html>`;
}

function reelHtml(): string {
  const context = JSON.stringify({
    gql_data: {
      shortcode_media: { __typename: "GraphVideo", is_video: true, display_url: IMAGE_URL },
    },
  });
  return `<html><body><script>{"contextJSON":${JSON.stringify(context)}}</script>
<img class="EmbeddedMediaImage" src="${IMAGE_URL}" /></body></html>`;
}

/** Um `fetch` de mentira: responde por URL, e anota o que foi pedido. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} });
    const route = routes[url];
    if (!route) return new Response("nada", { status: 404 });
    return route();
  });
  vi.stubGlobal("fetch", impl);
  return calls;
}

async function pngResponse(): Promise<Response> {
  const png = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#8fd3b0" },
  })
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

const html = (body: string) => () =>
  new Response(body, { status: 200, headers: { "content-type": "text/html" } });

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-ig-"));
  process.env.UPLOAD_DIR = tmpDir;
  storage = await import("@/lib/storage");
  staged = await import("@/lib/staged-imports");
  ({ clearAllRateLimits } = await import("@/lib/rate-limit"));
  actions = await import("./instagram");
});

afterAll(() => {
  vi.unstubAllGlobals();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // No Windows o arquivo às vezes segue travado por um instante.
  }
});

beforeEach(() => {
  staged.clearStagedImports();
  clearAllRateLimits();
  state.user = ANA;
});

describe("importInstagramPost", () => {
  it("baixa a foto pro storage, põe no palco e devolve legenda e prévia", async () => {
    const calls = fakeFetch({ [EMBED_URL]: html(embedHtml()), [IMAGE_URL]: pngResponse });

    const result = await actions.importInstagramPost(
      "olha https://www.instagram.com/p/C8Zxn3JJhcG/?igsh=abc",
    );

    expect(result).toMatchObject({
      ok: true,
      caption: "Galveston vista do espaço 🌎",
      username: "nasa",
      sourceUrl: "https://www.instagram.com/p/C8Zxn3JJhcG/",
      slides: 1,
      width: 120,
      height: 80,
    });
    expect(result.url).toBe(`/api/uploads/${result.photoId}`);
    expect(fs.existsSync(storage.imagePath(result.photoId!, "full"))).toBe(true);
    expect(fs.existsSync(storage.imagePath(result.photoId!, "thumb"))).toBe(true);
    expect(staged.peekStagedImport(result.photoId!, ANA.id)).toMatchObject({
      sourceAuthor: "nasa",
      sourceUrl: "https://www.instagram.com/p/C8Zxn3JJhcG/",
    });

    // Dois fetches, na ordem, com o nosso user-agent (não fingimos ser navegador).
    expect(calls.map((c) => c.url)).toEqual([EMBED_URL, IMAGE_URL]);
    expect(calls[0].headers["user-agent"]).toMatch(/^EONargaBot\//);
  });

  it("recusa reel pelo link, sem nem buscar", async () => {
    const calls = fakeFetch({});
    expect(
      await actions.importInstagramPost("https://www.instagram.com/reel/DX7PnqbFL50/"),
    ).toEqual({ ok: false, error: "Só entra post com foto. Reel e vídeo não." });
    expect(calls).toHaveLength(0);
  });

  it("recusa vídeo que veio com link de post", async () => {
    fakeFetch({ [EMBED_URL]: html(reelHtml()) });
    expect(await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "Só entra post com foto. Reel e vídeo não.",
    });
    expect(staged.countStagedImports()).toBe(0);
  });

  it("recusa o que não é link do Instagram", async () => {
    expect(await actions.importInstagramPost("https://www.google.com/")).toEqual({
      ok: false,
      error: "Isso não parece um link de post do Instagram.",
    });
  });

  it("post sem imagem (privado ou apagado) é 'não achei'; Instagram fora é outro erro", async () => {
    fakeFetch({ [EMBED_URL]: html("<html><body>Instagram</body></html>") });
    expect(await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "Não achei esse post. Ele é público?",
    });

    fakeFetch({
      [EMBED_URL]: () => new Response("", { status: 302, headers: { location: "/login" } }),
    });
    expect(await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "O Instagram não respondeu. Tenta de novo ou manda a foto na mão.",
    });
  });

  it("só baixa imagem da CDN do Instagram", async () => {
    const calls = fakeFetch({
      [EMBED_URL]: html(embedHtml("https://169.254.169.254/latest/meta")),
    });
    expect(await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "Não consegui baixar a foto. Manda ela na mão.",
    });
    expect(calls.map((c) => c.url)).toEqual([EMBED_URL]);
  });

  it("imagem que não é imagem não entra", async () => {
    fakeFetch({ [EMBED_URL]: html(embedHtml()), [IMAGE_URL]: html("<html>not an image</html>") });
    expect(await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "Não consegui baixar a foto. Manda ela na mão.",
    });
    expect(staged.countStagedImports()).toBe(0);
  });

  it("para em 10 importações por 10 minutos", async () => {
    fakeFetch({ [EMBED_URL]: html(embedHtml()), [IMAGE_URL]: pngResponse });
    for (let i = 0; i < 10; i++) {
      expect(
        (await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).ok,
      ).toBe(true);
    }
    expect(await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "Calma, importador. Espera uns minutos.",
    });
  });

  it("exige sessão", async () => {
    state.user = null;
    await expect(
      actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/"),
    ).rejects.toThrow("Não autorizado");
  });
});

describe("discardInstagramImport", () => {
  it("tira do palco e apaga os arquivos; id de outra pessoa ou vazio é ignorado", async () => {
    fakeFetch({ [EMBED_URL]: html(embedHtml()), [IMAGE_URL]: pngResponse });
    const result = await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/");
    const id = result.photoId!;

    state.user = { id: "user-bia", name: "Bia", role: "member" };
    expect(await actions.discardInstagramImport(id)).toEqual({ ok: true });
    expect(fs.existsSync(storage.imagePath(id, "full"))).toBe(true);

    state.user = ANA;
    expect(await actions.discardInstagramImport("")).toEqual({ ok: true });
    expect(await actions.discardInstagramImport(id)).toEqual({ ok: true });
    expect(fs.existsSync(storage.imagePath(id, "full"))).toBe(false);
    expect(staged.countStagedImports()).toBe(0);
  });
});
