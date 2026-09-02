import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { requireUser } from "@/lib/auth/guards";
import { relativeFromNow } from "@/lib/dates";
import { formatStars } from "@/lib/format";
import { feedEventKey, listFeed, type FeedEvent } from "@/lib/queries/feed";

export const metadata: Metadata = { title: "Novidades" };

export const dynamic = "force-dynamic";

/** Quantos eventos por página. O "carregar mais" leva o `at` do último no `?before=`. */
const PAGE_SIZE = 30;

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  await requireUser();
  const params = await searchParams;
  const before = typeof params.before === "string" ? params.before : undefined;

  const events = await listFeed({ limit: PAGE_SIZE, before });
  const last = events.at(-1);
  const hasMore = events.length === PAGE_SIZE && last;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-xl">Novidades</h1>
        {before ? (
          <Link href="/feed" className="text-muted-foreground hover:text-foreground text-sm">
            voltar pro começo
          </Link>
        ) : null}
      </header>

      {events.length === 0 ? (
        before ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Acabou. Não tem nada mais antigo que isso.
          </p>
        ) : (
          <EmptyState size="lg" title="Nada aconteceu ainda." description="Vai lá fazer acontecer.">
            <Button
              variant="outline"
              size="lg"
              className="h-11"
              nativeButton={false}
              render={<Link href="/" />}
            >
              Ver o ranking
            </Button>
          </EmptyState>
        )
      ) : (
        <ul className="flex flex-col">
          {events.map((event) => (
            <li
              key={feedEventKey(event)}
              className="border-border flex gap-3 border-b py-3 last:border-b-0"
            >
              <UserAvatar name={event.user.name} avatarId={event.user.avatarId} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm leading-5 text-pretty">
                  <EventText event={event} />
                </p>
                <time dateTime={event.at} className="text-muted-foreground text-xs">
                  {relativeFromNow(event.at)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <Button
          variant="outline"
          size="lg"
          className="h-11 self-center"
          nativeButton={false}
          render={<Link href={`/feed?before=${encodeURIComponent(last.at)}`} />}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}

/** Nome do lugar com o emoji da categoria, linkando pra ficha. */
function PlaceLink({ place }: { place: FeedEvent["place"] }) {
  return (
    <Link href={`/lugares/${place.slug}`} className="font-semibold hover:underline">
      <span aria-hidden>{place.emoji} </span>
      {place.name}
    </Link>
  );
}

function Who({ name }: { name: string }) {
  return <span className="font-semibold">{name}</span>;
}

function EventText({ event }: { event: FeedEvent }) {
  switch (event.kind) {
    case "review":
      return (
        <>
          <Who name={event.user.name} /> deu {formatStars(event.stars)} nargas pro{" "}
          <PlaceLink place={event.place} />:{" "}
          <span className="text-muted-foreground italic">“{event.verdict}”</span>
        </>
      );

    case "place":
      return (
        <>
          <Who name={event.user.name} /> adicionou <PlaceLink place={event.place} />
        </>
      );

    case "status":
      return (
        <>
          <Who name={event.user.name} /> {event.status === "want" ? "quer ir no" : "já foi no"}{" "}
          <PlaceLink place={event.place} />
        </>
      );

    case "reaction":
      return (
        <>
          <Who name={event.user.name} /> reagiu <span aria-hidden>{event.emoji}</span> na nota de{" "}
          {event.reviewAuthor} em <PlaceLink place={event.place} />
        </>
      );

    case "call":
      return (
        <>
          <Who name={event.user.name} /> chamou a galera pro <PlaceLink place={event.place} />
        </>
      );
  }
}
