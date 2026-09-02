import Link from "next/link";

import { NargaStars } from "@/components/reviews/narga-stars";
import { relativeFromNow } from "@/lib/dates";
import { listReviewsByUser, type Viewer } from "@/lib/queries/reviews";

/**
 * "Minhas avaliações" do perfil. Server component: a data relativa sai pronta do
 * servidor e o link leva pra ficha (é lá que dá pra editar).
 */
export async function MyReviews({ userId, viewer }: { userId: string; viewer: Viewer }) {
  const reviews = await listReviewsByUser(userId, viewer);

  if (reviews.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Nada ainda. Vai lá dar nota em alguma coisa.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {reviews.map((review) => (
        <li key={review.id}>
          <Link
            href={`/lugares/${review.place.slug}`}
            className="border-border bg-card focus-visible:ring-ring/50 hover:bg-secondary/40 flex flex-col gap-1.5 rounded-lg border p-3 transition-colors outline-none focus-visible:ring-3"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden className="text-lg leading-6">
                {review.place.emoji}
              </span>
              <h3 className="min-w-0 flex-1 leading-6 font-semibold text-balance">
                {review.place.name}
              </h3>
            </div>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <NargaStars stars={review.stars} size="sm" />
              <span>{relativeFromNow(review.updatedAt)}</span>
            </div>

            <blockquote className="border-narga/60 border-l-2 pl-2 text-sm italic">
              “{review.verdict}”
            </blockquote>
          </Link>
        </li>
      ))}
    </ul>
  );
}
