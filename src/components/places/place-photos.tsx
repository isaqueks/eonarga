import { relativeFromNow } from "@/lib/dates";
import { listPhotosForPlace, type PhotoViewer } from "@/lib/queries/photos";

import { PhotoGallery } from "./photo-lightbox";
import { PlacePhotosUpload } from "./place-photos-upload";

/**
 * Seção "Fotos (n)" da ficha. Server component: busca as fotos e calcula o "há x" aqui,
 * uma vez, deixando pro cliente só a grade que abre o visualizador.
 */
export async function PlacePhotos({
  placeId,
  viewer,
  canUpload,
}: {
  placeId: string;
  viewer: PhotoViewer;
  /** Lugar arquivado não recebe foto nova. */
  canUpload: boolean;
}) {
  const photos = await listPhotosForPlace(placeId, viewer);
  const items = photos.map((photo) => ({ ...photo, when: relativeFromNow(photo.createdAt) }));

  return (
    <section id="fotos" className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Fotos ({items.length})</h2>
        {canUpload ? <PlacePhotosUpload placeId={placeId} /> : null}
      </div>

      {items.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          Sem fotos. Alguém tira uma?
        </p>
      ) : (
        <PhotoGallery photos={items} />
      )}
    </section>
  );
}
