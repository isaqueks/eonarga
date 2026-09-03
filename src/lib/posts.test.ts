import { describe, expect, it } from "vitest";

import {
  COMMENT_PUSH_EXCERPT_MAX,
  commentNotificationBody,
  FEED_PREVIEW_MAX,
  formatLatLng,
  haversineMeters,
  NEARBY_PLACE_METERS,
  nearestPlace,
  POST_BODY_MAX,
  postInputSchema,
  previewText,
} from "./posts";

/** Praça XV, o centro do mapa do app. */
const PRACA_XV = { lat: -27.5975, lng: -48.55 };

describe("haversineMeters", () => {
  it("dá zero pro mesmo ponto", () => {
    expect(haversineMeters(PRACA_XV, { ...PRACA_XV })).toBe(0);
  });

  it("mede um grau de latitude em ~111 km", () => {
    const metros = haversineMeters(PRACA_XV, { lat: PRACA_XV.lat + 1, lng: PRACA_XV.lng });
    expect(metros).toBeGreaterThan(111_000);
    expect(metros).toBeLessThan(111_400);
  });

  it("mede um milésimo de grau em ~111 m", () => {
    const metros = haversineMeters(PRACA_XV, { lat: PRACA_XV.lat - 0.001, lng: PRACA_XV.lng });
    expect(metros).toBeGreaterThan(110);
    expect(metros).toBeLessThan(113);
  });

  it("é simétrica", () => {
    const outro = { lat: -27.6, lng: -48.56 };
    expect(haversineMeters(PRACA_XV, outro)).toBeCloseTo(haversineMeters(outro, PRACA_XV), 6);
  });
});

describe("nearestPlace", () => {
  const perto = { id: "perto", lat: -27.5977, lng: -48.5501 };
  const meioPerto = { id: "meio", lat: -27.5985, lng: -48.55 };
  const longe = { id: "longe", lat: -27.62, lng: -48.51 };

  it("acha o mais perto dentro do raio", () => {
    const found = nearestPlace([longe, meioPerto, perto], PRACA_XV.lat, PRACA_XV.lng);
    expect(found?.place.id).toBe("perto");
    expect(found?.meters).toBeLessThan(NEARBY_PLACE_METERS);
  });

  it("devolve null quando todo mundo está longe demais", () => {
    expect(nearestPlace([longe], PRACA_XV.lat, PRACA_XV.lng)).toBeNull();
    expect(nearestPlace([], PRACA_XV.lat, PRACA_XV.lng)).toBeNull();
  });

  it("respeita um raio menor", () => {
    // "meioPerto" está a ~111 m: entra no padrão de 150 m, mas não num raio de 50 m.
    expect(nearestPlace([meioPerto], PRACA_XV.lat, PRACA_XV.lng)?.place.id).toBe("meio");
    expect(nearestPlace([meioPerto], PRACA_XV.lat, PRACA_XV.lng, 50)).toBeNull();
  });

  it("ignora coordenada quebrada, na lista e na consulta", () => {
    const quebrado = { id: "nan", lat: Number.NaN, lng: -48.55 };
    expect(nearestPlace([quebrado, perto], PRACA_XV.lat, PRACA_XV.lng)?.place.id).toBe("perto");
    expect(nearestPlace([perto], Number.NaN, PRACA_XV.lng)).toBeNull();
  });
});

describe("formatLatLng", () => {
  it("corta em cinco casas", () => {
    expect(formatLatLng(-27.597512345, -48.55)).toBe("-27.59751, -48.55000");
  });
});

describe("previewText", () => {
  it("devolve o texto inteiro quando ele já cabe", () => {
    expect(previewText("  Achei um Bukowski  ")).toEqual({
      text: "Achei um Bukowski",
      truncated: false,
    });
  });

  it("corta no espaço mais próximo do limite", () => {
    const texto = `${"palavra ".repeat(60)}fim`;
    const { text, truncated } = previewText(texto);

    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(FEED_PREVIEW_MAX);
    expect(text.endsWith("palavra")).toBe(true);
  });

  it("corta na marra quando não tem espaço perto do fim", () => {
    const { text, truncated } = previewText("a".repeat(400), 100);

    expect(truncated).toBe(true);
    expect(text).toHaveLength(100);
  });
});

describe("postInputSchema", () => {
  const base = { lat: "-27.5975", lng: "-48.55" };

  it("aceita texto, lugar e endereço, tirando os espaços", () => {
    const parsed = postInputSchema.parse({
      ...base,
      body: "  tem narga sim  ",
      placeId: " place-1 ",
      address: " Rua Felipe Schmidt, 123 - Centro ",
    });

    expect(parsed).toEqual({
      body: "tem narga sim",
      placeId: "place-1",
      lat: -27.5975,
      lng: -48.55,
      address: "Rua Felipe Schmidt, 123 - Centro",
    });
  });

  it("transforma campo vazio ou ausente em null", () => {
    expect(postInputSchema.parse({ ...base, body: "", placeId: "", address: "" })).toEqual({
      body: null,
      placeId: null,
      lat: -27.5975,
      lng: -48.55,
      address: null,
    });
    expect(postInputSchema.parse(base).body).toBeNull();
  });

  it("aceita coordenada em número, não só em string", () => {
    const parsed = postInputSchema.parse({ lat: -27.5975, lng: -48.55 });
    expect(parsed.lat).toBe(-27.5975);
    expect(parsed.lng).toBe(-48.55);
  });

  it("guarda as quebras de linha do texto", () => {
    const parsed = postInputSchema.parse({ ...base, body: "linha um\nlinha dois" });
    expect(parsed.body).toBe("linha um\nlinha dois");
  });

  it("recusa texto maior que o limite", () => {
    const result = postInputSchema.safeParse({ ...base, body: "a".repeat(POST_BODY_MAX + 1) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/máximo 1000/);
    expect(postInputSchema.safeParse({ ...base, body: "a".repeat(POST_BODY_MAX) }).success).toBe(
      true,
    );
  });

  it("exige coordenada e recusa a fora de faixa", () => {
    for (const bad of [
      { lat: "", lng: "-48.55" },
      { lat: "-27.5975", lng: "" },
      { lat: "abc", lng: "-48.55" },
      { lat: "-91", lng: "-48.55" },
      { lat: "-27.5975", lng: "181" },
    ]) {
      const result = postInputSchema.safeParse(bad);
      expect(result.success, JSON.stringify(bad)).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Diz de onde você tá postando.");
    }
  });

  it("recusa endereço comprido demais", () => {
    const result = postInputSchema.safeParse({ ...base, address: "a".repeat(241) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/máximo 240/);
  });
});

describe("commentNotificationBody", () => {
  it("monta a frase com o trecho entre aspas", () => {
    expect(commentNotificationBody("Bia", "Bora amanhã?")).toBe(
      "Bia comentou no seu post: “Bora amanhã?”",
    );
  });

  it("achata quebras de linha e espaços repetidos", () => {
    expect(commentNotificationBody("Bia", "  Bora\n\namanhã?   Tô   dentro ")).toBe(
      "Bia comentou no seu post: “Bora amanhã? Tô dentro”",
    );
  });

  it("corta comentário longo com reticências, sem espaço solto antes", () => {
    const longo = `${"palavra ".repeat(20)}fim`;
    const body = commentNotificationBody("Bia", longo);
    const excerpt = body.slice("Bia comentou no seu post: “".length, -1);

    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(COMMENT_PUSH_EXCERPT_MAX);
    expect(excerpt).not.toMatch(/ …$/);
  });

  it("não corta comentário que cabe", () => {
    const justo = "a".repeat(COMMENT_PUSH_EXCERPT_MAX);
    expect(commentNotificationBody("Bia", justo)).toContain(`“${justo}”`);
  });
});
