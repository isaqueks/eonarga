"use client";

import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { PostPhoto as PostPhotoData } from "@/lib/queries/posts";

/**
 * A foto do post: largura total do card, com a proporção da imagem reservada antes
 * de ela carregar (nada de layout pulando). Tocar abre em tela cheia.
 *
 * Sem `next/image`: a rota é autenticada e o id já é imutável (mesmo motivo da galeria).
 */
export function PostPhoto({ photo, authorName }: { photo: PostPhotoData; authorName: string }) {
  const [open, setOpen] = useState(false);
  const alt = `Foto de ${authorName}`;
  const ratio = photo.width > 0 && photo.height > 0 ? `${photo.width} / ${photo.height}` : "4 / 3";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver a foto de ${authorName} em tela cheia`}
        className="border-border focus-visible:ring-ring/50 bg-muted block w-full overflow-hidden rounded-lg border outline-none focus-visible:ring-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={alt}
          width={photo.width || undefined}
          height={photo.height || undefined}
          loading="lazy"
          decoding="async"
          style={{ aspectRatio: ratio }}
          className="w-full object-cover"
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
