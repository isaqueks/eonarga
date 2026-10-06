"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";

import { votePoll } from "@/actions/posts";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { barFraction, nextVotes, votersLabel, votesLabel } from "@/lib/polls";
import type { PostPoll as PostPollData } from "@/lib/queries/posts";
import { cn } from "@/lib/utils";

/** Quantos rostos cabem ao lado da contagem de cada opção. */
const FACES = 3;

/**
 * A enquete de um post (docs/08 #57), no molde da do WhatsApp: cada opção é um botão
 * com a marca de "votei", a contagem, os rostos de quem votou e uma barra proporcional
 * à opção mais votada. Tocar vota; tocar de novo tira. "Ver votos" abre quem votou em
 * quê — nada é privado dentro do grupo (docs/01).
 *
 * Otimista como as reações: pinta na hora e volta atrás se o servidor reclamar. Os
 * rostos só chegam com a resposta do servidor, que devolve a enquete inteira.
 */
export function PostPoll({ postId, poll }: { postId: string; poll: PostPollData }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(poll);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Ressincroniza quando o servidor revalida a página com outros números.
  const [lastProp, setLastProp] = useState(poll);
  if (lastProp !== poll) {
    setLastProp(poll);
    setState(poll);
  }

  const top = Math.max(0, ...state.options.map((option) => option.votes));

  function vote(optionId: string) {
    const before = state;
    const mine = before.options.filter((option) => option.mine).map((option) => option.id);
    const next = new Set(nextVotes(mine, optionId, before.multiple));
    const delta = (next.size > 0 ? 1 : 0) - (mine.length > 0 ? 1 : 0);

    setState({
      ...before,
      voters: Math.max(0, before.voters + delta),
      options: before.options.map((option) => {
        const now = next.has(option.id);
        if (now === option.mine) return option;
        return { ...option, mine: now, votes: Math.max(0, option.votes + (now ? 1 : -1)) };
      }),
    });
    setError(null);

    startTransition(async () => {
      const result = await votePoll(postId, optionId);
      if (!result.ok) {
        setState(before);
        setError(result.error ?? "Não rolou votar. Tenta de novo.");
        return;
      }
      if (result.poll) setState(result.poll);
    });
  }

  return (
    <div
      role="group"
      aria-label="Enquete"
      className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-2.5"
    >
      <p className="text-muted-foreground text-xs">
        <span aria-hidden>📊 </span>
        Enquete · {state.multiple ? "marca quantas quiser" : "escolhe uma"}
      </p>

      <ul className="flex flex-col gap-1.5">
        {state.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              role={state.multiple ? "checkbox" : "radio"}
              aria-checked={option.mine}
              aria-label={`${option.text}, ${votesLabel(option.votes).toLowerCase()}`}
              onClick={() => vote(option.id)}
              className="hover:bg-muted/60 focus-visible:ring-ring/50 flex w-full flex-col gap-1.5 rounded-md px-1 py-1.5 text-left outline-none focus-visible:ring-3"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center border-2",
                    state.multiple ? "rounded-md" : "rounded-full",
                    option.mine
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/50",
                  )}
                >
                  {option.mine ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug wrap-anywhere">
                  {option.text}
                </span>
                {option.voters.length > 0 ? (
                  <span aria-hidden className="flex shrink-0 items-center -space-x-1.5">
                    {option.voters.slice(0, FACES).map((voter) => (
                      <UserAvatar
                        key={voter.id}
                        name={voter.name}
                        avatarId={voter.avatarId}
                        size="sm"
                        className="ring-card size-5 text-[0.5rem] ring-2"
                      />
                    ))}
                  </span>
                ) : null}
                <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {option.votes}
                </span>
              </span>
              <span aria-hidden className="bg-muted ml-7 block h-1.5 overflow-hidden rounded-full">
                <span
                  className="bg-primary block h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${barFraction(option.votes, top) * 100}%` }}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {votersLabel(state.voters)}
        </p>
        <button
          type="button"
          disabled={state.voters === 0 || pending}
          onClick={() => setOpen(true)}
          className="text-primary text-xs font-semibold hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          Ver votos
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-[calc(100%-1rem)] overflow-y-auto sm:max-w-md">
          <DialogTitle>Votos da enquete</DialogTitle>
          <div className="flex flex-col gap-4">
            {state.options.map((option) => (
              <section key={option.id} className="flex flex-col gap-1.5">
                <h3 className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                  <span className="min-w-0 wrap-anywhere">{option.text}</span>
                  <span className="text-muted-foreground shrink-0 text-xs font-normal">
                    {votesLabel(option.votes)}
                  </span>
                </h3>
                {option.voters.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {option.voters.map((voter) => (
                      <li key={voter.id} className="flex items-center gap-2 text-sm">
                        <UserAvatar name={voter.name} avatarId={voter.avatarId} size="sm" />
                        {voter.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-xs">Ninguém ainda.</p>
                )}
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
