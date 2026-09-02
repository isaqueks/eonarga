import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReviewForm } from "@/components/reviews/review-form";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { todayISODate } from "@/lib/dates";
import { getPlaceBySlug } from "@/lib/queries/places";
import { getMyReview } from "@/lib/queries/reviews";

export async function generateMetadata({
  params,
}: PageProps<"/lugares/[slug]/avaliar">): Promise<Metadata> {
  const { slug } = await params;
  const { user } = await requireUser();
  const place = await getPlaceBySlug(slug, user.id);
  return { title: place ? `Sua nota pra ${place.name}` : "Avaliar" };
}

export default async function AvaliarPage({
  params,
  searchParams,
}: PageProps<"/lugares/[slug]/avaliar">) {
  const { slug } = await params;
  const { user } = await requireUser();
  const place = await getPlaceBySlug(slug, user.id);
  // Arquivado não recebe nota nova: some do ranking e do mapa (docs/01).
  if (!place || place.status === "archived") notFound();

  const [query, mine] = await Promise.all([searchParams, getMyReview(place.id, user.id)]);
  // Veio do passo 2 do cadastro: aqui é o passo 3 e dá pra pular.
  const fromWizard = query.novo === "1";

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-start gap-2">
        {fromWizard ? null : (
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 shrink-0"
            nativeButton={false}
            render={<Link href={`/lugares/${place.slug}`} />}
          >
            <ArrowLeft className="size-5" aria-hidden />
            <span className="sr-only">Voltar pra ficha</span>
          </Button>
        )}
        <div className="flex flex-1 flex-col">
          {fromWizard ? <p className="text-muted-foreground text-xs font-medium">3 de 3</p> : null}
          <h1 className="font-display text-xl leading-tight text-balance">
            Sua nota pra {place.name}
          </h1>
          {fromWizard ? (
            <p className="text-muted-foreground text-sm">Última coisa: sua nota. Ou pula.</p>
          ) : null}
        </div>
      </header>

      {fromWizard ? (
        <div className="bg-secondary h-1 overflow-hidden rounded-full" aria-hidden>
          <div className="bg-primary h-full w-full rounded-full" />
        </div>
      ) : null}

      <ReviewForm
        placeId={place.id}
        today={todayISODate()}
        initial={
          mine
            ? {
                rating: mine.rating,
                verdict: mine.verdict,
                contentHtml: mine.contentHtml,
                visitedAt: mine.visitedAt,
              }
            : undefined
        }
      />

      {fromWizard ? (
        <Link
          href={`/lugares/${place.slug}`}
          className="text-muted-foreground hover:text-foreground flex h-11 items-center justify-center text-sm underline-offset-4 hover:underline"
        >
          Pular por agora
        </Link>
      ) : null}
    </div>
  );
}

export const dynamic = "force-dynamic";
