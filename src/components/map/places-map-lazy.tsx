"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

import type { PlacesMapProps } from "./places-map";

/**
 * O Leaflet mexe em `window` no import. Nada de SSR: o mapa só existe no cliente.
 * (Também é por isso que não usamos react-leaflet — a v5 briga com o StrictMode do Next 16.)
 */
export const PlacesMapLazy = dynamic<PlacesMapProps>(
  () => import("./places-map").then((m) => m.PlacesMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  },
);
