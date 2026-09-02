import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { CategoryChips } from "@/components/places/category-chips";
import { PlaceCard } from "@/components/places/place-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { formatNames, shortAddress } from "@/lib/format";
import { listCategories } from "@/lib/queries/categories";
import { listPlaces, type PlaceListItem } from "@/lib/queries/places";
import { cn } from "@/lib/utils";

import { SortearButton, type SorteioCandidate } from "./sortear-button";

export const metadata: Metadata = { title: "Rolê" };

type Tab = "want" | "visited";

function buildHref(base: URLSearchParams, patch: Record<string, string | null>) {
  const params = new URLSearchParams(base.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `/role?${query}` : "/role";
}

function peopleLine(place: PlaceListItem, tab: Tab): string | null {
  const people = tab === "want" ? place.wantUsers : place.visitedUsers;
  if (people.length === 0) return null;
  const names = formatNames(people.map((u) => u.name));
  if (tab === "want") return `${names} ${people.length === 1 ? "quer ir" : "querem ir"}`;
  return `${names} já ${people.length === 1 ? "foi" : "foram"}`;
}

function peopleNote(place: PlaceListItem, tab: Tab) {
  const line = peopleLine(place, tab);
  if (!line) return null;
  return <p className="text-narga text-xs font-medium">{line}</p>;
}

/** Lugares da aba, já filtrados pelo "só eu". A categoria vem filtrada da query. */
function forTab(places: PlaceListItem[], tab: Tab, onlyMe: boolean): PlaceListItem[] {
  return places
    .filter((place) => {
      const people = tab === "want" ? place.wantUsers : place.visitedUsers;
      if (people.length === 0) return false;
      // Por padrão mostra o grupo inteiro — nada é privado aqui (docs/01).
      return onlyMe ? place.myStatus === tab : true;
    })
    .sort((a, b) => {
      if (tab === "want") {
        const diff = b.wantUsers.length - a.wantUsers.length;
        if (diff !== 0) return diff;
      }
      return a.name.localeCompare(b.name, "pt-BR");
    });
}

/** O que a roleta sorteia: sempre a lista "quero ir", mesmo estando na aba "Já fui". */
function toCandidate(place: PlaceListItem): SorteioCandidate {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    emoji: place.category.emoji,
    address: shortAddress(place.address),
    people: peopleLine(place, "want") ?? "",
  };
}

export default async function RolePage({ searchParams }: PageProps<"/role">) {
  const { user } = await requireUser();
  const params = await searchParams;

  const tab: Tab = params.tab === "visited" ? "visited" : "want";
  const onlyMe = params.eu === "1";
  const cat = typeof params.cat === "string" ? params.cat : undefined;
  const tag = typeof params.tag === "string" && params.tag ? params.tag : undefined;

  const current = new URLSearchParams();
  if (params.tab === "visited") current.set("tab", "visited");
  if (onlyMe) current.set("eu", "1");
  if (cat) current.set("cat", cat);
  if (tag) current.set("tag", tag);

  const [categories, places] = await Promise.all([
    listCategories(),
    listPlaces({ userId: user.id, categorySlug: cat, tag }),
  ]);

  const items = forTab(places, tab, onlyMe);
  const candidates = (tab === "want" ? items : forTab(places, "want", onlyMe)).map(toCandidate);

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <nav className="border-border flex gap-1 border-b" aria-label="Listas do rolê">
        <TabLink href={buildHref(current, { tab: null })} active={tab === "want"}>
          Quero ir
        </TabLink>
        <TabLink href={buildHref(current, { tab: "visited" })} active={tab === "visited"}>
          Já fui
        </TabLink>
      </nav>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={buildHref(current, { eu: onlyMe ? null : "1" })}
          role="button"
          aria-pressed={onlyMe}
          scroll={false}
          className={cn(
            "focus-visible:ring-ring/50 flex h-11 items-center rounded-full border px-4 text-sm font-medium outline-none focus-visible:ring-3",
            onlyMe
              ? "border-foreground/40 bg-secondary text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          só eu
        </Link>
        <SortearButton candidates={candidates} />
      </div>

      <CategoryChips categories={categories} />

      {items.length === 0 ? (
        <EmptyState
          size="lg"
          title="Lista vazia. Isso é sério?"
          description={
            tab === "want"
              ? "Marca ♡ Quero ir na ficha de um lugar e ele aparece aqui."
              : "Marca ✓ Já fui na ficha de um lugar e ele aparece aqui."
          }
        >
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
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((place) => (
            <li key={place.id}>
              <PlaceCard place={place} note={peopleNote(place, tab)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-medium",
        active
          ? "border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {children}
    </Link>
  );
}

export const dynamic = "force-dynamic";
