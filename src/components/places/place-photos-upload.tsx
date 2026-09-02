"use client";

import { useActionState, useEffect, useRef } from "react";

import type { FormState } from "@/actions/form-state";
import { uploadPlacePhoto } from "@/actions/photos";
import { Button } from "@/components/ui/button";

// Arquivo "use server" só exporta action, então o tipo do estado mora aqui.
type PhotoState = FormState & { photoId?: string };

const INITIAL: PhotoState = { ok: false };

/**
 * "📷 Mandar foto": o input fica escondido e envia sozinho na hora que a pessoa escolhe.
 * `capture="environment"` faz o celular abrir a câmera traseira direto — é pra usar na
 * rua, não pra garimpar na galeria.
 */
export function PlacePhotosUpload({ placeId }: { placeId: string }) {
  const [state, formAction, uploading] = useActionState(uploadPlacePhoto, INITIAL);
  const inputRef = useRef<HTMLInputElement>(null);

  // Limpa o input depois do envio, senão mandar a mesma foto de novo não dispara `change`.
  useEffect(() => {
    if (!uploading && inputRef.current) inputRef.current.value = "";
  }, [uploading, state]);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="placeId" value={placeId} />
        <input
          ref={inputRef}
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Mandar foto do lugar"
          onChange={(event) => {
            if (event.currentTarget.files?.length) event.currentTarget.form?.requestSubmit();
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-10"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Enviando…" : "📷 Mandar foto"}
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
