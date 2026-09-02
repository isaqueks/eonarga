"use client";

import { Bell, BellOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PUSH_MESSAGES, usePush } from "@/components/pwa/use-push";

/**
 * Liga/desliga notificação neste aparelho, na seção "Conta" do perfil.
 * "Neste aparelho" é literal: a assinatura é do navegador, então o celular pode
 * estar ligado e o computador não.
 */
export function PushToggle() {
  const { state, error, pending, enable, disable } = usePush();

  if (state === "loading") return null;

  if (state === "unsupported" || state === "dev" || state === "denied") {
    return (
      <p className="text-muted-foreground text-sm">
        {state === "unsupported"
          ? PUSH_MESSAGES.unsupported
          : state === "dev"
            ? `Notificações: ${PUSH_MESSAGES.dev.toLowerCase()}`
            : PUSH_MESSAGES.denied}
      </p>
    );
  }

  const on = state === "on";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Notificações:{" "}
        <span className={on ? "text-narga font-medium" : "text-muted-foreground"}>
          {on ? "ligadas neste aparelho" : "desligadas"}
        </span>
      </p>
      <Button
        variant={on ? "outline" : "default"}
        size="lg"
        className="h-11 self-start"
        disabled={pending}
        onClick={() => void (on ? disable() : enable())}
      >
        {on ? <BellOff className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
        {pending ? "Um instante…" : on ? "Desativar" : "Ativar notificações"}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
