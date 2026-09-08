import { describe, expect, it } from "vitest";

import { extractTikTokLink, isTikTokMediaUrl, isTikTokPageUrl, parseTikTokPage } from "./tiktok";

function page(scope: Record<string, unknown>): string {
  const json = JSON.stringify({ __DEFAULT_SCOPE__: scope });
  return `<html><head><title>TikTok</title></head><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${json}</script></body></html>`;
}

const VIDEO_ITEM = {
  id: "6724421900094737670",
  desc: "It’s the small moments on TikTok that #makeyourday 😊",
  author: { uniqueId: "tiktok", nickname: "TikTok" },
  video: {
    width: 576,
    height: 1024,
    duration: 15,
    cover: "https://p16-common-sign.tiktokcdn.com/obj/capa.jpeg",
    originCover: "https://p19-common-sign.tiktokcdn.com/obj/origem.jpeg",
    playAddr: "https://v16-webapp-prime.tiktok.com/video/tos/alisg/abc/?a=1988&bt=108",
    downloadAddr: "https://v16-webapp-prime.tiktok.com/video/tos/alisg/def/?a=1988",
  },
};

describe("extractTikTokLink", () => {
  it("reconhece o link completo de vídeo e de foto, com ou sem www e querystring", () => {
    expect(
      extractTikTokLink("olha https://www.tiktok.com/@tiktok/video/6724421900094737670?_r=1&t=x"),
    ).toEqual({
      kind: "video",
      id: "6724421900094737670",
      username: "tiktok",
      url: "https://www.tiktok.com/@tiktok/video/6724421900094737670",
    });
    expect(extractTikTokLink("https://tiktok.com/@ana.silva_2/photo/7300000000000000001")).toEqual({
      kind: "photo",
      id: "7300000000000000001",
      username: "ana.silva_2",
      url: "https://www.tiktok.com/@ana.silva_2/photo/7300000000000000001",
    });
    expect(
      extractTikTokLink("https://m.tiktok.com/@tiktok/video/6724421900094737670"),
    ).toMatchObject({
      kind: "video",
      id: "6724421900094737670",
    });
  });

  it("links curtos do compartilhar viram `short`, sem a barra do fim", () => {
    expect(extractTikTokLink("Check this out https://vm.tiktok.com/ZMhabcdef/ 🔥")).toEqual({
      kind: "short",
      url: "https://vm.tiktok.com/ZMhabcdef",
    });
    expect(extractTikTokLink("https://vt.tiktok.com/ZSabc123/")).toEqual({
      kind: "short",
      url: "https://vt.tiktok.com/ZSabc123",
    });
    expect(extractTikTokLink("https://www.tiktok.com/t/ZTRabc12/")).toEqual({
      kind: "short",
      url: "https://www.tiktok.com/t/ZTRabc12",
    });
    expect(extractTikTokLink("https://m.tiktok.com/v/6724421900094737670.html")).toEqual({
      kind: "short",
      url: "https://m.tiktok.com/v/6724421900094737670.html",
    });
  });

  it("ignora texto sem link, link de perfil e link do Instagram", () => {
    expect(extractTikTokLink("sem link nenhum")).toBeNull();
    expect(extractTikTokLink("https://www.tiktok.com/@tiktok")).toBeNull();
    expect(extractTikTokLink("https://www.instagram.com/p/C8Zxn3JJhcG/")).toBeNull();
    expect(extractTikTokLink("https://www.tiktok.com/@tiktok/video/abc")).toBeNull();
  });
});

describe("isTikTokPageUrl / isTikTokMediaUrl", () => {
  it("página: só hosts do tiktok.com em https", () => {
    expect(isTikTokPageUrl("https://www.tiktok.com/@a/video/123")).toBe(true);
    expect(isTikTokPageUrl("https://vm.tiktok.com/abc")).toBe(true);
    expect(isTikTokPageUrl("http://www.tiktok.com/@a/video/123")).toBe(false);
    expect(isTikTokPageUrl("https://tiktok.com.evil.com/x")).toBe(false);
    expect(isTikTokPageUrl("https://evil.com/?tiktok.com")).toBe(false);
    expect(isTikTokPageUrl("nada")).toBe(false);
  });

  it("mídia: CDN do TikTok em https, mais nada", () => {
    expect(isTikTokMediaUrl("https://v16-webapp-prime.tiktok.com/video/tos/x")).toBe(true);
    expect(isTikTokMediaUrl("https://p16-common-sign.tiktokcdn.com/obj/x.jpeg")).toBe(true);
    expect(isTikTokMediaUrl("https://p16-sign.tiktokcdn-us.com/obj/x.jpeg")).toBe(true);
    expect(isTikTokMediaUrl("https://v19.tiktokv.com/x")).toBe(true);
    expect(isTikTokMediaUrl("http://v16-webapp-prime.tiktok.com/x")).toBe(false);
    expect(isTikTokMediaUrl("https://127.0.0.1/x")).toBe(false);
    expect(isTikTokMediaUrl("https://tiktokcdn.com.evil.com/x")).toBe(false);
  });
});

describe("parseTikTokPage", () => {
  it("lê vídeo, capa, dimensões, duração, legenda e perfil", () => {
    const html = page({
      "webapp.video-detail": { statusCode: 0, itemInfo: { itemStruct: VIDEO_ITEM } },
    });
    expect(parseTikTokPage(html)).toEqual({
      ok: true,
      media: {
        kind: "video",
        videoUrl: VIDEO_ITEM.video.playAddr,
        posterUrl: VIDEO_ITEM.video.cover,
        width: 576,
        height: 1024,
        durationSec: 15,
      },
      caption: VIDEO_ITEM.desc,
      username: "tiktok",
      slides: 1,
    });
  });

  it("carrossel de fotos: a primeira foto e quantas eram", () => {
    const html = page({
      "webapp.video-detail": {
        statusCode: 0,
        itemInfo: {
          itemStruct: {
            desc: "três fotos",
            author: { uniqueId: "ana" },
            video: {},
            imagePost: {
              images: [
                {
                  imageWidth: 1080,
                  imageHeight: 1440,
                  imageURL: {
                    urlList: [
                      "https://p16-sign.tiktokcdn.com/obj/um.jpeg",
                      "https://p19-sign.tiktokcdn.com/obj/um.jpeg",
                    ],
                  },
                },
                { imageURL: { urlList: ["https://p16-sign.tiktokcdn.com/obj/dois.jpeg"] } },
                { imageURL: { urlList: ["https://p16-sign.tiktokcdn.com/obj/tres.jpeg"] } },
              ],
            },
          },
        },
      },
    });
    expect(parseTikTokPage(html)).toEqual({
      ok: true,
      media: {
        kind: "photo",
        imageUrl: "https://p16-sign.tiktokcdn.com/obj/um.jpeg",
        width: 1080,
        height: 1440,
      },
      caption: "três fotos",
      username: "ana",
      slides: 3,
    });
  });

  it("sem playAddr usa a lista do PlayAddrStruct; sem nada é `video`", () => {
    const item = {
      ...VIDEO_ITEM,
      video: {
        ...VIDEO_ITEM.video,
        playAddr: "",
        PlayAddrStruct: { UrlList: ["https://v19-webapp.tiktok.com/video/x"] },
      },
    };
    const okHtml = page({
      "webapp.video-detail": { statusCode: 0, itemInfo: { itemStruct: item } },
    });
    expect(parseTikTokPage(okHtml)).toMatchObject({
      ok: true,
      media: { kind: "video", videoUrl: "https://v19-webapp.tiktok.com/video/x" },
    });

    const none = page({
      "webapp.video-detail": {
        statusCode: 0,
        itemInfo: { itemStruct: { ...VIDEO_ITEM, video: { width: 1, height: 1 } } },
      },
    });
    expect(parseTikTokPage(none)).toEqual({ ok: false, reason: "video" });
  });

  it("privado, apagado ou HTML que mudou é `not-found`", () => {
    expect(parseTikTokPage("<html><body>nada</body></html>")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(
      parseTikTokPage(
        page({ "webapp.video-detail": { statusCode: 10204, statusMsg: "item doesn't exist" } }),
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(parseTikTokPage(page({ "webapp.app-context": {} }))).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(
      parseTikTokPage(
        '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{nao é json</script>',
      ),
    ).toEqual({ ok: false, reason: "not-found" });
  });
});
