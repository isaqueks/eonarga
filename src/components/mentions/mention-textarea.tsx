"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { applyMention, currentMentionQuery, mentionToken } from "@/lib/mentions";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  name: string;
  avatarId: string | null;
}

/** O que quem usa o componente pode pedir de fora: focar, ou prefixar uma menção. */
export interface MentionTextareaHandle {
  focus(): void;
  /** Põe `@Nome: ` no começo (se já não estiver) e leva o cursor pro fim. */
  prependMention(name: string): void;
}

/** Espera a pessoa parar de digitar antes de perguntar ao servidor. */
const DEBOUNCE_MS = 150;

/**
 * Textarea com autocomplete de menção (docs/08 #41): `@` mais três letras abre a lista
 * da galera; escolher escreve `@Nome: `. Controlado por fora (`value`/`onValueChange`),
 * pra o formulário continuar dono do texto.
 */
export function MentionTextarea({
  value,
  onValueChange,
  handleRef,
  className,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  handleRef?: Ref<MentionTextareaHandle>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  // Cursor a posicionar depois que o React aplicar o texto novo.
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCaret.current === null || !textareaRef.current) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    textareaRef.current.setSelectionRange(caret, caret);
  }, [value]);

  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => textareaRef.current?.focus(),
      prependMention: (name: string) => {
        const token = mentionToken(name);
        const next = value.startsWith(token) ? value : token + value;
        pendingCaret.current = next.length;
        onValueChange(next);
        requestAnimationFrame(() => textareaRef.current?.focus());
      },
    }),
    [value, onValueChange],
  );

  /** Relê o token em andamento a partir do cursor (a cada tecla, clique e seleção). */
  const refresh = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    setQuery(currentMentionQuery(el.value, el.selectionStart ?? el.value.length));
  }, []);

  useEffect(() => {
    // Sem token em andamento não há o que buscar; a lista some porque `open` exige `query`.
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/mentions?q=${encodeURIComponent(query.query)}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { people?: Suggestion[] };
        setSuggestions(data.people ?? []);
        setActive(0);
      } catch {
        // Abortado ou offline: sem sugestão, a pessoa termina de digitar.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(name: string) {
    const el = textareaRef.current;
    if (!el || !query) return;
    const result = applyMention(el.value, query.start, el.selectionStart ?? el.value.length, name);
    pendingCaret.current = result.caret;
    setQuery(null);
    setSuggestions([]);
    onValueChange(result.text);
    requestAnimationFrame(() => el.focus());
  }

  const open = query !== null && suggestions.length > 0;

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          // O selectionStart já está atualizado no evento de change.
          const caret = event.target.selectionStart ?? event.target.value.length;
          setQuery(currentMentionQuery(event.target.value, caret));
        }}
        onClick={refresh}
        onKeyUp={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) refresh();
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => (i + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            choose(suggestions[active].name);
          } else if (event.key === "Escape") {
            setQuery(null);
          }
        }}
        onBlur={() => {
          // Atrasa pra o clique numa sugestão ainda contar.
          setTimeout(() => setQuery(null), 150);
        }}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? "mention-suggestions" : undefined}
        className={className}
        {...props}
      />
      {open ? (
        <ul
          id="mention-suggestions"
          role="listbox"
          aria-label="Quem mencionar"
          className="border-border bg-popover text-popover-foreground absolute top-full left-0 z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border shadow-lg"
        >
          {suggestions.map((person, index) => (
            <li key={person.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                // `mousedown` pra não perder o foco do textarea antes do clique.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(person.name)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm",
                  index === active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <UserAvatar name={person.name} avatarId={person.avatarId} size="sm" />
                <span className="font-medium">{person.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
