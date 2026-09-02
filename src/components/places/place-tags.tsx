"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { setPlaceTags } from "@/actions/tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TAG_MAX_PER_PLACE } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TOO_MANY = `No máximo ${TAG_MAX_PER_PLACE} tags. Escolhe.`;
const SAVE_FAILED = "Não rolou salvar a tag. Tenta de novo.";

/**
 * Tags livres do lugar. A chip leva pro ranking filtrado; com permissão, dá pra
 * somar e tirar tag ali mesmo, otimista. Quem normaliza de verdade é o servidor
 * (src/lib/tags.ts): aqui só se arruma o suficiente pra não piscar errado.
 */
export function PlaceTags({
  placeId,
  tags,
  canEdit,
  suggestions,
  className,
}: {
  placeId: string;
  tags: string[];
  /** Qualquer membro edita (docs/05); a ficha decide se mostra. */
  canEdit: boolean;
  /** As tags mais usadas, pra oferecer atalho. Sem isso, só o campo livre. */
  suggestions?: string[];
  className?: string;
}) {
  const [current, setCurrent] = useState(tags);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Ressincroniza quando o servidor revalida a página com outras tags.
  const [lastProp, setLastProp] = useState(tags);
  if (lastProp !== tags) {
    setLastProp(tags);
    setCurrent(tags);
  }

  const free = suggestions?.filter((tag) => !current.includes(tag)).slice(0, TAG_MAX_PER_PLACE);

  function save(next: string[]) {
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const result = await setPlaceTags(placeId, next);
      if (!result.ok) {
        setCurrent(previous);
        setError(result.error ?? SAVE_FAILED);
        return;
      }
      // A lista de verdade é a que voltou: normalizada e em ordem alfabética.
      if (result.tags) setCurrent(result.tags);
    });
  }

  function add(raw: string) {
    const tag = raw.trim().toLowerCase();
    setValue("");
    if (tag === "") return;
    if (current.includes(tag)) return;
    if (current.length >= TAG_MAX_PER_PLACE) {
      setError(TOO_MANY);
      return;
    }
    save([...current, tag].sort((a, b) => a.localeCompare(b, "pt-BR")));
  }

  function openInput() {
    setEditing(true);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (!canEdit && current.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {current.map((tag) => (
          <span
            key={tag}
            className="border-border bg-secondary/40 flex items-center rounded-full border text-sm"
          >
            <Link
              href={`/?tag=${encodeURIComponent(tag)}`}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-full py-1.5 pl-3 outline-none focus-visible:ring-3"
            >
              #{tag}
            </Link>
            {canEdit ? (
              <button
                type="button"
                onClick={() => save(current.filter((other) => other !== tag))}
                disabled={pending}
                aria-label={`Tirar a tag ${tag}`}
                className="text-muted-foreground hover:text-destructive focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-3 disabled:opacity-60"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : (
              <span className="w-3" />
            )}
          </span>
        ))}

        {canEdit && !editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openInput}
            disabled={pending}
            className="text-muted-foreground h-9 rounded-full px-3"
          >
            <Plus className="size-3.5" aria-hidden />
            tag
          </Button>
        ) : null}
      </div>

      {canEdit && editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={value}
              onChange={(event) => {
                const typed = event.target.value;
                // Vírgula também confirma: dá pra colar "aceita pix, fecha cedo".
                if (typed.includes(",")) {
                  const [first, ...rest] = typed.split(",");
                  add(first);
                  setValue(rest.join(",").trim());
                  return;
                }
                setValue(typed);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                add(value);
              }}
              placeholder="aceita pix, fecha cedo..."
              aria-label="Nova tag"
              maxLength={40}
              className="h-11"
            />
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 px-3"
              onClick={() => {
                setEditing(false);
                setValue("");
              }}
            >
              Pronto
            </Button>
          </div>

          {free && free.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {free.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => add(tag)}
                  disabled={pending}
                  className="border-border text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 h-8 rounded-full border border-dashed px-3 text-xs outline-none focus-visible:ring-3 disabled:opacity-60"
                >
                  #{tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
