/**
 * Regras puras dos posts do feed (docs/01 — Feed): limites, distância e validação.
 *
 * Nada aqui toca banco nem `next/*`: a action importa daqui e o formulário do cliente
 * também (é o mesmo `nearestPlace` que decide o "Você tá no Sebo do João?").
 */

import { z } from "zod";

/** Texto do post: puro, com quebras de linha. Passou disso, não publica. */
export const POST_BODY_MAX = 1000;

/** Endereço do reverse geocoding cabe folgado; o resto é lixo colado. */
export const POST_ADDRESS_MAX = 240;

/** Raio pra sugerir "você tá no X?" ao postar com GPS. 150 m é uma quadra e pouco. */
export const NEARBY_PLACE_METERS = 150;

const BODY_TOO_LONG = `Escreveu demais (máximo ${POST_BODY_MAX} caracteres).`;
const ADDRESS_TOO_LONG = `Endereço comprido demais (máximo ${POST_ADDRESS_MAX}).`;
const INVALID_PLACE = "Lugar inválido.";

/** Mensagem única de localização: o formulário não deixa publicar sem ela. */
export const NO_LOCATION = "Diz de onde você tá postando.";

export interface LatLngLike {
  lat: number;
  lng: number;
}

/** Raio médio da Terra (IUGG), em metros. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Distância em metros entre dois pontos. Haversine basta: no Centro de Floripa o erro
 * contra a fórmula elipsoidal é de centímetros, e a gente compara com 150 m.
 */
export function haversineMeters(a: LatLngLike, b: LatLngLike): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearbyPlace<T> {
  place: T;
  meters: number;
}

/**
 * O lugar cadastrado mais perto do ponto, se estiver dentro do raio. Empate resolve
 * pelo primeiro da lista (que já vem ordenada por categoria e nome).
 */
export function nearestPlace<T extends LatLngLike>(
  places: readonly T[],
  lat: number,
  lng: number,
  maxMeters: number = NEARBY_PLACE_METERS,
): NearbyPlace<T> | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let best: NearbyPlace<T> | null = null;
  for (const place of places) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
    const meters = haversineMeters({ lat, lng }, place);
    if (meters > maxMeters) continue;
    if (!best || meters < best.meters) best = { place, meters };
  }
  return best;
}

/** "-27.59750, -48.55000" — o que aparece quando o reverse geocoding não achou endereço. */
export function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Quanto do texto da avaliação cabe na prévia do card do feed. */
export const FEED_PREVIEW_MAX = 280;

/**
 * Corta um texto longo pra prévia, sem partir palavra no meio quando dá. Devolve
 * `truncated` pra quem chama decidir se mostra o "… ver avaliação".
 */
export function previewText(
  text: string,
  max: number = FEED_PREVIEW_MAX,
): { text: string; truncated: boolean } {
  const clean = text.trim();
  if (clean.length <= max) return { text: clean, truncated: false };

  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // Só volta até o espaço se isso não comer mais que 20% da prévia.
  const kept = lastSpace >= max * 0.8 ? cut.slice(0, lastSpace) : cut;
  return { text: kept.trimEnd(), truncated: true };
}

/** Campo de texto vindo do FormData: ausente vale como vazio, e vazio vira `null`. */
const optionalText = (max: number, message: string) =>
  z.preprocess(
    (value) => (value === undefined || value === null ? "" : value),
    z
      .string()
      .trim()
      .max(max, message)
      .transform((value) => (value === "" ? null : value)),
  );

/** Coordenada: aceita número (teste) ou string (form), e recusa vazio. */
const coordField = (max: number, message: string) =>
  z.preprocess(
    (value) => (typeof value === "number" ? String(value) : (value ?? "")),
    z
      .string()
      .trim()
      .refine(
        (value) => value !== "" && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= max,
        message,
      )
      .transform(Number),
  );

/**
 * O que o formulário de postar manda (menos a foto, que é `File` e não passa por Zod).
 *
 * `body` e `placeId` são opcionais aqui de propósito: "tem foto ou texto" e "o lugar
 * existe e está ativo" são regras da action, que tem banco pra conferir.
 */
export const postInputSchema = z.object({
  body: optionalText(POST_BODY_MAX, BODY_TOO_LONG),
  placeId: optionalText(64, INVALID_PLACE),
  lat: coordField(90, NO_LOCATION),
  lng: coordField(180, NO_LOCATION),
  address: optionalText(POST_ADDRESS_MAX, ADDRESS_TOO_LONG),
});

export type PostInput = z.infer<typeof postInputSchema>;
