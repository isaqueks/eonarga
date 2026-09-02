import type { Metadata } from "next";

import { CategoryChips } from "@/components/places/category-chips";
import { TagChips } from "@/components/places/tag-chips";
import { requireUser } from "@/lib/auth/guards";
import { MAP_CENTER, MAP_DEFAULT_ZOOM } from "@/lib/config";
import { listCategories } from "@/lib/queries/categories";
import { listPlaces } from "@/lib/queries/places";

import { MapView } from "./map-view";

export const metadata: Metadata = { title: "Mapa" };

export default async function MapaPage({ searchParams }: PageProps<"/mapa">) {
  const { user } = await requireUser();
  const params = await searchParams;
  const cat = typeof params.cat === "string" ? params.cat : undefined;
  const tag = typeof params.tag === "string" ? params.tag : undefined;

  const [categories, places] = await Promise.all([
    listCategories(),
    listPlaces({ userId: user.id, categorySlug: cat, tag }),
  ]);

  return (
    // Altura disponível = viewport − header (3.5rem) − espaço da bottom nav (5rem + safe area).
    <div className="flex h-[calc(100dvh-3.5rem-5rem-env(safe-area-inset-bottom))] flex-col gap-2 p-4">
      <div className="shrink-0">
        <CategoryChips categories={categories} />
      </div>
      {/* Sem a linha de tags (a tela é curta): só a chip pra tirar o filtro que veio no link. */}
      <TagChips tags={[]} activeTag={tag ?? null} params={params} basePath="/mapa" />
      <div className="min-h-0 flex-1">
        <MapView places={places} center={MAP_CENTER} zoom={MAP_DEFAULT_ZOOM} />
      </div>
      {places.length === 0 ? (
        <p className="text-muted-foreground shrink-0 text-center text-xs">
          Nenhum pino por aqui ainda. E o narga?
        </p>
      ) : null}
    </div>
  );
}

export const dynamic = "force-dynamic";
