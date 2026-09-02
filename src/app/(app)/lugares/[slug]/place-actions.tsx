"use client";

import { Archive, ArchiveRestore, Link2, MoreHorizontal, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

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
 * campos); arquivar/desarquivar só pra quem criou ou admin (docs/05). "Copiar link
 * público" só existe quando o servidor conseguiu assinar um token (`APP_SECRET`).
 */
export function PlaceActions({
  placeId,
  slug,
  name,
  canArchive,
  archived,
  shareUrl,
}: {
  placeId: string;
  slug: string;
  name: string;
  canArchive: boolean;
  archived: boolean;
  /** `${APP_URL}/p/<slug>?t=<token>`, ou `null` quando o app não tem segredo configurado. */
  shareUrl?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3_000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyShareUrl() {
    if (!shareUrl) return;
    setError(null);
    // Sem APP_URL o servidor manda caminho relativo; a origem atual completa.
    const absolute = new URL(shareUrl, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
    } catch {
      // Contexto sem clipboard (http sem ser localhost, WebView velha): mostra pra copiar na mão.
      window.prompt("Copia esse link:", absolute);
    }
  }

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
          {shareUrl ? (
            <DropdownMenuItem
              onClick={copyShareUrl}
              className="min-h-10 px-2"
              // O e2e lê o link daqui em vez de brigar com a área de transferência.
              data-share-url={shareUrl}
            >
              <Link2 className="size-4" aria-hidden />
              Copiar link público
            </DropdownMenuItem>
          ) : null}
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
      {copied ? <p className="text-muted-foreground text-xs">Copiado! Cola no zap.</p> : null}
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
