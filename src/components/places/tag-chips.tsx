import Link from "next/link";

import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

/** Quantas tags cabem na linha do ranking (e viram sugestão na ficha). */
export const TOP_TAGS = 8;

/**
 * Linha rolável de tags pro ranking e pro mapa. Server component de propósito: o
 * filtro vive na query string, então um link já resolve — e o link filtrado dá pra
 * mandar no grupo. Preserva os outros params (categoria, ordenação, "já fui"...).
 */
export function TagChips({
  tags,
  activeTag,
  params,
  basePath = "/",
  className,
}: {
  /** Tags mais usadas, já na ordem que deve aparecer. */
  tags: { tag: string; count: number }[];
  activeTag?: string | null;
  /** `searchParams` da página atual. */
  params?: SearchParams;
  basePath?: string;
  className?: string;
}) {
  const active = activeTag ?? null;
  const others = tags.filter((entry) => entry.tag !== active);

  if (!active && others.length === 0) return null;

  function hrefFor(tag: string | null): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (key === "tag") continue;
      if (typeof value === "string") search.set(key, value);
      else if (Array.isArray(value)) for (const item of value) search.append(key, item);
    }
    if (tag) search.set("tag", tag);
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  return (
    <div
      className={cn(
        "-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="group"
      aria-label="Filtrar por tag"
    >
      {active ? (
        <Link
          href={hrefFor(null)}
          scroll={false}
          aria-label={`Tirar o filtro da tag ${active}`}
          className="border-narga bg-narga/15 text-narga focus-visible:ring-ring/50 flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3"
        >
          #{active}
          <span aria-hidden className="text-base leading-none">
            ×
          </span>
        </Link>
      ) : null}

      {others.map((entry) => (
        <Link
          key={entry.tag}
          href={hrefFor(entry.tag)}
          scroll={false}
          className="border-border text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3"
        >
          #{entry.tag}
          <span className="text-muted-foreground/70 text-xs tabular-nums">{entry.count}</span>
        </Link>
      ))}
    </div>
  );
}
