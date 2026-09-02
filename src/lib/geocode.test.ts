import { describe, expect, it, vi } from "vitest";

import {
  parseNominatimReverse,
  parsePhotonResponse,
  reverseGeocode,
  searchPlaces,
} from "./geocode";

/** Recorte de uma resposta real do Photon (GeoJSON, coordenadas em [lon, lat]). */
const PHOTON_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-48.5492, -27.5977] },
      properties: {
        osm_id: 26_995_411,
        osm_type: "W",
        osm_key: "amenity",
        osm_value: "marketplace",
        name: "Mercado Público de Florianópolis",
        street: "Rua Conselheiro Mafra",
        housenumber: "255",
        district: "Centro",
        city: "Florianópolis",
        state: "Santa Catarina",
        postcode: "88010-102",
        country: "Brasil",
        countrycode: "BR",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-48.5482, -27.5949] },
      properties: {
        osm_id: 1,
        osm_type: "W",
        osm_key: "place",
        osm_value: "house",
        street: "Rua Felipe Schmidt",
        housenumber: "40",
        suburb: "Centro",
        city: "Florianópolis",
        state: "Santa Catarina",
        countrycode: "BR",
      },
    },
    {
      // Fora da caixa de Floripa: some do resultado.
      type: "Feature",
      geometry: { type: "Point", coordinates: [-46.6333, -23.5505] },
      properties: { name: "Mercado Municipal de São Paulo", city: "São Paulo", state: "SP" },
    },
    {
      // Geometria quebrada: ignorada em vez de explodir.
      type: "Feature",
      geometry: { type: "Point" },
      properties: { name: "Sem coordenada" },
    },
  ],
};

/** Recorte de uma resposta real do Nominatim `reverse?format=jsonv2`. */
const NOMINATIM_FIXTURE = {
  place_id: 297_154_212,
  licence: "Data © OpenStreetMap contributors",
  osm_type: "way",
  osm_id: 25_996_133,
  lat: "-27.5975",
  lon: "-48.5500",
  category: "building",
  type: "yes",
  place_rank: 30,
  addresstype: "building",
  name: "",
  display_name:
    "123, Rua Felipe Schmidt, Centro, Florianópolis, Microrregião de Florianópolis, Santa Catarina, Região Sul, 88010-000, Brasil",
  address: {
    house_number: "123",
    road: "Rua Felipe Schmidt",
    suburb: "Centro",
    city: "Florianópolis",
    municipality: "Microrregião de Florianópolis",
    state: "Santa Catarina",
    postcode: "88010-000",
    country: "Brasil",
    country_code: "br",
  },
  boundingbox: ["-27.5976", "-27.5974", "-48.5501", "-48.5499"],
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("parsePhotonResponse", () => {
  it("monta nome, endereço curto e label, e joga fora o que está fora de Floripa", () => {
    const results = parsePhotonResponse(PHOTON_FIXTURE);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      label: "Mercado Público de Florianópolis — Rua Conselheiro Mafra, 255 - Centro",
      name: "Mercado Público de Florianópolis",
      address: "Rua Conselheiro Mafra, 255 - Centro",
      lat: -27.5977,
      lng: -48.5492,
    });
    // Endereço sem `name`: a rua vira o nome.
    expect(results[1].name).toBe("Rua Felipe Schmidt, 40");
    expect(results[1].address).toBe("Rua Felipe Schmidt, 40 - Centro");
    expect(results.map((r) => r.name)).not.toContain("Mercado Municipal de São Paulo");
  });

  it("não sai da cidade quando é Floripa, mas mostra quando não é", () => {
    const [emFloripa] = parsePhotonResponse(PHOTON_FIXTURE);
    expect(emFloripa.address).not.toMatch(/Florian/);

    const [fora] = parsePhotonResponse({
      features: [
        {
          geometry: { coordinates: [-48.55, -27.65] },
          properties: {
            name: "Padaria da Ponte",
            street: "Rua das Flores",
            housenumber: "10",
            district: "Centro",
            city: "São José",
          },
        },
      ],
    });
    expect(fora.address).toBe("Rua das Flores, 10 - Centro, São José");
  });

  it("aguenta payload torto", () => {
    expect(parsePhotonResponse(null)).toEqual([]);
    expect(parsePhotonResponse({})).toEqual([]);
    expect(parsePhotonResponse({ features: "nope" })).toEqual([]);
  });
});

describe("parseNominatimReverse", () => {
  it("monta 'Rua, número - Bairro'", () => {
    expect(parseNominatimReverse(NOMINATIM_FIXTURE)).toEqual({
      address: "Rua Felipe Schmidt, 123 - Centro",
    });
  });

  it("usa neighbourhood/city_district quando não tem suburb e inclui outra cidade", () => {
    expect(
      parseNominatimReverse({
        address: {
          road: "Rua Bla",
          house_number: "10",
          city_district: "Kobrasol",
          town: "São José",
        },
      }),
    ).toEqual({ address: "Rua Bla, 10 - Kobrasol, São José" });
  });

  it("devolve null pra erro do serviço ou endereço vazio", () => {
    expect(parseNominatimReverse({ error: "Unable to geocode" })).toBeNull();
    expect(parseNominatimReverse(null)).toBeNull();
    expect(parseNominatimReverse({ address: {} })).toBeNull();
  });
});

describe("searchPlaces", () => {
  it("nem chama o Photon com menos de 3 caracteres", async () => {
    const fetchImpl = vi.fn();
    expect(await searchPlaces("me", { fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual(
      [],
    );
    expect(await searchPlaces("  ", { fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual(
      [],
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("chama o Photon com viés no centro do mapa e respeita o limite", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse(PHOTON_FIXTURE);
    });

    const results = await searchPlaces("mercado publico", {
      limit: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(results).toHaveLength(1);
    const url = new URL(urls[0]);
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api/");
    expect(url.searchParams.get("q")).toBe("mercado publico");
    expect(url.searchParams.get("lang")).toBe("default");
    expect(Number(url.searchParams.get("lat"))).toBeCloseTo(-27.5975, 3);
    expect(Number(url.searchParams.get("lon"))).toBeCloseTo(-48.55, 3);
  });

  it("guarda a resposta em cache por query", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(PHOTON_FIXTURE));
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };

    const first = await searchPlaces("sebo do cache", opts);
    const second = await searchPlaces("SEBO DO CACHE", opts);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("devolve [] quando o Photon falha", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 503 }));
    expect(
      await searchPlaces("photon fora do ar", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toEqual([]);
  });
});

describe("reverseGeocode", () => {
  it("chama o Nominatim com jsonv2 e pt-BR, e cacheia por coordenada arredondada", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse(NOMINATIM_FIXTURE);
    });
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };

    const first = await reverseGeocode(-27.597512, -48.550034, opts);
    // Mesma coordenada com ruído além da 5ª casa: sai do cache, sem nova requisição.
    const second = await reverseGeocode(-27.5975119, -48.5500339, opts);

    expect(first).toEqual({ address: "Rua Felipe Schmidt, 123 - Centro" });
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const url = new URL(urls[0]);
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/reverse");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("zoom")).toBe("18");
    expect(url.searchParams.get("accept-language")).toBe("pt-BR");
  });

  it("recusa coordenada inválida sem tocar na rede", async () => {
    const fetchImpl = vi.fn();
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };
    expect(await reverseGeocode(Number.NaN, 0, opts)).toBeNull();
    expect(await reverseGeocode(-100, 0, opts)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
