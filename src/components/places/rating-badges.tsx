import { cn } from "@/lib/utils";

/**
 * Selo "Aprovado pelo narga": média ≥ 4,5 com pelo menos 3 notas (docs/03).
 * `short` mostra só "Aprovado" (o card do ranking não tem largura pro selo inteiro
 * ao lado da nota no celular); o texto completo fica no title e na ficha.
 */
export function ApprovedBadge({
  size = "sm",
  short = false,
  className,
}: {
  size?: "sm" | "md";
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "border-narga/50 bg-narga/10 text-narga inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
        className,
      )}
      title={short ? "Aprovado pelo narga" : undefined}
      aria-label={short ? "Aprovado pelo narga" : undefined}
    >
      <span aria-hidden>🏅</span>
      {short ? "Aprovado" : "Aprovado pelo narga"}
    </span>
  );
}

/**
 * "poucas notas": aparece com 1 ou 2 avaliações, porque a posição vem da média
 * bayesiana e o número exibido é a média simples — sem isso parece bug (docs/03).
 */
export function FewRatingsBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "border-border text-muted-foreground inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] whitespace-nowrap",
        className,
      )}
      title="Poucas notas ainda: a posição no ranking desconfia de média com pouca gente."
    >
      poucas notas
    </span>
  );
}
