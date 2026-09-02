import { ExternalLink, Navigation } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Link de "abrir": o que a pessoa colou, ou o deep link por coordenada. Nenhum precisa de chave. */
export function mapsSearchUrl(lat: number, lng: number, googleMapsUrl?: string | null): string {
  if (googleMapsUrl && /^https:\/\//i.test(googleMapsUrl)) return googleMapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function mapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function MapsButtons({
  lat,
  lng,
  googleMapsUrl,
  className,
}: {
  lat: number;
  lng: number;
  googleMapsUrl?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2", className)}>
      <Button
        variant="outline"
        size="lg"
        className="h-11 flex-1"
        nativeButton={false}
        render={
          <a
            href={mapsSearchUrl(lat, lng, googleMapsUrl)}
            target="_blank"
            rel="noopener noreferrer"
          />
        }
      >
        <ExternalLink className="size-4" aria-hidden />
        Abrir no Maps
      </Button>
      <Button
        size="lg"
        className="h-11 flex-1"
        nativeButton={false}
        render={<a href={mapsDirectionsUrl(lat, lng)} target="_blank" rel="noopener noreferrer" />}
      >
        <Navigation className="size-4" aria-hidden />
        Como chegar
      </Button>
    </div>
  );
}
