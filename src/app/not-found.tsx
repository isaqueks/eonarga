import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** 404 global (URL que não casa com rota nenhuma). A ficha de lugar tem o dela. */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col">
      <EmptyState
        size="lg"
        title="Esse lugar não existe."
        description="Ou fechou. Ou nunca existiu."
      >
        <Button size="lg" className="h-11" nativeButton={false} render={<Link href="/" />}>
          Ver o ranking
        </Button>
      </EmptyState>
    </main>
  );
}
