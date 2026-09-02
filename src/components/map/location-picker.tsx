"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

import { MAP_CENTER, MAP_DEFAULT_ZOOM } from "@/lib/config";
import { cn } from "@/lib/utils";

import { LocateButton } from "./locate-button";
import { createPinIcon, createTileLayer } from "./map-core";
import { useLocateMe } from "./use-locate-me";
import "./map.css";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocationPickerProps {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  center?: [number, number];
  zoom?: number;
  className?: string;
  /** Emoji dentro do pino (a categoria escolhida, quando já tem uma). */
  emoji?: string;
  color?: string;
}

/** Mapa com um pino arrastável. Clicar no mapa reposiciona; soltar o pino também. */
export function LocationPicker({
  value,
  onChange,
  center = MAP_CENTER,
  zoom = MAP_DEFAULT_ZOOM,
  className,
  emoji = "📍",
  color = "#f4b942",
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [ready, setReady] = useState(false);

  const initialRef = useRef({
    center: value ? [value.lat, value.lng] : center,
    zoom,
    emoji,
    color,
  });
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const initial = initialRef.current;
    const map = L.map(el, {
      center: initial.center as [number, number],
      zoom: initial.zoom,
      zoomControl: true,
      attributionControl: true,
    });
    createTileLayer().addTo(map);

    const marker = L.marker(map.getCenter(), {
      icon: createPinIcon({ emoji: initial.emoji, color: initial.color, selected: true }),
      draggable: true,
      autoPan: true,
      keyboard: true,
      title: "Arraste pra ajustar",
      alt: "Posição do lugar",
    }).addTo(map);

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      onChangeRef.current({ lat, lng });
    });
    map.on("click", (event: L.LeafletMouseEvent) => {
      marker.setLatLng(event.latlng);
      onChangeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;
    setReady(true);

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      setReady(false);
    };
  }, []);

  // Posição vinda de fora (colar link, escolher da busca): move o pino e a câmera.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !ready || !value) return;

    const current = marker.getLatLng();
    if (Math.abs(current.lat - value.lat) < 1e-9 && Math.abs(current.lng - value.lng) < 1e-9) {
      return;
    }
    marker.setLatLng([value.lat, value.lng]);
    map.setView([value.lat, value.lng], Math.max(map.getZoom(), 17));
  }, [value, ready]);

  // Emoji/cor do pino acompanham a categoria escolhida no formulário.
  useEffect(() => {
    if (!ready) return;
    markerRef.current?.setIcon(createPinIcon({ emoji, color, selected: true }));
  }, [emoji, color, ready]);

  // No picker, "onde estou" também joga o pino pra lá — é o uso óbvio do botão aqui.
  const { locate, locating, error } = useLocateMe(mapRef, {
    showDot: false,
    onLocated: (lat, lng) => onChangeRef.current({ lat, lng }),
  });

  return (
    <div className={cn("relative isolate", className)}>
      <div
        ref={containerRef}
        role="application"
        aria-label="Escolher a posição no mapa"
        className="narga-map h-full w-full"
      />
      <LocateButton onClick={locate} loading={locating} error={error} className="bottom-8" />
    </div>
  );
}
