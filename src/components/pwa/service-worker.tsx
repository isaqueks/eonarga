"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/** Versão do app (package.json), injetada pelo next.config.ts. Muda a URL do SW a cada release. */
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/**
 * Registra `public/sw.js` (só em produção: em dev o SW atrapalha o HMR) e cuida da
 * atualização. Nada recarrega sozinho — quem manda é o botão do toast (docs/06).
 */
export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  // Só recarrega no `controllerchange` se a troca foi pedida aqui; senão o primeiro
  // acesso (quando o SW assume com clients.claim) recarregaria a página do nada.
  const reloadOnTakeover = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    const onControllerChange = () => {
      if (!reloadOnTakeover.current) return;
      reloadOnTakeover.current = false;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(VERSION)}`, { scope: "/" })
      .then((registration) => {
        if (cancelled) return;

        // Já tinha um SW novo esperando de uma visita anterior.
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // Sem `controller` é a primeira instalação: não tem o que avisar.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      })
      .catch(() => {
        // Sem service worker o app funciona igual, só não abre offline.
      });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const update = useCallback(() => {
    if (!waiting) return;
    reloadOnTakeover.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    setWaiting(null);
  }, [waiting]);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="border-border bg-card fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-[min(100%-1.5rem,26rem)] items-center gap-3 rounded-xl border p-3 shadow-lg"
    >
      <RefreshCw className="text-narga size-5 shrink-0" aria-hidden />
      <p className="flex-1 text-sm">Tem versão nova. Atualizar?</p>
      <Button size="lg" className="h-9" onClick={update}>
        Atualizar
      </Button>
    </div>
  );
}
