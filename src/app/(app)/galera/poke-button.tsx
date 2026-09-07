"use client";

import { Pointer } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { pokeUser } from "@/actions/galera";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PokeRowProps {
  userId: string;
  /** Nome de quem vai ser dedado, pro rótulo acessível e pro aviso de "sem push". */
  name: string;
  /** Falso pra você mesmo e quando o servidor está sem push: aí só o `children` aparece. */
  enabled: boolean;
  /** O "visto há…" do card, que divide a linha com o botão. */
  children: ReactNode;
}

/**
 * Última linha do card da galera: o "visto há…" à esquerda e "Dedar" à direita, com o
 * resultado embaixo ocupando a largura toda (src/actions/galera.ts). Sem confirmação,
 * porque é uma pessoa só e o servidor segura em uma por minuto.
 */
export function PokeRow({ userId, name, enabled, children }: PokeRowProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: "ok" | "error"; message: string } | null>(null);

  if (!enabled) return <>{children}</>;

  function poke() {
    setResult(null);
    startTransition(async () => {
      const state = await pokeUser(userId);
      if (!state.ok) {
        setResult({ tone: "error", message: state.error ?? "Não rolou dedar. Tenta de novo." });
        return;
      }
      setResult(
        (state.recipients ?? 0) > 0
          ? { tone: "ok", message: "Dedou!" }
          : { tone: "error", message: `${name} não ligou notificação.` },
      );
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        {children}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 px-2 text-xs"
          disabled={pending}
          onClick={poke}
          aria-label={`Dedar ${name}`}
        >
          <Pointer className="size-3.5" aria-hidden />
          {pending ? "Dedando…" : "Dedar"}
        </Button>
      </div>
      {result ? (
        <p
          role="status"
          className={cn("text-xs", result.tone === "ok" ? "text-narga" : "text-destructive")}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
