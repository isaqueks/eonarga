import { cn } from "@/lib/utils";

/** Faixa de preço em cifrões: 2 → "$$" (com os outros dois apagados). */
export function PriceLevel({ value, className }: { value: number | null; className?: string }) {
  if (!value || value < 1) return null;
  const level = Math.min(4, Math.round(value));

  return (
    <span
      className={cn("inline-flex text-xs font-medium tracking-tight", className)}
      aria-label={`Preço: ${level} de 4`}
    >
      <span className="text-foreground">{"$".repeat(level)}</span>
      <span className="text-muted-foreground/40" aria-hidden>
        {"$".repeat(4 - level)}
      </span>
    </span>
  );
}
