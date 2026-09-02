"use client";

import { Check, Heart } from "lucide-react";
import { useState, useTransition } from "react";

import { setMyPlaceStatus } from "@/actions/places";
import { cn } from "@/lib/utils";

type Status = "want" | "visited" | null;

/**
 * "Quero ir" / "Já fui" com um toque. Otimista: pinta na hora e volta atrás se o
 * servidor reclamar. Tocar de novo desmarca.
 */
export function StatusButtons({
  placeId,
  initial,
  className,
}: {
  placeId: string;
  initial: Status;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>(initial);
  const [error, setError] = useState<string | null>(null);
  // Ressincroniza quando o servidor revalida a página com outro valor.
  const [lastInitial, setLastInitial] = useState<Status>(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setStatus(initial);
  }

  function toggle(next: Exclude<Status, null>) {
    const value: Status = status === next ? null : next;
    const previous = status;
    setStatus(value);
    setError(null);
    startTransition(async () => {
      const result = await setMyPlaceStatus(placeId, value);
      if (!result.ok) {
        setStatus(previous);
        setError(result.error ?? "Não rolou. Tenta de novo.");
        return;
      }
      if (result.status !== undefined) setStatus(result.status);
    });
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex gap-2">
        <StatusButton
          active={status === "want"}
          disabled={pending}
          onClick={() => toggle("want")}
          icon={<Heart className={cn("size-4", status === "want" && "fill-current")} aria-hidden />}
          label="Quero ir"
        />
        <StatusButton
          active={status === "visited"}
          disabled={pending}
          onClick={() => toggle("visited")}
          icon={<Check className="size-4" aria-hidden />}
          label="Já fui"
        />
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function StatusButton({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "focus-visible:ring-ring/50 flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 disabled:opacity-60",
        active
          ? "border-narga bg-narga/15 text-narga"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
