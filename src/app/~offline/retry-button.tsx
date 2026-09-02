"use client";

import { Button } from "@/components/ui/button";

/** Recarrega a URL atual: se a rede voltou, o SW busca da rede e a página real aparece. */
export function RetryButton() {
  return (
    <Button size="lg" className="h-11" onClick={() => window.location.reload()}>
      Tentar de novo
    </Button>
  );
}
