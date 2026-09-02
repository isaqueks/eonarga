import { describe, expect, it, vi } from "vitest";

import {
  ALLOWED_MAPS_HOSTS,
  isAllowedMapsUrl,
  parseGoogleMapsUrl,
  resolveGoogleMapsLink,
} from "./maps-link";

const PLACE_URL =
  "https://www.google.com/maps/place/Mercado+P%C3%BAblico+de+Florian%C3%B3polis/@-27.5977,-48.5518,17z/data=!3m1!4b1!4m6!3m5!1s0x952738ee6b5a2f8b:0x1234!8m2!3d-27.5977!4d-48.5492!16s%2Fg%2F1td";

/** Response de mentira pros testes de rede. */
function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe("isAllowedMapsUrl", () => {
  it("aceita os hosts da allowlist", () => {
    expect(isAllowedMapsUrl(new URL("https://maps.app.goo.gl/aBcD1234"))).toBe(true);
    expect(isAllowedMapsUrl(new URL("https://goo.gl/maps/xyz"))).toBe(true);
    expect(isAllowedMapsUrl(new URL("https://maps.google.com/?q=-27.5,-48.5"))).toBe(true);
    expect(isAllowedMapsUrl(new URL("https://maps.google.com.br/?q=-27.5,-48.5"))).toBe(true);
    expect(isAllowedMapsUrl(new URL(PLACE_URL))).toBe(true);
  });

  it("em google.com e google.com.br exige o path /maps", () => {
    expect(isAllowedMapsUrl(new URL("https://www.google.com/maps"))).toBe(true);
    expect(isAllowedMapsUrl(new URL("https://www.google.com/maps/place/X"))).toBe(true);
    expect(isAllowedMapsUrl(new URL("https://www.google.com/search?q=narga"))).toBe(false);
    expect(isAllowedMapsUrl(new URL("https://google.com/"))).toBe(false);
    expect(isAllowedMapsUrl(new URL("https://www.google.com.br/imghp"))).toBe(false);
    // Nada de /mapsomething.
    expect(isAllowedMapsUrl(new URL("https://www.google.com/mapsomething"))).toBe(false);
  });

  it("recusa host fora da lista, subdomínio parecido e protocolo estranho", () => {
    expect(isAllowedMapsUrl(new URL("https://evil.com/maps/place/X/@-27.5,-48.5"))).toBe(false);
    expect(isAllowedMapsUrl(new URL("https://maps.google.com.evil.com/?q=-27.5,-48.5"))).toBe(
      false,
    );
    expect(isAllowedMapsUrl(new URL("https://notgoo.gl/maps/x"))).toBe(false);
    expect(isAllowedMapsUrl(new URL("file:///etc/passwd"))).toBe(false);
    expect(isAllowedMapsUrl(new URL("http://169.254.169.254/latest/meta-data"))).toBe(false);
  });

  it("a allowlist é a combinada com a UI", () => {
    expect([...ALLOWED_MAPS_HOSTS]).toEqual([
      "maps.app.goo.gl",
      "goo.gl",
      "maps.google.com",
      "www.google.com",
      "google.com",
      "maps.google.com.br",
      "www.google.com.br",
    ]);
  });
});

describe("parseGoogleMapsUrl", () => {
  it("prefere as coordenadas do lugar (!3d!4d) às do enquadramento (@)", () => {
    const parsed = parseGoogleMapsUrl(PLACE_URL);
    expect(parsed).not.toBeNull();
    expect(parsed!.lat).toBeCloseTo(-27.5977, 6);
    // -48.5492 vem do !4d; -48.5518 é só o centro do mapa.
    expect(parsed!.lng).toBeCloseTo(-48.5492, 6);
    expect(parsed!.name).toBe("Mercado Público de Florianópolis");
    expect(parsed!.placeId).toBe("0x952738ee6b5a2f8b:0x1234");
    expect(parsed!.canonicalUrl).toContain("/maps/place/");
  });

  it("lê ?q=lat,lng", () => {
    const parsed = parseGoogleMapsUrl("https://maps.google.com/?q=-27.5975,-48.5500");
    expect(parsed).toMatchObject({ lat: -27.5975, lng: -48.55, name: null, placeId: null });
  });

  it("lê /search/?api=1&query=lat,lng", () => {
    const parsed = parseGoogleMapsUrl(
      "https://www.google.com/maps/search/?api=1&query=-27.5,-48.5",
    );
    expect(parsed).toMatchObject({ lat: -27.5, lng: -48.5 });
  });

  it("lê ?ll= e query_place_id", () => {
    const parsed = parseGoogleMapsUrl(
      "https://maps.google.com/maps?ll=-27.5969,-48.5495&query_place_id=ChIJ0abcDEF",
    );
    expect(parsed).toMatchObject({ lat: -27.5969, lng: -48.5495, placeId: "ChIJ0abcDEF" });
  });

  it("cai no /@lat,lng quando não tem mais nada", () => {
    const parsed = parseGoogleMapsUrl("https://www.google.com/maps/@-27.5949,-48.5482,18z");
    expect(parsed).toMatchObject({ lat: -27.5949, lng: -48.5482, name: null });
  });

  it("aceita ?q=loc:lat,lng", () => {
    expect(parseGoogleMapsUrl("https://maps.google.com/?q=loc:-27.6,-48.51")).toMatchObject({
      lat: -27.6,
      lng: -48.51,
    });
  });

  it("devolve null sem coordenada, com coordenada fora de faixa ou com lixo", () => {
    expect(parseGoogleMapsUrl("https://www.google.com/maps/place/Sebo+do+Joao")).toBeNull();
    expect(parseGoogleMapsUrl("https://maps.google.com/?q=Sebo+do+Joao")).toBeNull();
    expect(parseGoogleMapsUrl("https://maps.google.com/?q=-127.5,-48.5")).toBeNull();
    expect(parseGoogleMapsUrl("não é url")).toBeNull();
    expect(parseGoogleMapsUrl("")).toBeNull();
  });

  it("não confunde o nome com o segmento @ ou data=", () => {
    const parsed = parseGoogleMapsUrl(
      "https://www.google.com/maps/place/@-27.5977,-48.5518,17z/data=!4m2!3m1!1s0x0:0x0",
    );
    expect(parsed!.name).toBeNull();
  });
});

describe("resolveGoogleMapsLink", () => {
  it("não toca na rede quando o link já tem coordenada", async () => {
    const fetchImpl = vi.fn();
    const parsed = await resolveGoogleMapsLink(PLACE_URL, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(parsed!.lat).toBeCloseTo(-27.5977, 6);
  });

  it("recusa host fora da allowlist sem nem tentar buscar", async () => {
    const fetchImpl = vi.fn();
    expect(
      await resolveGoogleMapsLink(
        "https://evil.com/maps/place/X/@-27.5,-48.5",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(
      await resolveGoogleMapsLink(
        "http://127.0.0.1:3000/api/health",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("segue a cadeia de redirects do link curto", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input));
      expect(init?.redirect).toBe("manual");
      expect(init?.credentials).toBe("omit");
      if (calls.length === 1) return redirectTo("https://maps.app.goo.gl/segundo", 301);
      if (calls.length === 2) return redirectTo("https://www.google.com/maps/place/Bar+X/data=x");
      return redirectTo(PLACE_URL);
    }) as unknown as typeof fetch;

    const parsed = await resolveGoogleMapsLink("https://maps.app.goo.gl/aBcD1234", fetchImpl);
    expect(calls).toHaveLength(3);
    expect(parsed!.lat).toBeCloseTo(-27.5977, 6);
    expect(parsed!.name).toBe("Mercado Público de Florianópolis");
  });

  it("para no primeiro redirect que já traz coordenada", async () => {
    const fetchImpl = vi.fn(async () => redirectTo(PLACE_URL));
    const parsed = await resolveGoogleMapsLink(
      "https://maps.app.goo.gl/aBcD1234",
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(parsed!.placeId).toBe("0x952738ee6b5a2f8b:0x1234");
  });

  it("aborta quando o redirect aponta pra fora da allowlist", async () => {
    const fetchImpl = vi.fn(async () => redirectTo("https://evil.com/maps/@-27.5,-48.5"));
    expect(
      await resolveGoogleMapsLink(
        "https://maps.app.goo.gl/aBcD1234",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("desiste depois de 3 saltos", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n += 1;
      return redirectTo(`https://maps.app.goo.gl/salto-${n}`);
    });
    expect(
      await resolveGoogleMapsLink(
        "https://maps.app.goo.gl/aBcD1234",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("cai no HTML quando a URL final não tem coordenada", async () => {
    const page = `<!doctype html><html><head>
      <meta property="og:title" content="Sebo Fantasma - Google Maps">
      <meta property="og:image" content="https://maps.google.com/maps/api/staticmap?center=-27.5941%2C-48.5476&amp;zoom=17">
      <link rel="canonical" href="https://www.google.com/maps/place/Sebo+Fantasma">
      </head><body></body></html>`;
    const fetchImpl = vi.fn(async () => html(page));

    const parsed = await resolveGoogleMapsLink(
      "https://maps.app.goo.gl/semCoord",
      fetchImpl as unknown as typeof fetch,
    );
    expect(parsed).toMatchObject({ lat: -27.5941, lng: -48.5476, name: "Sebo Fantasma" });
    expect(parsed!.canonicalUrl).toBe("https://maps.app.goo.gl/semCoord");
  });

  it("usa o link canônico do HTML quando ele traz as coordenadas", async () => {
    const page = `<html><head><link rel="canonical" href="${PLACE_URL.replace(/&/g, "&amp;")}"></head></html>`;
    const fetchImpl = vi.fn(async () => html(page));
    const parsed = await resolveGoogleMapsLink(
      "https://goo.gl/maps/abc",
      fetchImpl as unknown as typeof fetch,
    );
    expect(parsed!.lng).toBeCloseTo(-48.5492, 6);
  });

  it("devolve null quando o HTML não tem nada e quando o fetch explode", async () => {
    const vazio = vi.fn(async () => html("<html><body>nada aqui</body></html>"));
    expect(
      await resolveGoogleMapsLink("https://goo.gl/maps/abc", vazio as unknown as typeof fetch),
    ).toBeNull();

    const explode = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(
      await resolveGoogleMapsLink("https://goo.gl/maps/abc", explode as unknown as typeof fetch),
    ).toBeNull();
  });

  it("não busca link completo do google.com sem coordenada (nada de fetch à toa)", async () => {
    const fetchImpl = vi.fn();
    expect(
      await resolveGoogleMapsLink(
        "https://www.google.com/maps/place/Sebo+do+Joao",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
