"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Category } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/**
 * Chips de categoria, com o filtro na query string (`?cat=<slug>`) pra Ranking e Mapa
 * compartilharem a escolha. Preserva os outros params (aba do Rolê, "só eu"...).
 */
export function CategoryChips({
  categories,
  className,
}: {
  categories: Category[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("cat");

  function select(slug: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set("cat", slug);
    else params.delete("cat");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div
      className={cn(
        "-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="group"
      aria-label="Filtrar por categoria"
    >
      <Chip label="Todos" active={!active} onClick={() => select(null)} />
      {categories.map((category) => (
        <Chip
          key={category.id}
          label={`${category.emoji} ${category.name}`}
          color={category.color}
          active={active === category.slug}
          onClick={() => select(category.slug)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={color ? { borderColor: active ? color : `${color}66` } : undefined}
      className={cn(
        "focus-visible:ring-ring/50 flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
        active
          ? "bg-secondary text-foreground border-foreground/40"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
