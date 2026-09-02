"use client";

import { Megaphone } from "lucide-react";
import { useState, useTransition } from "react";

import { callGroup } from "@/actions/push";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NOBODY = "Ninguém ativou notificações ainda. Chama no zap.";

export interface CallGroupButtonProps {
  placeId: string;
  placeName: string;
  /** `isPushEnabled()` do servidor. Sem push configurado o botão nem aparece. */
  enabled: boolean;
  /** Lugar arquivado, por exemplo. */
  disabled?: boolean;
}

/**
 * "Chamar galera pra cá": apita no celular de todo mundo (menos no de quem chamou).
 * Tem confirmação porque é um botão que incomoda gente de verdade — e rate limit no
 * servidor pra quem confirmar mesmo assim (src/actions/push.ts).
 */
export function CallGroupButton({ placeId, placeName, enabled, disabled }: CallGroupButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: "ok" | "error"; message: string } | null>(null);

  if (!enabled) return null;

  function chamar() {
    setResult(null);
    startTransition(async () => {
      const state = await callGroup(placeId);
      setOpen(false);

      if (!state.ok) {
        setResult({ tone: "error", message: state.error ?? "Não rolou chamar. Tenta de novo." });
        return;
      }

      const people = state.recipients ?? 0;
      setResult({
        tone: "ok",
        message:
          people === 0
            ? NOBODY
            : `Chamou! ${people} ${people === 1 ? "pessoa avisada" : "pessoas avisadas"}.`,
      });
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="lg"
        className="h-11 w-full"
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        <Megaphone className="size-4" aria-hidden />
        Chamar galera pra cá
      </Button>

      {result ? (
        <p
          role="status"
          className={result.tone === "ok" ? "text-narga text-sm" : "text-destructive text-sm"}
        >
          {result.message}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chamar a galera pro {placeName}?</DialogTitle>
            <DialogDescription>Vai apitar no celular de todo mundo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" size="lg" className="h-11">
                  Deixa
                </Button>
              }
            />
            <Button size="lg" className="h-11" disabled={pending} onClick={chamar}>
              {pending ? "Chamando…" : "Chamar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
