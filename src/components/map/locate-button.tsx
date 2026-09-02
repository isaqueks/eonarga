"use client";

import { LocateFixed } from "lucide-react";

import { cn } from "@/lib/utils";

/** Botão flutuante do mapa + o "toast" simples de erro do GPS. */
export function LocateButton({
  onClick,
  loading,
  error,
  className,
}: {
  onClick: () => void;
  loading: boolean;
  error: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-3 bottom-8 z-[1000] flex flex-col items-end gap-2",
        className,
      )}
    >
      {error ? (
        <p
          role="status"
          className="border-border bg-card/95 text-foreground pointer-events-auto rounded-lg border px-3 py-1.5 text-xs shadow-lg"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-label="Onde estou"
        className="border-border bg-card/95 text-foreground focus-visible:ring-ring/50 hover:bg-secondary pointer-events-auto flex size-11 items-center justify-center rounded-full border shadow-lg outline-none focus-visible:ring-3 disabled:opacity-60"
      >
        <LocateFixed className={cn("size-5", loading && "animate-pulse")} aria-hidden />
      </button>
    </div>
  );
}
