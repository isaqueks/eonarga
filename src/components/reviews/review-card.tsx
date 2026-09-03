import { CommentThread, type CommentView } from "@/components/comments/comment-thread";
import { UserAvatar } from "@/components/user-avatar";
import { formatDayMonth, relativeFromNow } from "@/lib/dates";
import type { ReviewItem } from "@/lib/queries/reviews";
import { cn } from "@/lib/utils";

import { NargaStars } from "./narga-stars";
import { ReactionBar } from "./reaction-bar";
import { ReviewContent } from "./review-content";
import { ReviewMenu } from "./review-menu";

/**
 * Uma avaliação na ficha. Server component: a data relativa é calculada uma vez, no
 * servidor, e não desanda na hidratação. Só a barra de reações e o menu são cliente.
 */
export function ReviewCard({
  review,
  placeSlug,
  viewerId,
  canEdit = true,
  className,
}: {
  review: ReviewItem;
  placeSlug: string;
  /** Pra saber se a confirmação de apagar fala "sua avaliação". */
  viewerId: string;
  /** Lugar arquivado não recebe nota nova, então "Editar" some (levaria a um 404). */
  canEdit?: boolean;
  className?: string;
}) {
  const when = relativeFromNow(review.updatedAt);
  const visited = review.visitedAt ? formatDayMonth(review.visitedAt) : null;
  // O "há x" de cada resposta sai daqui, do servidor, pelo mesmo motivo do de cima.
  const comments: CommentView[] = review.comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    when: relativeFromNow(comment.createdAt),
    authorName: comment.author.name,
    authorAvatarId: comment.author.avatarId,
    canDelete: comment.canDelete,
  }));

  return (
    <article
      className={cn("border-border bg-card flex flex-col gap-2 rounded-xl border p-3", className)}
    >
      <div className="flex items-start gap-2">
        <UserAvatar name={review.author.name} avatarId={review.author.avatarId} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="leading-6 font-semibold">{review.author.name}</p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <NargaStars stars={review.stars} size="sm" />
            {when ? <span>{when}</span> : null}
            {visited ? (
              <>
                <span aria-hidden>·</span>
                <span>visitou em {visited}</span>
              </>
            ) : null}
          </div>
        </div>
        <ReviewMenu
          reviewId={review.id}
          editHref={`/lugares/${placeSlug}/avaliar?review=${review.id}`}
          canEdit={review.canEdit && canEdit}
          canDelete={review.canDelete}
          ownReview={review.author.id === viewerId}
          authorName={review.author.name}
        />
      </div>

      <blockquote className="border-narga border-l-3 pl-3 text-[0.9375rem] leading-snug font-medium text-balance">
        {review.verdict}
      </blockquote>

      <ReviewContent html={review.contentHtml} />

      <ReactionBar
        target={{ type: "review", id: review.id }}
        reactions={review.reactions}
        className="pt-1"
      />

      <CommentThread
        target={{ type: "review", id: review.id }}
        comments={comments}
        canReply={canEdit}
        className="border-border/60 border-t pt-2"
      />
    </article>
  );
}
