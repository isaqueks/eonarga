/**
 * Configuração do mapa e do geocoding. Lida do ambiente com fallback pro Centro de Floripa,
 * pra o app funcionar sem `.env` em dev.
 */

/** Praça XV, Centro de Florianópolis. */
const DEFAULT_CENTER: [number, number] = [-27.5975, -48.55];

function parseCenter(raw: string | undefined): [number, number] {
  if (!raw) return DEFAULT_CENTER;
  const parts = raw.split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 2) return DEFAULT_CENTER;
  const [lat, lng] = parts;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return DEFAULT_CENTER;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return DEFAULT_CENTER;
  return [lat, lng];
}

/** `[lat, lng]` — visão inicial do mapa. Env `MAP_CENTER="lat,lng"`. */
export const MAP_CENTER: [number, number] = parseCenter(process.env.MAP_CENTER);

/** Zoom inicial do mapa (bairro/quarteirão). */
export const MAP_DEFAULT_ZOOM = 16;

/** Caixa da Grande Floripa pro viés da busca de endereço: `[minLon, minLat, maxLon, maxLat]`. */
export const FLORIPA_BBOX: [number, number, number, number] = [-48.62, -27.72, -48.4, -27.4];

/** Nominatim/Photon exigem um User-Agent identificável. */
export const GEOCODE_USER_AGENT =
  process.env.GEOCODE_USER_AGENT ?? "eonarga/0.1 (https://narga.schlutersolucoes.com.br)";
