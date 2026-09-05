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
const VIDEO_URL = "https://instagram.fnvt11-1.fna.fbcdn.net/o1/v/t2/f2/m86/reel.mp4";
const FIXTURES = path.resolve("e2e/fixtures");

function embedHtml(imageUrl = IMAGE_URL): string {
  return `<html><body>
<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;nasa" src="${imageUrl.replace(/&/g, "&amp;")}" />
<div class="Caption"><a class="CaptionUsername">nasa</a><br /><br />Galveston vista do espaço &#x1F30E;<div class="CaptionComments">x</div></div>
</body></html>`;
}

function reelHtml(extra: Record<string, unknown> = {}): string {
  const context = JSON.stringify({
    gql_data: {
      shortcode_media: {
        __typename: "GraphVideo",
        is_video: true,
        display_url: IMAGE_URL,
        dimensions: { width: 1080, height: 1920 },
        owner: { username: "nasainternships" },
        edge_media_to_caption: { edges: [{ node: { text: "Bastidores" } }] },
        ...extra,
      },
    },
  });
  return `<html><body><script>{"contextJSON":${JSON.stringify(context)}}</script>
<img class="EmbeddedMediaImage" src="${IMAGE_URL}" /></body></html>`;
}

function mp4Response(): Response {
  const mp4 = fs.readFileSync(path.join(FIXTURES, "tiny.mp4"));
  return new Response(new Uint8Array(mp4), {
    status: 200,
    headers: { "content-type": "video/mp4", "content-length": String(mp4.byteLength) },
  });
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
      kind: "photo",
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

  it("reel: baixa o vídeo em stream, a capa como foto, e põe os dois no palco", async () => {
    const calls = fakeFetch({
      [EMBED_URL]: html(reelHtml({ video_url: VIDEO_URL })),
      [VIDEO_URL]: mp4Response,
      [IMAGE_URL]: pngResponse,
    });

    // O link de reel vira o mesmo embed de post.
    const result = await actions.importInstagramPost("https://www.instagram.com/reel/C8Zxn3JJhcG/");

    expect(result).toMatchObject({
      ok: true,
      kind: "video",
      caption: "Bastidores",
      username: "nasainternships",
      width: 1080,
      height: 1920,
      sourceUrl: "https://www.instagram.com/reel/C8Zxn3JJhcG/",
    });
    expect(result.videoUrl).toBe(`/api/videos/${result.photoId}.mp4`);
    expect(result.url).toMatch(/^\/api\/uploads\//);
    expect(fs.existsSync(path.join(tmpDir, `${result.photoId}.mp4`))).toBe(true);

    const entry = staged.peekStagedImport(result.photoId!, ANA.id);
    expect(entry).toMatchObject({ videoExt: "mp4", width: 1080, height: 1920 });
    expect(entry?.posterId).toBeTruthy();
    expect(fs.existsSync(storage.imagePath(entry!.posterId!, "full"))).toBe(true);
    expect(calls.map((c) => c.url)).toEqual([EMBED_URL, VIDEO_URL, IMAGE_URL]);
  });

  it("reel sem capa entra mesmo assim; vídeo grande demais não", async () => {
    fakeFetch({
      [EMBED_URL]: html(reelHtml({ video_url: VIDEO_URL, display_url: undefined })),
      [VIDEO_URL]: mp4Response,
    });
    const semCapa = await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/");
    expect(semCapa).toMatchObject({ ok: true, kind: "video" });
    expect(semCapa.url).toBeUndefined();

    fakeFetch({
      [EMBED_URL]: html(reelHtml({ video_url: VIDEO_URL })),
      [VIDEO_URL]: () =>
        new Response(new Uint8Array(16), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": String(100 * 1024 * 1024) },
        }),
    });
    expect(await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "O vídeo desse post é grande demais (máximo 60 MB).",
    });
  });

  it("vídeo cujo embed não trouxe a URL é recusado", async () => {
    fakeFetch({ [EMBED_URL]: html(reelHtml()) });
    expect(await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "O Instagram não entregou o vídeo desse post. Manda ele na mão.",
    });
    expect(staged.countStagedImports()).toBe(0);
  });

  it("vídeo fora da CDN do Instagram não é baixado", async () => {
    const calls = fakeFetch({
      [EMBED_URL]: html(reelHtml({ video_url: "https://169.254.169.254/v.mp4" })),
    });
    expect(await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "Não consegui baixar o vídeo. Manda ele na mão.",
    });
    expect(calls.map((c) => c.url)).toEqual([EMBED_URL]);
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
  it("descartar um vídeo importado apaga o vídeo e a capa", async () => {
    fakeFetch({
      [EMBED_URL]: html(reelHtml({ video_url: VIDEO_URL })),
      [VIDEO_URL]: mp4Response,
      [IMAGE_URL]: pngResponse,
    });
    const result = await actions.importInstagramPost("https://www.instagram.com/p/C8Zxn3JJhcG/");
    const posterId = staged.peekStagedImport(result.photoId!, ANA.id)!.posterId!;

    expect(await actions.discardInstagramImport(result.photoId!)).toEqual({ ok: true });
    expect(fs.existsSync(path.join(tmpDir, `${result.photoId}.mp4`))).toBe(false);
    expect(fs.existsSync(storage.imagePath(posterId, "full"))).toBe(false);
  });

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
