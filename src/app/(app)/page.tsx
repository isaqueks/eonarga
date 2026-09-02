import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { CategoryChips } from "@/components/places/category-chips";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { listCategories } from "@/lib/queries/categories";
import { getGlobalRatingStats, listPlaces } from "@/lib/queries/places";
import { globalMean, rank } from "@/lib/ranking";

import { RankingList, type RankedPlace } from "./ranking-list";

export default async function RankingPage({ searchParams }: PageProps<"/">) {
  const { user } = await requireUser();
  const params = await searchParams;
  const cat = typeof params.cat === "string" ? params.cat : undefined;

  const [categories, places, stats] = await Promise.all([
    listCategories(),
    listPlaces({ userId: user.id, categorySlug: cat }),
    getGlobalRatingStats(),
  ]);

  // `m` é a média global mesmo com filtro de categoria, pra rankings de categorias
  // diferentes continuarem comparáveis (docs/03).
  const mean = globalMean(stats.totalStars, stats.totalCount);
  const ranked: RankedPlace[] = rank(
    places.map((place) => ({
      place,
      name: place.name,
      sumOfStars: (place.meanStars ?? 0) * place.reviewCount,
      count: place.reviewCount,
      lastReviewAt: place.lastReviewAt,
    })),
    mean,
  ).map((entry) => ({ place: entry.item.place, position: entry.position }));

  const unrated = places.filter((place) => place.reviewCount === 0);
  const empty = places.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <CategoryChips categories={categories} />

      {empty ? (
        cat ? (
          <EmptyState
            title="Nada com esse filtro."
            description="Bora descobrir? Tira o filtro ou cadastra um lugar dessa categoria."
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
        )
      ) : (
        <RankingList ranked={ranked} unrated={unrated} />
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
