"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect, useRef, useState } from "react";

import { MAP_CENTER, MAP_DEFAULT_ZOOM } from "@/lib/config";
import type { PlaceListItem } from "@/lib/queries/places";
import { cn } from "@/lib/utils";

import { LocateButton } from "./locate-button";
import { createClusterIcon, createPinIcon, createTileLayer, NO_REVIEW_COLOR } from "./map-core";
import { useLocateMe } from "./use-locate-me";
import "./map.css";

export interface PlacesMapProps {
  places: PlaceListItem[];
  center?: [number, number];
  zoom?: number;
  selectedId?: string | null;
  onSelect?: (place: PlaceListItem | null) => void;
  className?: string;
  /** Enquadra o mapa em todos os lugares na primeira carga. */
  fitToPlaces?: boolean;
  /** Agrupa pinos próximos. Desligado no mini-mapa da ficha. */
  cluster?: boolean;
  /** Botão "onde estou". */
  showLocate?: boolean;
  /** Mini-mapa da ficha: sem arrastar, sem zoom. */
  interactive?: boolean;
}

function iconFor(place: PlaceListItem, selected: boolean) {
  return createPinIcon({
    emoji: place.category.emoji,
    // Sem avaliação = cinza (docs/04): dá pra ver de longe o que ainda não tem nota.
    color: place.reviewCount === 0 ? NO_REVIEW_COLOR : place.category.color,
    approved: place.approved,
    want: place.myStatus === "want",
    selected,
  });
}

export function PlacesMap({
  places,
  center = MAP_CENTER,
  zoom = MAP_DEFAULT_ZOOM,
  selectedId = null,
  onSelect,
  className,
  fitToPlaces = false,
  cluster = true,
  showLocate = true,
  interactive = true,
}: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const [ready, setReady] = useState(false);

  // A view inicial é capturada uma vez: mudar `center`/`zoom` depois não recria o mapa
  // (e não briga com o que a pessoa arrastou).
  const initialRef = useRef({ center, zoom, interactive });
  // Handlers do Leaflet leem daqui pra não virar dependência de efeito.
  const onSelectRef = useRef(onSelect);
  const fittedRef = useRef(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const { center: c, zoom: z, interactive: canInteract } = initialRef.current;
    const map = L.map(el, {
      center: c,
      zoom: z,
      zoomControl: canInteract,
      attributionControl: true,
      dragging: canInteract,
      scrollWheelZoom: canInteract,
      doubleClickZoom: canInteract,
      touchZoom: canInteract,
      boxZoom: canInteract,
      keyboard: canInteract,
    });
    createTileLayer().addTo(map);
    map.on("click", () => onSelectRef.current?.(null));

    mapRef.current = map;
    setReady(true);

    // O container costuma nascer com altura 0 (skeleton, bottom sheet, layout em flex).
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      fittedRef.current = false;
      setReady(false);
    };
  }, []);

  // Marcadores: recria a camada inteira quando a lista muda. São dezenas de pinos,
  // não milhares; um diff aqui só compraria bug.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const group: L.LayerGroup = cluster
      ? L.markerClusterGroup({
          maxClusterRadius: 60,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          iconCreateFunction: (c) => createClusterIcon(c.getChildCount()),
        })
      : L.layerGroup();

    const markers = new Map<string, L.Marker>();
    for (const place of places) {
      // Nasce sem destaque; o efeito de seleção logo abaixo acerta o ícone no mesmo commit.
      const marker = L.marker([place.lat, place.lng], {
        icon: iconFor(place, false),
        title: place.name,
        alt: place.name,
        keyboard: true,
      });
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        onSelectRef.current?.(place);
      });
      marker.addTo(group);
      markers.set(place.id, marker);
    }

    group.addTo(map);
    markersRef.current = markers;

    if (fitToPlaces && places.length > 0 && !fittedRef.current) {
      fittedRef.current = true;
      map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [48, 48],
        maxZoom: 17,
      });
    }

    return () => {
      group.remove();
      markersRef.current = new Map();
    };
  }, [places, cluster, ready, fitToPlaces]);

  // Seleção: troca só os ícones, sem recriar a camada (senão o cluster pisca).
  useEffect(() => {
    for (const place of places) {
      markersRef.current.get(place.id)?.setIcon(iconFor(place, place.id === selectedId));
    }
  }, [selectedId, places, ready]);

  const { locate, locating, error } = useLocateMe(mapRef);

  return (
    <div className={cn("relative isolate", className)}>
      <div
        ref={containerRef}
        role="application"
        aria-label="Mapa dos lugares"
        className="narga-map h-full w-full"
      />
      {showLocate ? <LocateButton onClick={locate} loading={locating} error={error} /> : null}
    </div>
  );
}
