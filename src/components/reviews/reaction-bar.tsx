"use client";

import { useState, useTransition } from "react";

import { toggleReaction } from "@/actions/reviews";
import type { ReactionSummary } from "@/lib/queries/reviews";
import { REACTION_EMOJIS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type State = Record<string, { count: number; mine: boolean }>;

function toState(reactions: ReactionSummary[]): State {
  const out: State = {};
  for (const emoji of REACTION_EMOJIS) out[emoji] = { count: 0, mine: false };
  for (const reaction of reactions) {
    out[reaction.emoji] = { count: reaction.count, mine: reaction.mine };
  }
  return out;
}

/**
 * Reações da avaliação. Otimista: pinta na hora e volta atrás se o servidor reclamar,
 * igual aos botões de status. Nada é privado — todo mundo vê a contagem (docs/01).
 */
export function ReactionBar({
  reviewId,
  reactions,
  className,
}: {
  reviewId: string;
  reactions: ReactionSummary[];
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<State>(() => toState(reactions));
  const [error, setError] = useState<string | null>(null);
  // Ressincroniza quando o servidor revalida a página com outros números.
  const [lastProp, setLastProp] = useState(reactions);
  if (lastProp !== reactions) {
    setLastProp(reactions);
    setState(toState(reactions));
  }

  function toggle(emoji: string) {
    const current = state[emoji] ?? { count: 0, mine: false };
    const optimistic = {
      count: Math.max(0, current.count + (current.mine ? -1 : 1)),
      mine: !current.mine,
    };
    setState((previous) => ({ ...previous, [emoji]: optimistic }));
    setError(null);

    startTransition(async () => {
      const result = await toggleReaction(reviewId, emoji);
      if (!result.ok) {
        setState((previous) => ({ ...previous, [emoji]: current }));
        setError(result.error ?? "Não rolou reagir. Tenta de novo.");
        return;
      }
      if (result.reacted !== undefined || result.count !== undefined) {
        setState((previous) => ({
          ...previous,
          [emoji]: {
            count: result.count ?? optimistic.count,
            mine: result.reacted ?? optimistic.mine,
          },
        }));
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reagir">
        {REACTION_EMOJIS.map((emoji) => {
          const entry = state[emoji] ?? { count: 0, mine: false };
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => toggle(emoji)}
              disabled={pending}
              aria-pressed={entry.mine}
              aria-label={`Reagir com ${emoji}${entry.count > 0 ? ` (${entry.count})` : ""}`}
              className={cn(
                "focus-visible:ring-ring/50 flex h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-2.5 text-sm transition-colors outline-none focus-visible:ring-3 disabled:opacity-60",
                entry.mine
                  ? "border-narga bg-narga/15 text-narga"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <span aria-hidden className="text-base leading-none">
                {emoji}
              </span>
              {entry.count > 0 ? (
                <span className="text-xs font-medium tabular-nums">{entry.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
