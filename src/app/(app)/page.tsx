import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { CategoryChips } from "@/components/places/category-chips";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { PushNudge } from "@/components/pwa/push-nudge";
import { RankingControls } from "@/components/places/ranking-controls";
import { TagChips, TOP_TAGS } from "@/components/places/tag-chips";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { listCategories } from "@/lib/queries/categories";
import {
  getGlobalRatingStats,
  listPlaces,
  listTagsWithCounts,
  type PlaceListItem,
} from "@/lib/queries/places";
import { globalMean, parseRankingSort, rank, type Ranked, type RankingSort } from "@/lib/ranking";

import { RankingList, type RankedPlace } from "./ranking-list";

interface Entry {
  place: PlaceListItem;
  name: string;
  sumOfStars: number;
  count: number;
  lastReviewAt: string | null;
}

/**
 * Reordena o ranking já calculado. A posição segue vindo do score bayesiano: em
 * "melhores" ela aparece 1, 2, 3…; em "piores" a mesma lista de trás pra frente
 * (por isso os números descem). Nas outras ordens o número some, porque ali a
 * ordem não é a do ranking.
 */
function arrange(ranked: Ranked<Entry>[], sort: RankingSort): RankedPlace[] {
  switch (sort) {
    case "piores":
      return [...ranked]
        .reverse()
        .map((entry) => ({ place: entry.item.place, position: entry.position }));
    case "mais-avaliados":
      return [...ranked]
        .sort(
          (a, b) =>
            b.item.count - a.item.count ||
            b.mean - a.mean ||
            a.item.name.localeCompare(b.item.name, "pt-BR"),
        )
        .map((entry) => ({ place: entry.item.place }));
    case "recentes":
      // `lastReviewAt` é ISO, então comparar como texto já ordena por data.
      return [...ranked]
        .sort(
          (a, b) =>
            (b.item.lastReviewAt ?? "").localeCompare(a.item.lastReviewAt ?? "") ||
            a.item.name.localeCompare(b.item.name, "pt-BR"),
        )
        .map((entry) => ({ place: entry.item.place }));
    default:
      return ranked.map((entry) => ({ place: entry.item.place, position: entry.position }));
  }
}

export default async function RankingPage({ searchParams }: PageProps<"/">) {
  const { user } = await requireUser();
  const params = await searchParams;
  const cat = typeof params.cat === "string" ? params.cat : undefined;
  const tag = typeof params.tag === "string" ? params.tag : undefined;

  const sort = parseRankingSort(params.sort);
  const onlyNarga = params.narga === "1";
  const visitedFilter = params.fui === "1" ? "yes" : params.fui === "0" ? "no" : null;

  const [categories, places, stats, tags] = await Promise.all([
    listCategories(),
    listPlaces({ userId: user.id, categorySlug: cat, tag }),
    getGlobalRatingStats(),
    listTagsWithCounts(),
  ]);

  const filtered = places.filter((place) => {
    if (onlyNarga && place.hasNarga !== "yes") return false;
    if (visitedFilter === "yes" && place.myStatus !== "visited") return false;
    if (visitedFilter === "no" && place.myStatus === "visited") return false;
    return true;
  });

  // `m` é a média global mesmo com filtro de categoria, pra rankings de categorias
  // diferentes continuarem comparáveis (docs/03).
  const mean = globalMean(stats.totalStars, stats.totalCount);
  const ranked = arrange(
    rank<Entry>(
      filtered.map((place) => ({
        place,
        name: place.name,
        sumOfStars: (place.meanStars ?? 0) * place.reviewCount,
        count: place.reviewCount,
        lastReviewAt: place.lastReviewAt,
      })),
      mean,
    ),
    sort,
  );

  const unrated = filtered.filter((place) => place.reviewCount === 0);
  // Com filtro de tag na URL, a lista já vem cortada: "nenhum lugar ainda" só vale sem filtro.
  const nothingAtAll = places.length === 0 && !tag;
  const nothingWithFilter = filtered.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <CategoryChips categories={categories} />
      <TagChips
        tags={tags.slice(0, TOP_TAGS)}
        activeTag={tag ?? null}
        params={params}
        basePath="/"
      />
      <InstallAppButton />
      <PushNudge />
      {nothingAtAll ? null : <RankingControls />}

      {nothingAtAll ? (
        <EmptyState
          size="lg"
          title="Nenhum lugar ainda. E o narga?"
          description="O ranking aparece aqui quando alguém cadastrar o primeiro lugar."
        >
          <Button
            size="lg"
            className="h-11"
            nativeButton={false}
            render={<Link href="/lugares/novo" />}
          >
            Adicionar o primeiro
          </Button>
        </EmptyState>
      ) : nothingWithFilter ? (
        <EmptyState
          title="Nada com esse filtro."
          description="Bora descobrir? Tira o filtro ou cadastra um lugar assim."
        >
          <Button
            size="lg"
            className="h-11"
            nativeButton={false}
            render={<Link href="/lugares/novo" />}
          >
            Adicionar lugar
          </Button>
        </EmptyState>
      ) : (
        <RankingList ranked={ranked} unrated={unrated} />
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
