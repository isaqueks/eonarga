import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HasNargaBadge } from "@/components/places/has-narga-badge";
import { MapsButtons } from "@/components/places/maps-buttons";
import { PriceLevel } from "@/components/places/price-level";
import { ApprovedBadge } from "@/components/places/rating-badges";
import { NargaStars } from "@/components/reviews/narga-stars";
import { formatReviewCount, formatStars } from "@/lib/format";
import { listPhotosForPlace } from "@/lib/queries/photos";
import { getPlaceBySlug, type PlaceDetail } from "@/lib/queries/places";
import { getReviewsForPlace } from "@/lib/queries/reviews";
import { verifyShareToken } from "@/lib/share";

/**
 * Quem abre o link público não tem conta. As queries pedem um id de quem está olhando
 * só pra resolver "meu status" e "minha reação" — com id vazio, nada casa, que é o certo.
 */
const NOBODY = "";

/** Só o primeiro nome: o link sai do grupo, os sobrenomes não precisam sair junto. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Foto pela rota pública, que revalida o token a cada request. */
function photoUrl(slug: string, id: string, token: string, variant: "thumb" | "full"): string {
  return `/api/p/${encodeURIComponent(slug)}/photos/${id}?t=${encodeURIComponent(token)}&v=${variant}`;
}

/** Lugar + token conferidos, ou `null`. Usado pela metadata e pela página. */
async function resolve(
  params: PageProps<"/p/[slug]">["params"],
  searchParams: PageProps<"/p/[slug]">["searchParams"],
): Promise<{ place: PlaceDetail; token: string } | null> {
  const { slug } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";

  const place = await getPlaceBySlug(slug, NOBODY);
  if (!place || !verifyShareToken(place.id, token)) return null;
  return { place, token };
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/p/[slug]">): Promise<Metadata> {
  const found = await resolve(params, searchParams);
  return {
    title: found ? found.place.name : "Lugar",
    description: found
      ? `${found.place.category.name} no Centro de Floripa, segundo a galera do E o narga?`
      : undefined,
    // Link privado no sentido de "não indexa": quem tem o link vê, o Google não.
    robots: { index: false, follow: false },
  };
}

export default async function PublicPlacePage({ params, searchParams }: PageProps<"/p/[slug]">) {
  const found = await resolve(params, searchParams);
  if (!found) notFound();
  const { place, token } = found;

  const [photos, reviews] = await Promise.all([
    listPhotosForPlace(place.id, null),
    getReviewsForPlace(place.id, { id: NOBODY, role: "member" }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <p className="border-border bg-muted/40 text-muted-foreground rounded-lg border p-3 text-xs">
        Recorte do <strong className="text-foreground">E o narga?</strong> — o app é fechado, mas
        esse lugar é público.
      </p>

      <div className="flex flex-col gap-1">
        <h1 className="font-display flex items-start gap-2 text-2xl leading-tight text-balance">
          <span aria-hidden>{place.category.emoji}</span>
          <span>{place.name}</span>
        </h1>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
          <span style={{ color: place.category.color }}>{place.category.name}</span>
          {place.priceLevel ? (
            <>
              <span aria-hidden>·</span>
              <PriceLevel value={place.priceLevel} />
            </>
          ) : null}
        </p>
      </div>

      {place.meanStars !== null ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <NargaStars stars={place.meanStars} size="lg" />
          <span className="text-3xl leading-none font-semibold tabular-nums">
            {formatStars(place.meanStars)}
          </span>
          <span className="text-muted-foreground text-sm">
            ({formatReviewCount(place.reviewCount)})
          </span>
          {place.approved ? <ApprovedBadge size="md" /> : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Ninguém deu nota ainda.</p>
      )}

      {place.address ? <p className="text-sm">{place.address}</p> : null}

      <MapsButtons lat={place.lat} lng={place.lng} googleMapsUrl={place.googleMapsUrl} />

      <div className="flex flex-col gap-2 text-sm">
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="text-muted-foreground">Tem narga?</span>
          <HasNargaBadge value={place.hasNarga} />
        </p>
        {place.description ? <p className="text-muted-foreground">{place.description}</p> : null}
        {place.tips ? (
          <p className="text-muted-foreground">
            <strong className="text-foreground font-medium">Dicas:</strong> {place.tips}
          </p>
        ) : null}
      </div>

      {photos.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Fotos ({photos.length})</h2>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {photos.map((photo) => (
              <li key={photo.id}>
                <a
                  href={photoUrl(place.slug, photo.id, token, "full")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border bg-muted block aspect-square w-full overflow-hidden rounded-lg border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl(place.slug, photo.id, token, "thumb")}
                    alt={`Foto de ${firstName(photo.uploadedBy.name)}`}
                    width={400}
                    height={400}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reviews.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">O que a galera achou</h2>
          <ul className="flex flex-col gap-2">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="border-border bg-card flex flex-col gap-1.5 rounded-xl border p-3"
              >
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="text-foreground text-sm font-semibold">
                    {firstName(review.author.name)}
                  </span>
                  <NargaStars stars={review.stars} size="sm" />
                  <span className="tabular-nums">{formatStars(review.stars)}</span>
                </div>
                <blockquote className="border-narga border-l-3 pl-3 text-[0.9375rem] leading-snug font-medium text-balance">
                  {review.verdict}
                </blockquote>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="text-muted-foreground border-border mt-2 border-t pt-4 text-xs">
        <Link href="/login" className="font-display text-foreground hover:underline">
          E o narga?
        </Link>{" "}
        — caderninho de rolês do Centro de Floripa. Fechado, mas esse pedaço é público.
      </footer>
    </main>
  );
}

export const dynamic = "force-dynamic";
