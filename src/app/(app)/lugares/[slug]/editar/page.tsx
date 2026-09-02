import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlaceForm } from "@/components/places/place-form";
import { Button } from "@/components/ui/button";
import { updatePlace } from "@/actions/places";
import { requireUser } from "@/lib/auth/guards";
import { MAP_CENTER } from "@/lib/config";
import { listCategories } from "@/lib/queries/categories";
import { getPlaceBySlug } from "@/lib/queries/places";

export async function generateMetadata({
  params,
}: PageProps<"/lugares/[slug]/editar">): Promise<Metadata> {
  const { slug } = await params;
  const current = await requireUser();
  const place = await getPlaceBySlug(slug, current.user.id);
  return { title: place ? `Editar ${place.name}` : "Editar lugar" };
}

export default async function EditarLugarPage({ params }: PageProps<"/lugares/[slug]/editar">) {
  const { slug } = await params;
  const { user } = await requireUser();

  const [place, categories] = await Promise.all([getPlaceBySlug(slug, user.id), listCategories()]);
  if (!place) notFound();

  // Nome, categoria e posição são do criador (ou admin); o resto qualquer membro ajusta.
  const canEditCore = place.createdBy.id === user.id || user.role === "admin";

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11"
          nativeButton={false}
          render={<Link href={`/lugares/${place.slug}`} />}
        >
          <ArrowLeft className="size-5" aria-hidden />
          <span className="sr-only">Voltar pra ficha</span>
        </Button>
        <h1 className="font-display text-xl">Editar lugar</h1>
      </header>

      <PlaceForm
        categories={categories}
        action={updatePlace}
        canEditCore={canEditCore}
        showPositionPicker
        center={MAP_CENTER}
        submitLabel="Salvar mudanças"
        initial={{
          id: place.id,
          name: place.name,
          categoryId: place.category.id,
          lat: String(place.lat),
          lng: String(place.lng),
          address: place.address ?? "",
          description: place.description ?? "",
          tips: place.tips ?? "",
          instagram: place.instagram ?? "",
          website: place.website ?? "",
          priceLevel: place.priceLevel ? String(place.priceLevel) : "",
          hasNarga: place.hasNarga,
          googleMapsUrl: place.googleMapsUrl ?? "",
          googlePlaceId: place.googlePlaceId ?? "",
        }}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
