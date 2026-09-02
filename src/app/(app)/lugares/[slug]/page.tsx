import { ArrowLeft, AtSign, Link2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlacesMapLazy } from "@/components/map/places-map-lazy";
import { HasNargaBadge } from "@/components/places/has-narga-badge";
import { MapsButtons } from "@/components/places/maps-buttons";
import { PriceLevel } from "@/components/places/price-level";
import { StatusButtons } from "@/components/places/status-buttons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/guards";
import { formatNames, formatReviewCount, formatStars, instagramHandle } from "@/lib/format";
import { getPlaceBySlug } from "@/lib/queries/places";

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

  const isOwnerOrAdmin = place.createdBy.id === user.id || user.role === "admin";
  const instagram = instagramHandle(place.instagram);

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
      </div>

      <div className="flex items-baseline gap-3">
        {place.meanStars !== null ? (
          <>
            <span className="text-3xl font-semibold tabular-nums">
              ★ {formatStars(place.meanStars)}
            </span>
            <span className="text-muted-foreground text-sm">
              {formatReviewCount(place.reviewCount)}
            </span>
            {place.approved ? (
              <span className="text-narga text-sm font-medium">🏅 Aprovado pelo narga</span>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Ninguém deu nota. Seja o primeiro (ou o culpado).
          </p>
        )}
      </div>

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

      <div className="flex flex-col gap-1 text-sm">
        {place.visitedUsers.length > 0 ? (
          <p>
            <span className="text-muted-foreground">Já foram:</span>{" "}
            {formatNames(place.visitedUsers.map((u) => u.name))}
          </p>
        ) : null}
        {place.wantUsers.length > 0 ? (
          <p>
            <span className="text-muted-foreground">Querem ir:</span>{" "}
            {formatNames(place.wantUsers.map((u) => u.name))}
          </p>
        ) : null}
        {place.visitedUsers.length === 0 && place.wantUsers.length === 0 ? (
          <p className="text-muted-foreground">Ninguém marcou nada aqui ainda.</p>
        ) : null}
      </div>

      <Separator />

      {/* TODO(fase3): lista de avaliações, reações e o CTA "Dar minha nota". */}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Avaliações</h2>
        <p className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          Dar nota, escrever e reagir vem na Fase 3.
        </p>
      </section>

      <p className="text-muted-foreground/70 text-xs">Cadastrado por {place.createdBy.name}.</p>
    </article>
  );
}

export const dynamic = "force-dynamic";
