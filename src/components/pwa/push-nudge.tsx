"use client";

import { Bell } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { usePush } from "@/components/pwa/use-push";

const DISMISSED_KEY = "eonarga:push-nudge";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

// Memorizado por carga de página: `useSyncExternalStore` chama o snapshot a cada
// render e ele precisa devolver sempre a mesma coisa (mesmo padrão do install-banner).
let cached: boolean | undefined;

function getSnapshot(): boolean {
  if (cached !== undefined) return cached;
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY));
    cached = Boolean(at) && Date.now() - at < DISMISS_MS;
  } catch {
    // Modo privado do Safari: sem memória do "depois", o convite volta. Paciência.
    cached = false;
  }
  return cached;
}

/** Nada muda sozinho: quem muda o banner é o botão, e ele tem estado próprio. */
function subscribe(): () => void {
  return () => {};
}

/**
 * Convite pra ligar notificação, no topo do ranking. Só aparece pra quem ainda não
 * respondeu nada (`permission === "default"`) e tem service worker — quem já negou
 * não vai mudar de ideia por um banner, e quem já ligou não precisa dele.
 *
 * O localStorage não existe no servidor, então entra por `useSyncExternalStore`:
 * a hidratação começa escondida e não diverge.
 */
export function PushNudge() {
  const { state, permission, error, pending, enable } = usePush();
  const stored = useSyncExternalStore(subscribe, getSnapshot, () => true);
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // sem localStorage o banner some só nesta sessão
    }
    cached = true;
    setDismissed(true);
  }, []);

  if (stored || dismissed || state !== "off" || permission !== "default") return null;

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-start gap-2">
        <Bell className="text-narga mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="text-sm">Ativa as notificações pra saber quando chamarem a galera</p>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button size="lg" className="h-11 flex-1" disabled={pending} onClick={() => void enable()}>
          {pending ? "Um instante…" : "Ativar"}
        </Button>
        <Button variant="ghost" size="lg" className="h-11 flex-1" onClick={dismiss}>
          Depois
        </Button>
      </div>
    </div>
  );
}
