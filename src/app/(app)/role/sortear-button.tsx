"use client";

import { Dices } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { pickRandom, randomIndex } from "@/lib/pick-random";

export interface SorteioCandidate {
  id: string;
  slug: string;
  name: string;
  /** Emoji da categoria. */
  emoji: string;
  /** Endereço já encurtado no servidor. */
  address: string | null;
  /** "Ana e Bia", já formatado. */
  people: string;
}

/**
 * Intervalos da roleta: 9 trocas de nome em ~1,15 s, cada uma um pouco mais
 * lenta que a anterior — é o que dá a sensação de estar parando.
 */
const SPIN_DELAYS = [60, 71, 84, 99, 117, 138, 163, 192, 227] as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function SortearButton({ candidates }: { candidates: SorteioCandidate[] }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SorteioCandidate | null>(null);
  /** Nome que a roleta está mostrando agora; null = já parou. */
  const [spinning, setSpinning] = useState<string | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastId = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const sortear = useCallback(() => {
    // "De novo" não pode cair no mesmo lugar (a menos que só tenha um).
    const chosen = pickRandom(candidates, lastId.current);
    if (!chosen) return;

    clearTimers();
    lastId.current = chosen.id;
    setResult(chosen);
    setOpen(true);

    if (prefersReducedMotion() || candidates.length === 1) {
      setSpinning(null);
      return;
    }

    setSpinning(chosen.name);
    let elapsed = 0;
    SPIN_DELAYS.forEach((delay, index) => {
      elapsed += delay;
      const isLast = index === SPIN_DELAYS.length - 1;
      timers.current.push(
        setTimeout(() => {
          // O último passo revela o sorteado de verdade; os outros são só borrão.
          if (isLast) setSpinning(null);
          else setSpinning(candidates[randomIndex(candidates.length)].name);
        }, elapsed),
      );
    });
  }, [candidates, clearTimers]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        clearTimers();
        setSpinning(null);
      }
    },
    [clearTimers],
  );

  if (candidates.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Button variant="outline" size="lg" className="h-11" disabled>
              <Dices className="size-4" aria-hidden />
              🎲 Sortear
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ninguém quer ir a lugar nenhum. Triste.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const rolling = spinning !== null;

  return (
    <>
      <Button variant="outline" size="lg" className="h-11" onClick={sortear}>
        <Dices className="size-4" aria-hidden />
        🎲 Sortear
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rolling ? "Sorteando…" : "O rolê é aqui"}</DialogTitle>
          </DialogHeader>

          {result ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <span aria-hidden className="text-4xl leading-none">
                {result.emoji}
              </span>
              <p
                aria-hidden
                className="font-display text-xl leading-tight text-balance"
                style={rolling ? { opacity: 0.6 } : undefined}
              >
                {spinning ?? result.name}
              </p>

              {/* A roleta trocando nome viraria spam no leitor de tela; só o final é anunciado. */}
              <p className="sr-only" aria-live="polite">
                {rolling ? "" : `Sorteado: ${result.name}`}
              </p>

              {!rolling && result.address ? (
                <p className="text-muted-foreground text-sm">{result.address}</p>
              ) : null}
              {!rolling && result.people ? (
                <p className="text-narga text-xs font-medium">{result.people}</p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={sortear} disabled={rolling}>
              De novo
            </Button>
            {rolling || !result ? (
              <Button disabled>Bora</Button>
            ) : (
              <Button nativeButton={false} render={<Link href={`/lugares/${result.slug}`} />}>
                Bora
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
