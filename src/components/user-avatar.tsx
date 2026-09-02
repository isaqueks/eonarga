import { cn } from "@/lib/utils";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

/** Diâmetro em px de cada tamanho — usado no `width/height` da img e na classe do círculo. */
const SIZES: Record<AvatarSize, { px: number; className: string; text: string }> = {
  sm: { px: 32, className: "size-8", text: "text-[0.7rem]" },
  md: { px: 40, className: "size-10", text: "text-xs" },
  lg: { px: 64, className: "size-16", text: "text-lg" },
  xl: { px: 96, className: "size-24", text: "text-2xl" },
};

/**
 * Oito tons pro fallback de iniciais. Fundo translúcido + texto na mesma cor: funciona
 * no tema escuro (o padrão) e no claro sem precisar de duas paletas.
 */
const COLORS = [
  "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  "bg-lime-500/20 text-lime-700 dark:text-lime-300",
  "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
  "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  "bg-violet-500/20 text-violet-700 dark:text-violet-300",
  "bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300",
  "bg-rose-500/20 text-rose-700 dark:text-rose-300",
] as const;

/** Uma ou duas letras: primeira palavra + última, quando tem mais de uma. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]][0] ?? "";
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** djb2 simplificado: mesma pessoa, mesma cor, em qualquer render. */
export function colorIndexOf(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) >>> 0;
  return hash % COLORS.length;
}

/**
 * Foto de perfil. Sem `next/image` de propósito: a rota é autenticada e o id já é imutável,
 * então o otimizador não teria o que fazer além de atrapalhar o cache.
 */
export function UserAvatar({
  name,
  avatarId,
  size = "md",
  className,
}: {
  name: string;
  avatarId: string | null | undefined;
  size?: AvatarSize;
  className?: string;
}) {
  const { px, className: sizeClass, text } = SIZES[size];
  const base = cn("shrink-0 rounded-full object-cover", sizeClass, className);

  if (avatarId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/uploads/${avatarId}?v=thumb`}
        alt={name}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={cn(base, "bg-muted")}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        base,
        text,
        COLORS[colorIndexOf(name)],
        "inline-flex items-center justify-center font-semibold tracking-tight select-none",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
