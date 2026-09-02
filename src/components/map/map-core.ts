import L from "leaflet";

/**
 * Tiles do OpenStreetMap: sem chave, sem cartão (a CARTO passou a exigir API key).
 * O visual escuro vem de um filtro CSS no pane dos tiles (map.css), não do provedor.
 * Política de uso do OSM: pouco tráfego e atribuição visível, que é o nosso caso.
 */
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Cinza dos lugares sem avaliação. */
export const NO_REVIEW_COLOR = "#6b7470";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Só deixa passar hex de verdade: a cor vem do banco e entra num atributo `style`. */
export function safeColor(value: string | null | undefined, fallback = NO_REVIEW_COLOR): string {
  if (value && /^#[0-9a-fA-F]{3,8}$/.test(value)) return value;
  return fallback;
}

/**
 * Camada de tiles do app. Fica aqui pra os dois mapas (lugares e picker) ficarem iguais.
 */
export function createTileLayer(): L.TileLayer {
  return L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom: 19,
    crossOrigin: true,
  });
}

export interface PinOptions {
  emoji: string;
  color: string;
  approved?: boolean;
  want?: boolean;
  selected?: boolean;
}

/**
 * Pino redondo com a cor da categoria e o emoji dentro. Nada de ícone padrão do Leaflet
 * (é ele que exige o hack de `iconUrl` com bundler; aqui não existe imagem nenhuma).
 */
export function createPinIcon({ emoji, color, approved, want, selected }: PinOptions): L.DivIcon {
  const html =
    `<span class="narga-pin" style="--pin-color:${escapeHtml(safeColor(color))}"` +
    ` data-approved="${approved ? "true" : "false"}"` +
    ` data-want="${want ? "true" : "false"}"` +
    ` data-selected="${selected ? "true" : "false"}">${escapeHtml(emoji)}</span>`;

  return L.divIcon({
    html,
    className: "narga-pin-wrap",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/** Ícone do cluster no mesmo estilo dos pinos. */
export function createClusterIcon(count: number): L.DivIcon {
  const size = count >= 10 ? "lg" : "sm";
  const html = `<span class="narga-cluster" data-size="${size}">${count}</span>`;
  return L.divIcon({
    html,
    className: "narga-cluster-wrap",
    iconSize: count >= 10 ? [48, 48] : [40, 40],
  });
}

export function createHereIcon(): L.DivIcon {
  return L.divIcon({
    html: '<span class="narga-here"></span>',
    className: "narga-pin-wrap",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}
