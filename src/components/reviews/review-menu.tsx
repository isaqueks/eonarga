"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { deleteReview } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menu "⋯" de uma avaliação: editar (só o autor) e apagar (autor ou admin). */
export function ReviewMenu({
  reviewId,
  editHref,
  canEdit,
  canDelete,
  ownReview,
  authorName,
}: {
  reviewId: string;
  editHref: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Muda o texto da confirmação quando é um admin apagando a avaliação de outra pessoa. */
  ownReview: boolean;
  authorName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canEdit && !canDelete) return null;

  function remove() {
    const question = ownReview
      ? "Apagar sua avaliação? A nota some do ranking e não dá pra desfazer."
      : `Apagar a avaliação de ${authorName}? Não dá pra desfazer.`;
    if (!window.confirm(question)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteReview(reviewId);
      if (!result.ok) setError(result.error ?? "Não rolou apagar.");
    });
  }

  return (
    <div className="flex flex-col items-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11 shrink-0"
              aria-label={`Ações da avaliação de ${authorName}`}
            >
              <MoreHorizontal className="size-5" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          {canEdit ? (
            <DropdownMenuItem render={<Link href={editHref} />} className="min-h-10 px-2">
              <Pencil className="size-4" aria-hidden />
              Editar
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={remove}
              disabled={pending}
              className="min-h-10 px-2"
            >
              <Trash2 className="size-4" aria-hidden />
              Apagar
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
