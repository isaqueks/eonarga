"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";

import { createHereIcon } from "./map-core";

const NO_GPS = "Sem GPS por aqui.";

export interface LocateOptions {
  /** Pontinho azul na posição atual. Desligado no picker (lá quem marca é o pino). */
  showDot?: boolean;
  /** Chamado com a posição encontrada. */
  onLocated?: (lat: number, lng: number) => void;
}

/**
 * Botão "onde estou": centraliza o mapa na posição do navegador. A posição nunca é
 * gravada (docs/05: geolocalização só sob demanda).
 */
export function useLocateMe(mapRef: React.RefObject<L.Map | null>, options: LocateOptions = {}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const timer = timerRef;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      markerRef.current = null;
    };
  }, []);

  const fail = useCallback((message: string) => {
    setLocating(false);
    setError(message);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setError(null), 3500);
  }, []);

  /** `pan: false` só mostra o pontinho, sem mover o mapa (usado ao abrir a tela). */
  const locate = useCallback(
    (opts: { pan?: boolean } = {}) => {
      const map = mapRef.current;
      if (!map) return;
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        fail(NO_GPS);
        return;
      }

      setError(null);
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const current = mapRef.current;
          if (!current) return;
          const { latitude, longitude } = position.coords;
          const { showDot = true, onLocated } = optionsRef.current;

          if (showDot) {
            if (markerRef.current) {
              markerRef.current.setLatLng([latitude, longitude]);
            } else {
              markerRef.current = L.marker([latitude, longitude], {
                icon: createHereIcon(),
                interactive: false,
                keyboard: false,
                zIndexOffset: -100,
              }).addTo(current);
            }
          }

          if (opts.pan !== false) {
            current.setView([latitude, longitude], Math.max(current.getZoom(), 17));
          }
          setLocating(false);
          onLocated?.(latitude, longitude);
        },
        () => fail(NO_GPS),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
      );
    },
    [mapRef, fail],
  );

  return { locate, locating, error };
}
