import { cn } from "@/lib/utils";

import styles from "./review-content.module.css";

/** Classe do texto rico — usada no editor e na leitura, pra ficarem idênticos. */
export const reviewContentClass = styles.content;

/**
 * Texto da avaliação já sanitizado no servidor (`src/lib/sanitize.ts`).
 * Server component: nada aqui roda no cliente.
 */
export function ReviewContent({ html, className }: { html: string; className?: string }) {
  if (!html.trim()) return null;
  return (
    <div
      className={cn(reviewContentClass, className)}
      // Sanitizado na gravação (sanitize-html), nunca com o que veio do formulário cru.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
