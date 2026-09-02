"use client";

import { useEffect } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Erro inesperado em qualquer rota. No Next 16 a prop é `retry()` (o `reset()` antigo
 * só limpa o boundary; `retry()` busca de novo, que é o que "tenta de novo" promete).
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col">
      <EmptyState size="lg" title="Deu ruim do nosso lado." description="Tenta de novo.">
        <Button size="lg" className="h-11" onClick={() => retry()}>
          Tentar de novo
        </Button>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">Código: {error.digest}</p>
        ) : null}
      </EmptyState>
    </main>
  );
}
