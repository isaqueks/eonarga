"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { archivePlace, unarchivePlace } from "@/actions/places";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Menu "⋯" da ficha. "Editar" aparece pra qualquer membro (o formulário limita os
 * campos); arquivar/desarquivar só pra quem criou ou admin (docs/05).
 */
export function PlaceActions({
  placeId,
  slug,
  name,
  canArchive,
  archived,
}: {
  placeId: string;
  slug: string;
  name: string;
  canArchive: boolean;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function archive() {
    if (!window.confirm(`Arquivar ${name}? Some do ranking e do mapa; as avaliações ficam.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await archivePlace(placeId);
      if (!result.ok) setError(result.error ?? "Não rolou arquivar.");
    });
  }

  function unarchive() {
    setError(null);
    startTransition(async () => {
      const result = await unarchivePlace(placeId);
      if (!result.ok) setError(result.error ?? "Não rolou desarquivar.");
    });
  }

  return (
    <div className="flex flex-col items-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-lg" className="size-11" aria-label="Mais ações">
              <MoreHorizontal className="size-5" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            render={<Link href={`/lugares/${slug}/editar`} />}
            className="min-h-10 px-2"
          >
            <Pencil className="size-4" aria-hidden />
            Editar
          </DropdownMenuItem>
          {canArchive ? (
            <>
              <DropdownMenuSeparator />
              {archived ? (
                <DropdownMenuItem onClick={unarchive} disabled={pending} className="min-h-10 px-2">
                  <ArchiveRestore className="size-4" aria-hidden />
                  Desarquivar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={archive}
                  disabled={pending}
                  className="min-h-10 px-2"
                >
                  <Archive className="size-4" aria-hidden />
                  Arquivar
                </DropdownMenuItem>
              )}
            </>
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

/** Botão direto da faixa "Arquivado" — não obriga a abrir o menu. */
export function UnarchiveButton({ placeId }: { placeId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await unarchivePlace(placeId);
            if (!result.ok) setError(result.error ?? "Não rolou desarquivar.");
          });
        }}
      >
        <ArchiveRestore className="size-3.5" aria-hidden />
        Desarquivar
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
