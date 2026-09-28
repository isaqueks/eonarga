"use client";

import { useEffect } from "react";

/** Versão do app (package.json), injetada pelo next.config.ts. */
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
/** Uma conferência por minuto no máximo: voltar e sair do app várias vezes não vira spam. */
const CHECK_EVERY_MS = 60_000;

/**
 * Recarrega o app quando o servidor já está numa versão nova (docs/08 #54).
 *
 * O PWA fica dias aberto no celular. Depois de um deploy, a página antiga guarda ids de
 * server action que o servidor novo não conhece: comentar ou postar leva 404 e a tela
 * de erro. Aqui, toda vez que a pessoa volta pro app (`visibilitychange`, `pageshow`),
 * o cliente pergunta a versão ao `/api/health` e, se mudou e não tem nada digitado ou
 * escolhido em formulário, recarrega. Com rascunho na tela, deixa quieto: a próxima
 * navegação já traz a página nova. Não desenha nada.
 */
export function VersionWatch() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    let disposed = false;
    // A página acabou de vir do servidor: a primeira conferência espera um minuto.
    let last = Date.now();

    async function check() {
      if (disposed || document.visibilityState !== "visible") return;
      if (Date.now() - last < CHECK_EVERY_MS) return;
      last = Date.now();
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { version?: unknown };
        if (disposed || typeof data.version !== "string" || data.version === VERSION) return;
        if (hasDraft()) return;
        window.location.reload();
      } catch {
        // Sem rede agora: fica como está.
      }
    }

    const onWake = () => void check();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, []);

  return null;
}

/** Tem texto digitado ou arquivo escolhido em algum formulário? Aí recarregar perderia coisa. */
function hasDraft(): boolean {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "textarea, input",
  );
  for (const field of fields) {
    if (field instanceof HTMLInputElement) {
      if (field.type === "file") {
        if (field.files && field.files.length > 0) return true;
        continue;
      }
      if (!["text", "search", "url", "tel", "number"].includes(field.type)) continue;
    }
    if (field.value.trim() !== "") return true;
  }
  return false;
}
