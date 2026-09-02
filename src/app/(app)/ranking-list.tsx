"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PlaceCard } from "@/components/places/place-card";
import { Input } from "@/components/ui/input";
import type { PlaceListItem } from "@/lib/queries/places";

export interface RankedPlace {
  place: PlaceListItem;
  position: number;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matches(place: PlaceListItem, query: string): boolean {
  return normalize(`${place.name} ${place.address ?? ""}`).includes(query);
}

/**
 * Ranking + busca. A lista inteira já veio do servidor, então filtrar por nome/endereço
 * é instantâneo e não vai à rede (docs/04).
 */
export function RankingList({
  ranked,
  unrated,
}: {
  ranked: RankedPlace[];
  unrated: PlaceListItem[];
}) {
  const [query, setQuery] = useState("");
  const normalized = normalize(query.trim());

  const visibleRanked = useMemo(
    () => (normalized ? ranked.filter((r) => matches(r.place, normalized)) : ranked),
    [ranked, normalized],
  );
  const visibleUnrated = useMemo(
    () => (normalized ? unrated.filter((p) => matches(p, normalized)) : unrated),
    [unrated, normalized],
  );

  const nothing = visibleRanked.length === 0 && visibleUnrated.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome ou endereço"
          aria-label="Buscar lugar"
          className="h-11 pl-9"
        />
      </div>

      {nothing ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Nada com esse filtro. Bora descobrir?
        </p>
      ) : null}

      {visibleRanked.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {visibleRanked.map((entry) => (
            <li key={entry.place.id}>
              <PlaceCard place={entry.place} position={entry.position} />
            </li>
          ))}
        </ul>
      ) : null}

      {visibleUnrated.length > 0 ? (
        <section className="flex flex-col gap-2 pt-2">
          <h2 className="text-muted-foreground px-1 text-sm font-medium">
            Ainda sem nota ({visibleUnrated.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {visibleUnrated.map((place) => (
              <li key={place.id}>
                <PlaceCard place={place} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
