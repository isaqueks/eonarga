import Link from "next/link";

import { NargaStars } from "@/components/reviews/narga-stars";
import { UserAvatar } from "@/components/user-avatar";
import { formatDayMonth, relativeFromNow } from "@/lib/dates";
import { formatStars } from "@/lib/format";
import { previewText } from "@/lib/posts";
import type { FeedEvent } from "@/lib/queries/feed";
import { cn } from "@/lib/utils";

import { FeedLocation } from "./post-card";

type ReviewEvent = Extract<FeedEvent, { kind: "review" }>;

/**
 * Uma avaliação no feed, com o mesmo peso visual do post: quem deu a nota, de onde,
 * quantos nargas, o veredito e uma prévia do texto.
 *
 * O texto vem em texto puro (`htmlToText` no `listFeed`): no feed não tem por que
 * renderizar HTML da avaliação — quem quer ler inteiro vai pra ficha.
 */
export function ReviewFeedCard({ review, className }: { review: ReviewEvent; className?: string }) {
  const when = relativeFromNow(review.at);
  const visited = review.visitedAt ? formatDayMonth(review.visitedAt) : null;
  const preview = previewText(review.contentText);
  const href = `/lugares/${review.place.slug}#avaliacoes`;

  return (
    <article
      className={cn("border-border bg-card flex flex-col gap-2 rounded-xl border p-3", className)}
    >
      <div className="flex items-start gap-2">
        <UserAvatar name={review.user.name} avatarId={review.user.avatarId} size="md" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="leading-6 font-semibold">{review.user.name}</p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
            <time dateTime={review.at}>{when}</time>
            {visited ? (
              <>
                <span aria-hidden>·</span>
                <span>visitou em {visited}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <FeedLocation place={review.place} className="-mt-1" />

      <p className="flex items-center gap-1.5 text-sm">
        <NargaStars stars={review.stars} size="sm" />
        <span className="font-semibold tabular-nums">{formatStars(review.stars)}</span>
        <span className="text-muted-foreground">nargas</span>
      </p>

      <blockquote className="border-narga border-l-3 pl-3 text-[0.9375rem] leading-snug font-medium text-balance">
        {review.verdict}
      </blockquote>

      {preview.text ? (
        <p className="text-muted-foreground text-sm leading-snug">
          {preview.text}
          {preview.truncated ? (
            <>
              {"… "}
              <Link href={href} className="text-foreground font-medium hover:underline">
                ver avaliação
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
