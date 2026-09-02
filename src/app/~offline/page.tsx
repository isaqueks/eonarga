import type { Metadata } from "next";

import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Sem internet" };

/**
 * Fallback do service worker quando a navegação falha e não tem nada em cache.
 * Estática de propósito: precisa existir no cache antes de faltar internet, e por
 * isso o `<img>` é cru — o `next/image` viraria `/_next/image?url=…`, que pode não
 * estar cacheado. É a mesma razão de não usar o `EmptyState` aqui.
 */
export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.jpg"
        alt="Cachorro assustado perguntando: e o narga?"
        width={200}
        height={200}
        className="size-[200px] rounded-2xl object-cover opacity-90 shadow-lg"
      />
      <h1 className="font-display text-lg text-balance">Sem internet.</h1>
      <p className="text-muted-foreground max-w-xs text-sm text-balance">
        E o narga? Fica pra depois.
      </p>
      <RetryButton />
    </main>
  );
}
