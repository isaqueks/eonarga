import { describe, expect, it } from "vitest";

import {
  clampCaption,
  decodeHtmlEntities,
  embedUrlFor,
  extractInstagramLink,
  isInstagramMediaUrl,
  parseInstagramEmbed,
} from "./instagram";

/** Embed de foto única, como o Instagram devolve pra robô (sem contextJSON). */
const SINGLE = `
<html><body>
<a class="EmbedSidecarEntrypoint" href="#"></a>
<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;nasa"
  src="https://instagram.fnvt11-1.fna.fbcdn.net/v/t51.82787-15/6259_n.jpg?stp=dst-jpg_e35&amp;_nc_cat=105" />
<div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/nasa/" target="_blank">nasa</a><br /><br />Crew aboard the <a href="/ISS/">&#064;ISS</a> captured this photo of Galveston, Texas.<br />&#xa0;<br />Read more &amp; enjoy &lt;3<div class="CaptionComments">View all 12 comments</div></div>
</body></html>`;

const CDN = "https://scontent.cdninstagram.com";

/** O contextJSON vem como string JSON escapada dentro do JSON da página. */
function withContext(media: Record<string, unknown>, extraHtml = ""): string {
  const context = JSON.stringify({ gql_data: { shortcode_media: media } });
  const escaped = JSON.stringify(context); // já vem com as aspas de fora
  return `<html><body><script>{"contextJSON":${escaped}}</script>
<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;fulano" src="${CDN}/poster.jpg" />
<div class="Caption"><a class="CaptionUsername">fulano</a><br /><br />legenda do html<div class="CaptionComments"></div></div>
${extraHtml}</body></html>`;
}

describe("extractInstagramLink", () => {
  it("reconhece post, reel e tv, com e sem www, com querystring e com perfil no caminho", () => {
    expect(extractInstagramLink("https://www.instagram.com/p/C8Zxn3JJhcG/?igsh=abc")).toEqual({
      shortcode: "C8Zxn3JJhcG",
      kind: "post",
      url: "https://www.instagram.com/p/C8Zxn3JJhcG/",
    });
    expect(extractInstagramLink("http://instagram.com/reel/DX7PnqbFL50")?.kind).toBe("reel");
    expect(extractInstagramLink("https://www.instagram.com/reels/DX7PnqbFL50/")?.url).toBe(
      "https://www.instagram.com/reel/DX7PnqbFL50/",
    );
    expect(extractInstagramLink("https://www.instagram.com/tv/CxYz_-123/")?.kind).toBe("tv");
    expect(extractInstagramLink("https://www.instagram.com/nasa/p/C8Zxn3JJhcG/")?.shortcode).toBe(
      "C8Zxn3JJhcG",
    );
  });

  it("acha o link no meio do texto que o compartilhar manda", () => {
    const shared = "Olha isso 🤯 https://www.instagram.com/p/DXeU26BgbgV/?igsh=MTIz e depois texto";
    expect(extractInstagramLink(shared)?.shortcode).toBe("DXeU26BgbgV");
  });

  it("recusa o que não é post do Instagram", () => {
    expect(extractInstagramLink("https://www.instagram.com/nasa/")).toBeNull();
    expect(extractInstagramLink("https://instagram.evil.com/p/C8Zxn3JJhcG/")).toBeNull();
    expect(extractInstagramLink("https://www.google.com/maps/place/x")).toBeNull();
    expect(extractInstagramLink("")).toBeNull();
  });

  it("monta a URL do embed com legenda", () => {
    expect(embedUrlFor("C8Zxn3JJhcG")).toBe(
      "https://www.instagram.com/p/C8Zxn3JJhcG/embed/captioned/",
    );
  });
});

describe("isInstagramMediaUrl", () => {
  it("aceita só https na CDN do Instagram/Facebook", () => {
    expect(isInstagramMediaUrl("https://instagram.fnvt11-1.fna.fbcdn.net/v/t51/x.jpg")).toBe(true);
    expect(isInstagramMediaUrl(`${CDN}/v/x.jpg`)).toBe(true);
    expect(
      isInstagramMediaUrl("https://instagram.fnvt11-1.fna.fbcdn.net/o1/v/t2/f2/m86/x.mp4"),
    ).toBe(true);
    expect(isInstagramMediaUrl("http://scontent.cdninstagram.com/v/x.jpg")).toBe(false);
    expect(isInstagramMediaUrl("https://fbcdn.net.evil.com/x.jpg")).toBe(false);
    expect(isInstagramMediaUrl("https://127.0.0.1/x.jpg")).toBe(false);
    expect(isInstagramMediaUrl("nem url")).toBe(false);
  });
});

describe("decodeHtmlEntities", () => {
  it("desfaz nomeadas, decimais e hexadecimais", () => {
    expect(decodeHtmlEntities("&#064;nasa &amp; cia &lt;3 &#x1F92F; &quot;ok&quot;")).toBe(
      '@nasa & cia <3 🤯 "ok"',
    );
    expect(decodeHtmlEntities("&desconhecida; fica")).toBe("&desconhecida; fica");
  });
});

describe("parseInstagramEmbed", () => {
  it("foto única: imagem, legenda sem o nome do perfil e o perfil à parte", () => {
    expect(parseInstagramEmbed(SINGLE)).toEqual({
      ok: true,
      media: {
        kind: "photo",
        imageUrl:
          "https://instagram.fnvt11-1.fna.fbcdn.net/v/t51.82787-15/6259_n.jpg?stp=dst-jpg_e35&_nc_cat=105",
      },
      caption:
        "Crew aboard the @ISS captured this photo of Galveston, Texas.\n\nRead more & enjoy <3",
      username: "nasa",
      slides: 1,
    });
  });

  it("carrossel: leva o primeiro slide (foto) e a legenda do JSON", () => {
    const html = withContext({
      __typename: "GraphSidecar",
      is_video: false,
      display_url: `${CDN}/capa.jpg`,
      owner: { username: "meganoticiascl" },
      edge_media_to_caption: { edges: [{ node: { text: "¡Totalmente imponente! 🤯" } }] },
      edge_sidecar_to_children: {
        edges: [
          { node: { is_video: false, display_url: `${CDN}/s1.jpg` } },
          { node: { is_video: true, display_url: `${CDN}/v2.jpg`, video_url: `${CDN}/v2.mp4` } },
        ],
      },
    });

    expect(parseInstagramEmbed(html)).toEqual({
      ok: true,
      media: { kind: "photo", imageUrl: `${CDN}/s1.jpg` },
      caption: "¡Totalmente imponente! 🤯",
      username: "meganoticiascl",
      slides: 2,
    });
  });

  it("carrossel com vídeo no primeiro slide leva o vídeo, com capa e dimensões", () => {
    const html = withContext({
      __typename: "GraphSidecar",
      edge_sidecar_to_children: {
        edges: [
          {
            node: {
              is_video: true,
              display_url: `${CDN}/v1.jpg`,
              video_url: `${CDN}/v1.mp4`,
              dimensions: { width: 640, height: 800 },
            },
          },
          { node: { is_video: false, display_url: `${CDN}/s2.jpg` } },
        ],
      },
    });

    expect(parseInstagramEmbed(html)).toMatchObject({
      ok: true,
      media: {
        kind: "video",
        videoUrl: `${CDN}/v1.mp4`,
        posterUrl: `${CDN}/v1.jpg`,
        width: 640,
        height: 800,
        durationSec: null,
      },
      slides: 2,
    });
  });

  it("reel: vídeo com URL, capa, dimensões e duração do JSON", () => {
    const html = withContext({
      __typename: "GraphVideo",
      is_video: true,
      display_url: `${CDN}/capa.jpg`,
      video_url: `${CDN}/reel.mp4`,
      dimensions: { width: 1080, height: 1920 },
      video_duration: 166.81,
      owner: { username: "nasainternships" },
    });

    expect(parseInstagramEmbed(html)).toMatchObject({
      ok: true,
      media: {
        kind: "video",
        videoUrl: `${CDN}/reel.mp4`,
        posterUrl: `${CDN}/capa.jpg`,
        width: 1080,
        height: 1920,
        durationSec: 166.81,
      },
      username: "nasainternships",
      slides: 1,
    });
  });

  it("vídeo sem URL no JSON é recusado como `video`", () => {
    const html = withContext({
      __typename: "GraphVideo",
      is_video: true,
      display_url: `${CDN}/capa.jpg`,
    });
    expect(parseInstagramEmbed(html)).toEqual({ ok: false, reason: "video" });
  });

  it("sem JSON e com botão de play é vídeo sem URL", () => {
    const html = SINGLE.replace(
      '<div class="Caption">',
      '<div class="EmbedPlayButton"></div><div class="Caption">',
    );
    expect(parseInstagramEmbed(html)).toEqual({ ok: false, reason: "video" });
  });

  it("página sem mídia (post privado, apagado ou HTML novo) é not-found", () => {
    expect(parseInstagramEmbed("<html><body>Instagram</body></html>")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(parseInstagramEmbed(SINGLE.replace(/<img[^>]*>/, ""))).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("post sem legenda devolve null, e o perfil vem do alt da imagem se não houver link", () => {
    const html = `<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;zeca" src="${CDN}/x.jpg" />`;
    expect(parseInstagramEmbed(html)).toEqual({
      ok: true,
      media: { kind: "photo", imageUrl: `${CDN}/x.jpg` },
      caption: null,
      username: "zeca",
      slides: 1,
    });
  });
});

describe("clampCaption", () => {
  it("deixa passar o que cabe e corta com reticências o que não cabe", () => {
    expect(clampCaption("  curta  ", 20)).toBe("curta");
    const longa = `${"palavra ".repeat(30)}fim`;
    const cut = clampCaption(longa, 50);
    expect(cut.length).toBeLessThanOrEqual(50);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/ …$/);
  });
});
