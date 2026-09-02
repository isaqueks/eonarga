"use client";

import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { deletePhoto } from "@/actions/photos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import type { PhotoItem } from "@/lib/queries/photos";

/** O "há 2 dias" vem calculado do servidor pra não desandar na hidratação. */
export type GalleryPhoto = PhotoItem & { when: string };

/** Arrasto mínimo (px) pra contar como "próxima"/"anterior" no celular. */
const SWIPE_PX = 40;

/**
 * Grade de fotos do lugar + visualizador em tela cheia. Cliente porque abre diálogo,
 * troca de foto com gesto/seta e chama a action de apagar.
 */
export function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [index, setIndex] = useState<number | null>(null);

  // Depois de apagar, a lista revalidada pode ser menor (ou vazia): o índice se ajusta
  // sozinho aqui, e o diálogo fecha quando não sobrou foto nenhuma.
  const current = index === null ? null : (photos[Math.min(index, photos.length - 1)] ?? null);

  function go(step: number) {
    setIndex((prev) => {
      if (prev === null || photos.length === 0) return prev;
      return (prev + step + photos.length) % photos.length;
    });
  }

  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="border-border focus-visible:ring-ring/50 bg-muted block aspect-square w-full overflow-hidden rounded-lg border outline-none focus-visible:ring-3"
            >
              {/* Sem next/image: a rota é autenticada e o id já é imutável. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbUrl}
                alt={`Foto de ${photo.uploadedBy.name}`}
                width={400}
                height={400}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={current !== null} onOpenChange={(open) => setIndex(open ? index : null)}>
        {current ? (
          <DialogContent
            className="max-w-[calc(100%-1rem)] gap-3 p-3 sm:max-w-lg"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") go(-1);
              if (event.key === "ArrowRight") go(1);
            }}
          >
            <DialogTitle className="sr-only">Foto de {current.uploadedBy.name}</DialogTitle>
            <PhotoFrame photo={current} onSwipe={go} showArrows={photos.length > 1} />
            <PhotoFooter photo={current} onDeleted={() => setIndex(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

/** A foto grande, com as setas e o gesto de arrastar. */
function PhotoFrame({
  photo,
  onSwipe,
  showArrows,
}: {
  photo: GalleryPhoto;
  onSwipe: (step: number) => void;
  showArrows: boolean;
}) {
  const startX = useRef<number | null>(null);

  return (
    <div
      className="bg-muted relative overflow-hidden rounded-lg"
      onTouchStart={(event) => {
        startX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const from = startX.current;
        startX.current = null;
        const to = event.changedTouches[0]?.clientX;
        if (from === null || to === undefined) return;
        const delta = to - from;
        if (Math.abs(delta) >= SWIPE_PX) onSwipe(delta < 0 ? 1 : -1);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={`Foto de ${photo.uploadedBy.name}`}
        width={photo.width}
        height={photo.height}
        decoding="async"
        className="max-h-[65vh] w-full object-contain"
      />
      {showArrows ? (
        <>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Foto anterior"
            className="absolute top-1/2 left-1 size-11 -translate-y-1/2 bg-black/40 text-white hover:bg-black/60 hover:text-white"
            onClick={() => onSwipe(-1)}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Próxima foto"
            className="absolute top-1/2 right-1 size-11 -translate-y-1/2 bg-black/40 text-white hover:bg-black/60 hover:text-white"
            onClick={() => onSwipe(1)}
          >
            <ChevronRight className="size-5" aria-hidden />
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** Quem mandou, quando, e o botão de apagar (dono ou admin). */
function PhotoFooter({ photo, onDeleted }: { photo: GalleryPhoto; onDeleted: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!window.confirm("Apagar essa foto? Não tem desfazer.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePhoto(photo.id);
      if (result.ok) onDeleted();
      else setError(result.error ?? "Não rolou apagar.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <UserAvatar name={photo.uploadedBy.name} avatarId={photo.uploadedBy.avatarId} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{photo.uploadedBy.name}</span>
        {photo.when ? <span className="text-muted-foreground text-xs">{photo.when}</span> : null}
      </div>
      {photo.canDelete ? (
        <Button variant="destructive" size="sm" className="h-9" disabled={pending} onClick={remove}>
          <Trash2 className="size-3.5" aria-hidden />
          {pending ? "Apagando…" : "Apagar"}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive w-full text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
