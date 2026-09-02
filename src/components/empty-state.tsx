import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  /** `sm` = cachorro pequeno (placeholders), `lg` = cachorro grande (estado vazio de verdade). */
  size?: "sm" | "lg";
  children?: ReactNode;
  className?: string;
};

/** Estado vazio com o mascote. Toda tela sem conteúdo usa isso. */
export function EmptyState({
  title,
  description,
  size = "sm",
  children,
  className,
}: EmptyStateProps) {
  const px = size === "lg" ? 200 : 120;

  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center",
        className,
      )}
    >
      <Image
        src="/logo.jpg"
        alt="Cachorro assustado perguntando: e o narga?"
        width={px}
        height={px}
        className="rounded-2xl opacity-90 shadow-lg"
      />
      <h2 className="text-lg font-semibold text-balance">{title}</h2>
      {description ? (
        <p className="text-muted-foreground max-w-xs text-sm text-balance">{description}</p>
      ) : null}
      {children}
    </div>
  );
}
