"use client";

import { useEffect } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/report-client-error";

/**
 * Página antiga (o PWA fica dias aberto) batendo num servidor novo: a server action não
 * existe mais e o Next responde "Failed to find Server Action" / "Server action not
 * found". Recarregar resolve, e é o que a tela faz sozinha, uma vez por versão.
 */
const STALE_ACTION = /server action/i;
const RELOADED_KEY = "eonarga:reloaded-for-version";
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/**
 * Erro inesperado em qualquer rota. No Next 16 a prop é `retry()` (o `reset()` antigo
 * só limpa o boundary; `retry()` busca de novo, que é o que "tenta de novo" promete).
 * O erro vai pro log do servidor (docs/08 #54): sem isso, o que quebra no celular de
 * alguém some sem deixar rastro.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const stale = STALE_ACTION.test(error.message);

  useEffect(() => {
    console.error(error);
    reportClientError({ message: error.message, digest: error.digest, stack: error.stack });
    if (!stale) return;
    try {
      // Uma recarga por versão: se o servidor ainda reclamar, a pessoa vê o botão.
      if (window.sessionStorage.getItem(RELOADED_KEY) === VERSION) return;
      window.sessionStorage.setItem(RELOADED_KEY, VERSION);
    } catch {
      // Sem sessionStorage, recarrega mesmo assim (uma vez por montagem).
    }
    window.location.reload();
  }, [error, stale]);

  return (
    <main className="flex flex-1 flex-col">
      <EmptyState
        size="lg"
        title={stale ? "Tem versão nova do app." : "Deu ruim do nosso lado."}
        description={stale ? "Recarregando…" : "Tenta de novo."}
      >
        <Button
          size="lg"
          className="h-11"
          onClick={() => (stale ? window.location.reload() : retry())}
        >
          {stale ? "Recarregar" : "Tentar de novo"}
        </Button>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">Código: {error.digest}</p>
        ) : null}
      </EmptyState>
    </main>
  );
}
