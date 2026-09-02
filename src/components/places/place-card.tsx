import Link from "next/link";
import type { ReactNode } from "react";

import { NargaStars } from "@/components/reviews/narga-stars";
import { formatNames, formatReviewCount, formatStars, shortAddress } from "@/lib/format";
import type { PlaceListItem } from "@/lib/queries/places";
import { cn } from "@/lib/utils";

import { HasNargaBadge } from "./has-narga-badge";
import { PriceLevel } from "./price-level";
import { ApprovedBadge, FewRatingsBadge } from "./rating-badges";

/** Quantas tags cabem no card sem virar sopa de letrinha. */
const MAX_TAGS = 3;

export function PlaceCard({
  place,
  position,
  note,
  className,
}: {
  place: PlaceListItem;
  /** Posição no ranking. Some na seção "Ainda sem nota" e no Rolê. */
  position?: number;
  /** Substitui a linha de "quem quer ir / já foi" (o Rolê usa pra destacar). */
  note?: ReactNode;
  className?: string;
}) {
  const address = shortAddress(place.address);
  const people = note ?? <PeopleLine place={place} />;

  return (
    <Link
      href={`/lugares/${place.slug}`}
      className={cn(
        "border-border bg-card focus-visible:ring-ring/50 hover:bg-secondary/40 flex gap-3 border-l-4 p-3 transition-colors outline-none focus-visible:ring-3",
        "rounded-lg border-y border-r",
        className,
      )}
      style={{ borderLeftColor: place.category.color }}
    >
      {position ? (
        <span className="text-muted-foreground w-6 shrink-0 pt-0.5 text-lg font-semibold tabular-nums">
          {position}
        </span>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-lg leading-6">
            {place.category.emoji}
          </span>
          <h3 className="min-w-0 flex-1 leading-6 font-semibold text-balance">{place.name}</h3>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {place.meanStars !== null ? (
            <span className="text-foreground inline-flex items-center gap-1.5 font-medium">
              <NargaStars stars={place.meanStars} size="sm" />
              {formatStars(place.meanStars)}
              <span className="text-muted-foreground font-normal">
                · {formatReviewCount(place.reviewCount)}
              </span>
            </span>
          ) : (
            <span>sem nota</span>
          )}
          {place.reviewCount > 0 && place.reviewCount < 3 ? <FewRatingsBadge /> : null}
          <PriceLevel value={place.priceLevel} />
          {place.hasNarga === "yes" ? <HasNargaBadge value="yes" /> : null}
        </div>

        {place.approved ? <ApprovedBadge className="self-start" /> : null}

        {address ? <p className="text-muted-foreground truncate text-xs">{address}</p> : null}

        {place.tags.length > 0 ? (
          // Span, não link: o card inteiro já é um <a> e âncora dentro de âncora não vale.
          <ul className="flex flex-wrap gap-1">
            {place.tags.slice(0, MAX_TAGS).map((tag) => (
              <li
                key={tag}
                className="border-border/70 text-muted-foreground/90 rounded-full border px-2 py-0.5 text-[0.6875rem] leading-4"
              >
                #{tag}
              </li>
            ))}
          </ul>
        ) : null}

        {place.latestVerdict ? (
          <blockquote className="border-narga/60 text-muted-foreground border-l-2 pl-2 text-xs">
            <span className="italic">“{place.latestVerdict}”</span>
            {place.latestVerdictAuthor ? (
              <span className="text-muted-foreground/70"> — {place.latestVerdictAuthor}</span>
            ) : null}
          </blockquote>
        ) : null}

        {people}
      </div>
    </Link>
  );
}

function PeopleLine({ place }: { place: PlaceListItem }) {
  const parts: string[] = [];
  if (place.visitedUsers.length > 0) {
    parts.push(`Já foram: ${formatNames(place.visitedUsers.map((u) => u.name))}`);
  }
  if (place.wantUsers.length > 0) {
    parts.push(`Querem ir: ${formatNames(place.wantUsers.map((u) => u.name))}`);
  }
  if (parts.length === 0) return null;
  return <p className="text-muted-foreground/80 text-xs">{parts.join(" · ")}</p>;
}
