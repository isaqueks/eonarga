"use client";

import { useActionState, useRef, useState, useTransition } from "react";

import type { FormState } from "@/actions/form-state";
import { removeAvatar, updateAvatar } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

// Arquivo "use server" só exporta action, então o tipo do estado mora aqui.
type AvatarState = FormState & { avatarId?: string | null };

const INITIAL: AvatarState = { ok: false };

export function ProfileAvatar({ name, avatarId }: { name: string; avatarId: string | null }) {
  const [state, formAction, uploading] = useActionState(updateAvatar, INITIAL);
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Enquanto o servidor não revalida, mostra o id que a action acabou de devolver.
  const shown = state.ok && state.avatarId !== undefined ? state.avatarId : avatarId;
  const busy = uploading || removing;
  const error = state.error ?? removeError;

  function handleRemove() {
    setRemoveError(null);
    startRemoving(async () => {
      const result = await removeAvatar();
      if (!result.ok) setRemoveError(result.error ?? "Não deu pra remover. Tenta de novo.");
    });
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar name={name} avatarId={shown} size="xl" />

      <div className="flex min-w-0 flex-col gap-2">
        {/* No celular, accept="image/*" já abre a opção de câmera. */}
        <form action={formAction}>
          <input
            ref={inputRef}
            type="file"
            name="avatar"
            accept="image/*"
            className="sr-only"
            aria-label="Escolher foto de perfil"
            onChange={(event) => {
              setRemoveError(null);
              if (event.currentTarget.files?.length) event.currentTarget.form?.requestSubmit();
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Enviando…" : shown ? "Trocar foto" : "Colocar foto"}
          </Button>
        </form>

        {shown ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-9 self-start px-2"
            disabled={busy}
            onClick={handleRemove}
          >
            {removing ? "Removendo…" : "Remover"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">JPG, PNG ou HEIC. Até 10 MB.</p>
        )}

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
