import { describe, expect, it } from "vitest";

import {
  clampCaption,
  decodeHtmlEntities,
  embedUrlFor,
  extractInstagramLink,
  isInstagramImageUrl,
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

/** O contextJSON vem como string JSON escapada dentro do JSON da página. */
function withContext(media: Record<string, unknown>, extraHtml = ""): string {
  const context = JSON.stringify({ gql_data: { shortcode_media: media } });
  const escaped = JSON.stringify(context); // já vem com as aspas de fora
  return `<html><body><script>{"contextJSON":${escaped}}</script>
<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;fulano" src="https://scontent.cdninstagram.com/poster.jpg" />
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

describe("isInstagramImageUrl", () => {
  it("aceita só https na CDN do Instagram/Facebook", () => {
    expect(isInstagramImageUrl("https://instagram.fnvt11-1.fna.fbcdn.net/v/t51/x.jpg")).toBe(true);
    expect(isInstagramImageUrl("https://scontent.cdninstagram.com/v/x.jpg")).toBe(true);
    expect(isInstagramImageUrl("http://scontent.cdninstagram.com/v/x.jpg")).toBe(false);
    expect(isInstagramImageUrl("https://fbcdn.net.evil.com/x.jpg")).toBe(false);
    expect(isInstagramImageUrl("https://127.0.0.1/x.jpg")).toBe(false);
    expect(isInstagramImageUrl("nem url")).toBe(false);
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
    const parsed = parseInstagramEmbed(SINGLE);
    expect(parsed).toEqual({
      ok: true,
      imageUrl:
        "https://instagram.fnvt11-1.fna.fbcdn.net/v/t51.82787-15/6259_n.jpg?stp=dst-jpg_e35&_nc_cat=105",
      caption:
        "Crew aboard the @ISS captured this photo of Galveston, Texas.\n\nRead more & enjoy <3",
      username: "nasa",
      slides: 1,
    });
  });

  it("carrossel: pega o primeiro slide que não é vídeo e a legenda do JSON", () => {
    const html = withContext({
      __typename: "GraphSidecar",
      is_video: false,
      display_url: "https://scontent.cdninstagram.com/capa.jpg",
      owner: { username: "meganoticiascl" },
      edge_media_to_caption: { edges: [{ node: { text: "¡Totalmente imponente! 🤯" } }] },
      edge_sidecar_to_children: {
        edges: [
          { node: { is_video: true, display_url: "https://scontent.cdninstagram.com/v1.jpg" } },
          { node: { is_video: false, display_url: "https://scontent.cdninstagram.com/s2.jpg" } },
          { node: { is_video: false, display_url: "https://scontent.cdninstagram.com/s3.jpg" } },
        ],
      },
    });

    expect(parseInstagramEmbed(html)).toEqual({
      ok: true,
      imageUrl: "https://scontent.cdninstagram.com/s2.jpg",
      caption: "¡Totalmente imponente! 🤯",
      username: "meganoticiascl",
      slides: 3,
    });
  });

  it("carrossel só de vídeo é recusado", () => {
    const html = withContext({
      __typename: "GraphSidecar",
      edge_sidecar_to_children: {
        edges: [
          { node: { is_video: true, display_url: "https://scontent.cdninstagram.com/v.jpg" } },
        ],
      },
    });
    expect(parseInstagramEmbed(html)).toEqual({ ok: false, reason: "video" });
  });

  it("reel/vídeo é recusado mesmo tendo imagem de capa no HTML", () => {
    const html = withContext({
      __typename: "GraphVideo",
      is_video: true,
      display_url: "https://scontent.cdninstagram.com/capa.jpg",
    });
    expect(parseInstagramEmbed(html)).toEqual({ ok: false, reason: "video" });
  });

  it("sem JSON e com botão de play também é vídeo", () => {
    const html = SINGLE.replace(
      '<div class="Caption">',
      '<div class="EmbedPlayButton"></div><div class="Caption">',
    );
    expect(parseInstagramEmbed(html)).toEqual({ ok: false, reason: "video" });
  });

  it("página sem imagem (post privado, apagado ou HTML novo) é not-found", () => {
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
    const html = `<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;zeca" src="https://scontent.cdninstagram.com/x.jpg" />`;
    expect(parseInstagramEmbed(html)).toEqual({
      ok: true,
      imageUrl: "https://scontent.cdninstagram.com/x.jpg",
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
