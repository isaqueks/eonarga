import { cn } from "@/lib/utils";

const LABELS = {
  yes: "💨 tem narga",
  no: "sem narga",
  unknown: "não sei se tem narga",
} as const;

const SHORT = {
  yes: "💨 tem narga",
  no: "💨 não tem",
  unknown: "💨 não sei",
} as const;

export function HasNargaBadge({
  value,
  short = false,
  className,
}: {
  value: "yes" | "no" | "unknown";
  /** Versão curta pra linha de metadados da ficha. */
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        value === "yes" ? "text-narga" : "text-muted-foreground",
        className,
      )}
    >
      {short ? SHORT[value] : LABELS[value]}
    </span>
  );
}
