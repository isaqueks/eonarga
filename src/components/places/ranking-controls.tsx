"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { parseRankingSort, RANKING_SORTS, type RankingSort } from "@/lib/ranking";
import { cn } from "@/lib/utils";

const SORT_LABELS: Record<RankingSort, string> = {
  melhores: "Melhores",
  "mais-avaliados": "Mais avaliados",
  recentes: "Mais recentes",
  piores: "Piores",
};

/**
 * Ordenação e filtros do ranking. Tudo vai pra query string e quem filtra é o
 * servidor — assim o link do ranking filtrado dá pra mandar no grupo.
 */
export function RankingControls({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sort = parseRankingSort(searchParams.get("sort"));
  const onlyNarga = searchParams.get("narga") === "1";
  const fui = searchParams.get("fui");

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <label className="text-muted-foreground flex items-center gap-2 text-sm">
        <span className="sr-only sm:not-sr-only">Ordenar</span>
        <select
          value={sort}
          onChange={(event) =>
            setParam("sort", event.target.value === "melhores" ? null : event.target.value)
          }
          aria-label="Ordenar o ranking"
          className="border-border bg-card text-foreground focus-visible:ring-ring/50 h-11 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3"
        >
          {RANKING_SORTS.map((value) => (
            <option key={value} value={value}>
              {SORT_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <FilterChip
        label="💨 tem narga"
        active={onlyNarga}
        onClick={() => setParam("narga", onlyNarga ? null : "1")}
      />
      <FilterChip
        label="Já fui"
        active={fui === "1"}
        onClick={() => setParam("fui", fui === "1" ? null : "1")}
      />
      <FilterChip
        label="Ainda não fui"
        active={fui === "0"}
        onClick={() => setParam("fui", fui === "0" ? null : "0")}
      />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-visible:ring-ring/50 flex h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
        active
          ? "border-narga bg-narga/15 text-narga"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
