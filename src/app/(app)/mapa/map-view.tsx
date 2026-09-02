"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PlacesMapLazy } from "@/components/map/places-map-lazy";
import { HasNargaBadge } from "@/components/places/has-narga-badge";
import { mapsSearchUrl } from "@/components/places/maps-buttons";
import { NargaStars } from "@/components/reviews/narga-stars";
import { Button } from "@/components/ui/button";
import { formatReviewCount, formatStars, shortAddress } from "@/lib/format";
import type { PlaceListItem } from "@/lib/queries/places";

export function MapView({
  places,
  center,
  zoom,
}: {
  places: PlaceListItem[];
  center: [number, number];
  zoom: number;
}) {
  const [selected, setSelected] = useState<PlaceListItem | null>(null);

  return (
    <>
      <PlacesMapLazy
        places={places}
        center={center}
        zoom={zoom}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        autoLocate
        className="border-border h-full w-full overflow-hidden rounded-xl border"
      />
      {selected ? <PlaceSheet place={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

/**
 * Bottom sheet do pino. Não é modal de propósito: dá pra continuar mexendo no mapa
 * com o card aberto.
 */
function PlaceSheet({ place, onClose }: { place: PlaceListItem; onClose: () => void }) {
  const address = shortAddress(place.address);

  return (
    <div
      role="dialog"
      aria-label={place.name}
      className="animate-in slide-in-from-bottom-4 fade-in fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-[720px] px-4 duration-150"
    >
      <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3 shadow-2xl">
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-lg leading-6">
            {place.category.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="leading-6 font-semibold text-balance">{place.name}</h2>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
              {place.meanStars !== null ? (
                <span className="text-foreground inline-flex items-center gap-1.5 font-medium">
                  <NargaStars stars={place.meanStars} size="sm" />
                  {formatStars(place.meanStars)}
                </span>
              ) : (
                <span>sem nota</span>
              )}
              {place.reviewCount > 0 ? <span>{formatReviewCount(place.reviewCount)}</span> : null}
              {place.hasNarga === "yes" ? <HasNargaBadge value="yes" /> : null}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={onClose}
            aria-label="Fechar"
            className="-mt-1 -mr-1 shrink-0"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        {address ? <p className="text-muted-foreground truncate text-xs">{address}</p> : null}

        <div className="flex gap-2">
          <Button
            size="lg"
            className="h-11 flex-1"
            nativeButton={false}
            render={<Link href={`/lugares/${place.slug}`} />}
          >
            Ver ficha
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-11 flex-1"
            nativeButton={false}
            render={
              <a
                href={mapsSearchUrl(place.lat, place.lng, null)}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            Maps ↗
          </Button>
        </div>
      </div>
    </div>
  );
}
