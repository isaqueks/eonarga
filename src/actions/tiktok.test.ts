import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type TikTokActions = typeof import("./tiktok");
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

let actions: TikTokActions;
let staged: StagedModule;
let storage: StorageModule;
let clearAllRateLimits: RateLimitModule["clearAllRateLimits"];
let tmpDir: string;

const PAGE_URL = "https://www.tiktok.com/@tiktok/video/6724421900094737670";
const SHORT_URL = "https://vm.tiktok.com/ZMhabcdef";
const VIDEO_URL = "https://v16-webapp-prime.tiktok.com/video/tos/alisg/abc/?a=1988&bt=108";
const COVER_URL = "https://p16-common-sign.tiktokcdn.com/obj/capa.jpeg";
const PHOTO_URL = "https://p16-sign.tiktokcdn.com/obj/um.jpeg";
const FIXTURES = path.resolve("e2e/fixtures");

function pageHtml(item: Record<string, unknown>, statusCode = 0): string {
  const json = JSON.stringify({
    __DEFAULT_SCOPE__: {
      "webapp.video-detail": { statusCode, itemInfo: { itemStruct: item } },
    },
  });
  return `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${json}</script></body></html>`;
}

const VIDEO_ITEM = {
  desc: "It’s the small moments #makeyourday 😊",
  author: { uniqueId: "tiktok" },
  video: { width: 576, height: 1024, duration: 15, cover: COVER_URL, playAddr: VIDEO_URL },
};

function pageResponse(item: Record<string, unknown>, statusCode = 0): Response {
  const headers = new Headers({ "content-type": "text/html" });
  headers.append("set-cookie", "ttwid=1%7Cabc; Path=/; Domain=.tiktok.com; HttpOnly");
  headers.append("set-cookie", "tt_chain_token=xyz; Path=/; Secure");
  return new Response(pageHtml(item, statusCode), { status: 200, headers });
}

function mp4Response(): Response {
  const mp4 = fs.readFileSync(path.join(FIXTURES, "tiny.mp4"));
  return new Response(new Uint8Array(mp4), {
    status: 200,
    headers: { "content-type": "video/mp4", "content-length": String(mp4.byteLength) },
  });
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

function redirect(to: string): () => Response {
  return () => new Response(null, { status: 302, headers: { location: to } });
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

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-tt-"));
  process.env.UPLOAD_DIR = tmpDir;
  storage = await import("@/lib/storage");
  staged = await import("@/lib/staged-imports");
  ({ clearAllRateLimits } = await import("@/lib/rate-limit"));
  actions = await import("./tiktok");
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

describe("importTikTokPost", () => {
  it("baixa o vídeo com os cookies da página e o Referer, mais a capa, e põe no palco", async () => {
    const calls = fakeFetch({
      [PAGE_URL]: () => pageResponse(VIDEO_ITEM),
      [VIDEO_URL]: mp4Response,
      [COVER_URL]: pngResponse,
    });

    const result = await actions.importTikTokPost(`olha ${PAGE_URL}?_r=1&t=abc`);

    expect(result).toMatchObject({
      ok: true,
      kind: "video",
      caption: "It’s the small moments #makeyourday 😊",
      username: "tiktok",
      sourceUrl: PAGE_URL,
      slides: 1,
      width: 576,
      height: 1024,
    });
    expect(result.videoUrl).toBe(`/api/videos/${result.photoId}.mp4`);
    expect(result.url).toMatch(/^\/api\/uploads\//);
    expect(fs.existsSync(path.join(tmpDir, `${result.photoId}.mp4`))).toBe(true);
    expect(staged.peekStagedImport(result.photoId!, ANA.id)).toMatchObject({
      videoExt: "mp4",
      sourceAuthor: "tiktok",
      sourceUrl: PAGE_URL,
    });

    // Página, vídeo e capa, nessa ordem, com o nosso user-agent.
    expect(calls.map((c) => c.url)).toEqual([PAGE_URL, VIDEO_URL, COVER_URL]);
    expect(calls[0].headers["user-agent"]).toMatch(/^EONargaBot\//);
    // O vídeo só sai com os cookies que a página mandou e com Referer do TikTok.
    expect(calls[1].headers.cookie).toBe("ttwid=1%7Cabc; tt_chain_token=xyz");
    expect(calls[1].headers.referer).toBe("https://www.tiktok.com/");
  });

  it("link curto: segue o redirect do TikTok até o vídeo", async () => {
    const calls = fakeFetch({
      [SHORT_URL]: redirect(`${PAGE_URL}?_r=1&u_code=abc`),
      [PAGE_URL]: () => pageResponse(VIDEO_ITEM),
      [VIDEO_URL]: mp4Response,
      [COVER_URL]: pngResponse,
    });

    const result = await actions.importTikTokPost(`Check this out ${SHORT_URL}/`);
    expect(result).toMatchObject({ ok: true, kind: "video", sourceUrl: PAGE_URL });
    // O destino do redirect não é aberto: já dá pra saber o vídeo, e a canônica é buscada.
    expect(calls.map((c) => c.url)).toEqual([SHORT_URL, PAGE_URL, VIDEO_URL, COVER_URL]);
  });

  it("redirect pra fora do TikTok não é seguido", async () => {
    const calls = fakeFetch({ [SHORT_URL]: redirect("https://evil.com/x") });
    expect(await actions.importTikTokPost(SHORT_URL)).toEqual({
      ok: false,
      error: "O TikTok não respondeu. Tenta de novo ou manda o vídeo na mão.",
    });
    expect(calls.map((c) => c.url)).toEqual([SHORT_URL]);
  });

  it("carrossel de fotos: baixa a primeira, reprocessada", async () => {
    fakeFetch({
      [PAGE_URL]: () =>
        pageResponse({
          desc: "três fotos",
          author: { uniqueId: "ana" },
          video: {},
          imagePost: {
            images: [
              { imageWidth: 1080, imageHeight: 1440, imageURL: { urlList: [PHOTO_URL] } },
              { imageURL: { urlList: ["https://p16-sign.tiktokcdn.com/obj/dois.jpeg"] } },
            ],
          },
        }),
      [PHOTO_URL]: pngResponse,
    });

    const result = await actions.importTikTokPost(PAGE_URL);
    expect(result).toMatchObject({
      ok: true,
      kind: "photo",
      caption: "três fotos",
      username: "ana",
      slides: 2,
      width: 120,
      height: 80,
    });
    expect(fs.existsSync(storage.imagePath(result.photoId!, "full"))).toBe(true);
    expect(staged.peekStagedImport(result.photoId!, ANA.id)).toMatchObject({ videoExt: null });
  });

  it("vídeo fora da CDN do TikTok não é baixado", async () => {
    const calls = fakeFetch({
      [PAGE_URL]: () =>
        pageResponse({
          ...VIDEO_ITEM,
          video: { ...VIDEO_ITEM.video, playAddr: "https://evil.com/video.mp4" },
        }),
    });
    expect(await actions.importTikTokPost(PAGE_URL)).toEqual({
      ok: false,
      error: "Não consegui baixar o vídeo. Manda ele na mão.",
    });
    expect(calls.map((c) => c.url)).toEqual([PAGE_URL]);
  });

  it("privado/apagado, sem vídeo e TikTok fora do ar têm cada um sua mensagem", async () => {
    fakeFetch({ [PAGE_URL]: () => pageResponse({}, 10204) });
    expect(await actions.importTikTokPost(PAGE_URL)).toEqual({
      ok: false,
      error: "Não achei esse vídeo. Ele é público?",
    });

    fakeFetch({ [PAGE_URL]: () => pageResponse({ ...VIDEO_ITEM, video: { width: 1 } }) });
    expect(await actions.importTikTokPost(PAGE_URL)).toEqual({
      ok: false,
      error: "O TikTok não entregou esse vídeo. Manda ele na mão.",
    });

    fakeFetch({});
    expect(await actions.importTikTokPost(PAGE_URL)).toEqual({
      ok: false,
      error: "O TikTok não respondeu. Tenta de novo ou manda o vídeo na mão.",
    });
  });

  it("recusa o que não é link do TikTok, segura o rate limit e exige sessão", async () => {
    fakeFetch({});
    expect(await actions.importTikTokPost("https://www.instagram.com/p/C8Zxn3JJhcG/")).toEqual({
      ok: false,
      error: "Isso não parece um link de vídeo do TikTok.",
    });

    for (let i = 0; i < 10; i++) await actions.importTikTokPost(PAGE_URL);
    expect(await actions.importTikTokPost(PAGE_URL)).toEqual({
      ok: false,
      error: "Calma, importador. Espera uns minutos.",
    });

    state.user = null;
    await expect(actions.importTikTokPost(PAGE_URL)).rejects.toThrow();
  });
});
