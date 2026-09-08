"use client";

import { useEffect } from "react";

import { syncPushSubscription } from "@/components/pwa/use-push";

/** Uma conferência a cada 10 min por aba basta: o toggle e o lembrete do feed conferem sempre. */
const SYNC_EVERY_MS = 10 * 60_000;
const STORAGE_KEY = "eonarga:push-synced-at";

/**
 * Confere a assinatura de push com o servidor em qualquer tela do app (docs/08 #51), não
 * só no feed e no perfil: quem abre o app tocando numa notificação cai na galera ou na
 * ficha do lugar e também precisa regravar a assinatura. Não desenha nada.
 */
export function PushSync() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    try {
      const last = Number(window.sessionStorage.getItem(STORAGE_KEY) ?? 0);
      if (Number.isFinite(last) && Date.now() - last < SYNC_EVERY_MS) return;
    } catch {
      // Sem sessionStorage (modo privado esquisito): confere assim mesmo.
    }
    void syncPushSubscription().then(() => {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        // Sem storage, confere de novo na próxima tela; não faz mal.
      }
    });
  }, []);

  return null;
}
