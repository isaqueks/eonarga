import { describe, expect, it } from "vitest";

import { detectImportLink, sourceProvider } from "./import-links";

describe("detectImportLink", () => {
  it("acha o Instagram e o TikTok, canônico ou curto", () => {
    expect(detectImportLink("vê https://www.instagram.com/p/C8Zxn3JJhcG/?igsh=1")).toEqual({
      provider: "instagram",
      url: "https://www.instagram.com/p/C8Zxn3JJhcG/",
    });
    expect(
      detectImportLink("https://www.tiktok.com/@tiktok/video/6724421900094737670?x=1"),
    ).toEqual({
      provider: "tiktok",
      url: "https://www.tiktok.com/@tiktok/video/6724421900094737670",
    });
    expect(detectImportLink("Check this out https://vm.tiktok.com/ZMhabcdef/")).toEqual({
      provider: "tiktok",
      url: "https://vm.tiktok.com/ZMhabcdef",
    });
  });

  it("com os dois no texto, o primeiro ganha", () => {
    const ig = "https://www.instagram.com/reel/C8Zxn3JJhcG/";
    const tt = "https://vm.tiktok.com/ZMhabcdef";
    expect(detectImportLink(`${tt} e ${ig}`)?.provider).toBe("tiktok");
    expect(detectImportLink(`${ig} e ${tt}`)?.provider).toBe("instagram");
  });

  it("texto sem link importável é null", () => {
    expect(detectImportLink("Olha isso aí")).toBeNull();
    expect(detectImportLink("https://www.youtube.com/watch?v=abc")).toBeNull();
  });
});

describe("sourceProvider", () => {
  it("nomeia a origem pelo host", () => {
    expect(sourceProvider("https://www.instagram.com/p/x/")).toEqual({
      emoji: "📸",
      name: "Instagram",
    });
    expect(sourceProvider("https://www.tiktok.com/@a/video/1")).toEqual({
      emoji: "🎵",
      name: "TikTok",
    });
    expect(sourceProvider("https://vm.tiktok.com/x")).toEqual({ emoji: "🎵", name: "TikTok" });
    expect(sourceProvider("https://example.com/x")).toEqual({ emoji: "🔗", name: "example.com" });
    expect(sourceProvider("nada")).toEqual({ emoji: "🔗", name: "outro lugar" });
  });
});
