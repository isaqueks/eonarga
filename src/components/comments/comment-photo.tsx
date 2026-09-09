"use client";

import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** O que a foto de um comentário precisa pra aparecer: a URL e, quando tem, a proporção. */
export interface CommentPhotoView {
  url: string;
  /** Dimensões da variante grande; 0 quando não se sabe (prévia otimista). */
  width: number;
  height: number;
}

/**
 * A foto de um comentário (docs/08 #52): menor que a de post, encostada à esquerda
 * como uma mensagem, com a proporção reservada antes de carregar. Tocar abre em tela
 * cheia, igual à foto do post.
 */
export function CommentPhoto({
  photo,
  authorName,
  className,
}: {
  photo: CommentPhotoView;
  authorName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const alt = `Foto de ${authorName}`;
  const ratio =
    photo.width > 0 && photo.height > 0 ? `${photo.width} / ${photo.height}` : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver a foto de ${authorName} em tela cheia`}
        className={cn(
          "border-border bg-muted focus-visible:ring-ring/50 block w-full max-w-64 overflow-hidden rounded-lg border outline-none focus-visible:ring-3",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={alt}
          width={photo.width || undefined}
          height={photo.height || undefined}
          loading="lazy"
          decoding="async"
          style={ratio ? { aspectRatio: ratio } : undefined}
          className="max-h-80 w-full object-cover"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-1rem)] p-2 sm:max-w-lg">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={alt}
            width={photo.width || undefined}
            height={photo.height || undefined}
            decoding="async"
            className="bg-muted max-h-[75vh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
