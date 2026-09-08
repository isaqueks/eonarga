"use client";

import { BellOff, Loader2 } from "lucide-react";

import { usePush } from "@/components/pwa/use-push";

/**
 * Lembrete discreto no feed, acima do "Postar" (docs/08 #49): uma linha "Notificações
 * desativadas. Ativar" sempre que o push estiver desligado neste aparelho e o navegador
 * souber fazer push. Quem bloqueou no navegador vê o caminho pra liberar; navegador
 * sem push, dev e quem já ligou não veem nada. O toggle do perfil continua lá — este é
 * só o atalho.
 *
 * Tudo é detectado no cliente (`usePush`), então o primeiro render é vazio e a
 * hidratação não diverge.
 */
export function PushNudge() {
  const { state, error, pending, enable } = usePush();

  if (state !== "off" && state !== "denied") return null;

  return (
    <div className="text-muted-foreground flex flex-col gap-1 text-xs">
      <p className="flex items-center gap-1.5">
        <BellOff className="size-3.5 shrink-0" aria-hidden />
        {state === "denied" ? (
          <span>Notificações bloqueadas no navegador. Libera nas configurações do site.</span>
        ) : (
          <span>
            Notificações desativadas.{" "}
            <button
              type="button"
              onClick={() => void enable()}
              disabled={pending}
              className="text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded font-medium underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-3 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
              {pending ? "Ativando…" : "Ativar"}
            </button>
          </span>
        )}
      </p>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
