import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function PlaceNotFound() {
  return (
    <EmptyState size="lg" title="Esse lugar não existe." description="Ou fechou. Ou nunca existiu.">
      <Button size="lg" className="h-11" nativeButton={false} render={<Link href="/ranking" />}>
        Voltar pro ranking
      </Button>
    </EmptyState>
  );
}
