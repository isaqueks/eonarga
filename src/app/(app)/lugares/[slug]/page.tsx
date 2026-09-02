import { ArrowLeft, AtSign, Link2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlacesMapLazy } from "@/components/map/places-map-lazy";
import { PeopleList } from "@/components/people-list";
import { HasNargaBadge } from "@/components/places/has-narga-badge";
import { MapsButtons } from "@/components/places/maps-buttons";
import { PlacePhotos } from "@/components/places/place-photos";
import { PlaceTags } from "@/components/places/place-tags";
import { PriceLevel } from "@/components/places/price-level";
import { TOP_TAGS } from "@/components/places/tag-chips";
import { ApprovedBadge, FewRatingsBadge } from "@/components/places/rating-badges";
import { StatusButtons } from "@/components/places/status-buttons";
import { NargaStars } from "@/components/reviews/narga-stars";
import { ReviewCard } from "@/components/reviews/review-card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/guards";
import { formatReviewCount, formatStars, instagramHandle } from "@/lib/format";
import { getPlaceBySlug, listTagsWithCounts } from "@/lib/queries/places";
import { getReviewsForPlace } from "@/lib/queries/reviews";
import { shareUrlFor } from "@/lib/share";

import { PlaceActions, UnarchiveButton } from "./place-actions";

export async function generateMetadata({
  params,
}: PageProps<"/lugares/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const current = await requireUser();
  const place = await getPlaceBySlug(slug, current.user.id);
  return { title: place?.name ?? "Lugar" };
}

export default async function PlacePage({ params }: PageProps<"/lugares/[slug]">) {
  const { slug } = await params;
  const { user } = await requireUser();
  const place = await getPlaceBySlug(slug, user.id);
  if (!place) notFound();

  const [reviews, topTags] = await Promise.all([
    getReviewsForPlace(place.id, { id: user.id, role: user.role }),
    listTagsWithCounts(),
  ]);
  const myReview = reviews.find((review) => review.author.id === user.id) ?? null;
  // Sugestões do "+ tag": as mais usadas no grupo, fora as que o lugar já tem.
  const tagSuggestions = topTags
    .map((t) => t.tag)
    .filter((t) => !place.tags.includes(t))
    .slice(0, TOP_TAGS);
  const isOwnerOrAdmin = place.createdBy.id === user.id || user.role === "admin";
  const instagram = instagramHandle(place.instagram);
  // `null` quando não tem APP_SECRET no ambiente: aí o recurso nem aparece no menu.
  const shareUrl = shareUrlFor(place.slug, place.id);

  return (
    <article className="flex flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-2">
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11"
          nativeButton={false}
          render={<Link href="/" />}
        >
          <ArrowLeft className="size-5" aria-hidden />
          <span className="sr-only">Voltar</span>
        </Button>
        <PlaceActions
          placeId={place.id}
          slug={place.slug}
          name={place.name}
          canArchive={isOwnerOrAdmin}
          archived={place.status === "archived"}
          shareUrl={shareUrl}
        />
      </header>

      {place.status === "archived" ? (
        <div className="border-border bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
          <p className="text-muted-foreground text-sm">
            <strong className="text-foreground">Arquivado.</strong> Some do ranking e do mapa; as
            avaliações ficam.
          </p>
          {isOwnerOrAdmin ? <UnarchiveButton placeId={place.id} /> : null}
        </div>
      ) : null}

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
          <span aria-hidden>·</span>
          <HasNargaBadge value={place.hasNarga} short />
        </p>
        <PlaceTags
          placeId={place.id}
          tags={place.tags}
          canEdit={place.status === "active"}
          suggestions={tagSuggestions}
        />
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
          {place.reviewCount < 3 ? <FewRatingsBadge /> : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Ninguém deu nota. Seja o primeiro (ou o culpado).
        </p>
      )}

      <MapsButtons lat={place.lat} lng={place.lng} googleMapsUrl={place.googleMapsUrl} />
      <StatusButtons placeId={place.id} initial={place.myStatus} />

      <Separator />

      <div className="flex flex-col gap-2 text-sm">
        {place.address ? <p>{place.address}</p> : null}
        {place.description ? <p className="text-muted-foreground">{place.description}</p> : null}
        {instagram ? (
          <a
            href={`https://instagram.com/${instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1.5 hover:underline"
          >
            <AtSign className="size-4" aria-hidden />
            {instagram}
          </a>
        ) : null}
        {place.website ? (
          <a
            href={place.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1.5 break-all hover:underline"
          >
            <Link2 className="size-4 shrink-0" aria-hidden />
            {place.website}
          </a>
        ) : null}
        {place.tips ? (
          <p className="text-muted-foreground">
            <strong className="text-foreground font-medium">Dicas:</strong> {place.tips}
          </p>
        ) : null}
      </div>

      <div className="border-border h-40 overflow-hidden rounded-xl border">
        <PlacesMapLazy
          places={[place]}
          center={[place.lat, place.lng]}
          zoom={17}
          cluster={false}
          showLocate={false}
          interactive={false}
          className="h-full w-full"
        />
      </div>

      <Separator />

      <PlacePhotos
        placeId={place.id}
        viewer={{ id: user.id, role: user.role }}
        canUpload={place.status === "active"}
      />

      <Separator />

      <div className="flex flex-col gap-1.5 text-sm">
        <PeopleList label="Já foram:" people={place.visitedUsers} />
        <PeopleList label="Querem ir:" people={place.wantUsers} />
        {place.visitedUsers.length === 0 && place.wantUsers.length === 0 ? (
          <p className="text-muted-foreground">Ninguém marcou nada aqui ainda.</p>
        ) : null}
      </div>

      <Separator />

      {place.status === "archived" ? null : (
        <Button
          size="lg"
          className="h-12 text-base"
          nativeButton={false}
          render={<Link href={`/lugares/${place.slug}/avaliar`} />}
        >
          {myReview ? "Editar minha nota" : "✍️ Dar minha nota"}
        </Button>
      )}

      <section id="avaliacoes" className="flex scroll-mt-20 flex-col gap-3">
        <h2 className="text-base font-semibold">Avaliações ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
            Ninguém deu nota. Seja o primeiro (ou o culpado).
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reviews.map((review) => (
              <li key={review.id}>
                <ReviewCard
                  review={review}
                  placeSlug={place.slug}
                  viewerId={user.id}
                  canEdit={place.status === "active"}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-muted-foreground/70 text-xs">Cadastrado por {place.createdBy.name}.</p>
    </article>
  );
}

export const dynamic = "force-dynamic";
