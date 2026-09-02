/**
 * Geocoding via OpenStreetMap, sempre pelo servidor (ver docs/02 e docs/05):
 * Photon pro autocomplete (Nominatim proíbe) e Nominatim pro reverso, com
 * User-Agent identificado, fila de 1 req/s e cache de 24 h.
 */

import { FLORIPA_BBOX, GEOCODE_USER_AGENT, MAP_CENTER } from "@/lib/config";

export interface GeocodeResult {
  /** O que aparece na lista: nome + endereço curto. */
  label: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const PHOTON_URL = "https://photon.komoot.io/api/";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const MIN_QUERY_LENGTH = 3;
const DEFAULT_LIMIT = 6;
const REQUEST_TIMEOUT_MS = 5_000;
/** Política do Nominatim: no máximo 1 req/s, global. */
const NOMINATIM_MIN_INTERVAL_MS = 1_000;

const CITY = "Florianópolis";

type CacheEntry<T> = { value: T; expiresAt: number };

/** Cache burro com TTL e teto de tamanho: joga fora o mais antigo quando lota. */
class TtlCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Renova a posição pra o descarte virar LRU.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

const searchCache = new TtlCache<GeocodeResult[]>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);
const reverseCache = new TtlCache<{ address: string } | null>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);

function inFloripa(lat: number, lng: number): boolean {
  const [minLng, minLat, maxLng, maxLat] = FLORIPA_BBOX;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

function isSameCity(city: string | undefined | null): boolean {
  if (!city) return false;
  return city.normalize("NFC").toLowerCase() === CITY.toLowerCase();
}

/** "Rua Felipe Schmidt, 123 - Centro". Sem cidade/estado/CEP quando é Floripa. */
function formatAddress(parts: {
  street?: string | null;
  houseNumber?: string | null;
  district?: string | null;
  city?: string | null;
}): string {
  const street = parts.street?.trim();
  const number = parts.houseNumber?.trim();
  const district = parts.district?.trim();
  const city = parts.city?.trim();

  const left = [street, number].filter(Boolean).join(", ");
  const right = [district, isSameCity(city) ? null : city].filter(Boolean).join(", ");

  if (left && right) return `${left} - ${right}`;
  return left || right || "";
}

function buildLabel(name: string, address: string): string {
  if (name && address) return `${name} — ${address}`;
  return name || address;
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<unknown | null> {
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": GEOCODE_USER_AGENT, accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    // Provedor fora do ar, timeout, JSON quebrado: pra quem chama é "sem resultado".
    return null;
  }
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return run(controller.signal).finally(() => clearTimeout(timer));
}

// --- Photon (busca) ---------------------------------------------------------

interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  osm_key?: string;
  osm_value?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: PhotonProperties;
}

/** Exportado só pro teste do parser; a UI usa `searchPlaces`. */
export function parsePhotonResponse(payload: unknown): GeocodeResult[] {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];

  const out: GeocodeResult[] = [];
  for (const raw of features as PhotonFeature[]) {
    const coords = raw?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    // GeoJSON é [lon, lat].
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!inFloripa(lat, lng)) continue;

    const p = raw.properties ?? {};
    const district = p.district ?? p.suburb ?? p.neighbourhood ?? null;
    const address = formatAddress({
      street: p.street,
      houseNumber: p.housenumber,
      district,
      city: p.city ?? p.county,
    });

    // Endereço puro não tem `name`: usa a rua como nome.
    const name = (p.name ?? [p.street, p.housenumber].filter(Boolean).join(", ")).trim();
    if (!name && !address) continue;

    out.push({ label: buildLabel(name, address), name: name || address, address, lat, lng });
  }
  return out;
}

/**
 * Autocomplete de endereço, com viés pro Centro e descartando o que caiu fora
 * de Floripa. Menos de 3 caracteres devolve `[]` sem tocar na rede.
 */
export async function searchPlaces(
  q: string,
  opts: { limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<GeocodeResult[]> {
  const query = q.trim().replace(/\s+/g, " ");
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 20);
  if (query.length < MIN_QUERY_LENGTH) return [];

  const cacheKey = `${limit}:${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", query);
  // Pede folga: o filtro de bbox derruba parte dos resultados.
  url.searchParams.set("limit", String(Math.min(limit * 3, 40)));
  url.searchParams.set("lat", String(MAP_CENTER[0]));
  url.searchParams.set("lon", String(MAP_CENTER[1]));
  url.searchParams.set("lang", "default");

  const fetchImpl = opts.fetchImpl ?? fetch;
  const payload = await withTimeout((signal) => fetchJson(url.toString(), fetchImpl, signal));
  if (payload === null) return [];

  const results = parsePhotonResponse(payload).slice(0, limit);
  searchCache.set(cacheKey, results);
  return results;
}

// --- Nominatim (reverso) ----------------------------------------------------

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  city?: string;
  town?: string;
  municipality?: string;
}

/** Exportado só pro teste do parser; a UI usa `reverseGeocode`. */
export function parseNominatimReverse(payload: unknown): { address: string } | null {
  const data = payload as { error?: unknown; name?: string; address?: NominatimAddress } | null;
  if (!data || typeof data !== "object" || data.error) return null;

  const a = data.address ?? {};
  const address = formatAddress({
    street: a.road ?? a.pedestrian ?? a.footway ?? data.name,
    houseNumber: a.house_number,
    district: a.suburb ?? a.neighbourhood ?? a.city_district,
    city: a.city ?? a.town ?? a.municipality,
  });

  return address ? { address } : null;
}

/** Fila global: o Nominatim aceita 1 req/s e a gente respeita. */
let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

function enqueueNominatim<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastNominatimAt = Date.now();
    }
  });
  // A fila não pode quebrar se uma tarefa falhar.
  nominatimQueue = run.catch(() => undefined);
  return run;
}

/** Endereço a partir de um ponto do mapa (toque no mapa / arrastar o pino). */
export async function reverseGeocode(
  lat: number,
  lng: number,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ address: string } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseCache.get(key);
  if (cached !== undefined) return cached;

  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toFixed(6));
  url.searchParams.set("lon", lng.toFixed(6));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("accept-language", "pt-BR");

  const fetchImpl = opts.fetchImpl ?? fetch;
  const payload = await enqueueNominatim(() =>
    withTimeout((signal) => fetchJson(url.toString(), fetchImpl, signal)),
  );
  if (payload === null) return null;

  const result = parseNominatimReverse(payload);
  reverseCache.set(key, result);
  return result;
}
