"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { removePushSubscription, savePushSubscription } from "@/actions/push";

/**
 * Estado do push neste aparelho. Tudo é detectado no `useEffect` (nada disso existe
 * no servidor), então o primeiro render é sempre `"loading"` e não há divergência
 * de hidratação.
 */
export type PushState =
  /** Ainda checando o navegador. */
  | "loading"
  /** Navegador sem Push API (Safari iOS fora da tela inicial, por exemplo). */
  | "unsupported"
  /** Em dev o service worker nem é registrado (docs/06). */
  | "dev"
  /** A pessoa bloqueou nas configurações do site. */
  | "denied"
  /** Dá pra ativar. */
  | "off"
  /** Assinado neste aparelho. */
  | "on";

export const PUSH_MESSAGES = {
  denied: "O navegador bloqueou. Libera nas configurações do site.",
  unsupported: "Esse navegador não faz push. No iPhone, instala o app na tela inicial primeiro.",
  dev: "Só funciona no site publicado.",
  serverOff: "Push não está configurado no servidor.",
  failed: "Não rolou ativar. Tenta de novo.",
} as const;

const IS_PRODUCTION = process.env.NODE_ENV === "production";
/** `serviceWorker.ready` só resolve quando existe worker ativo; sem teto, o botão trava. */
const READY_TIMEOUT_MS = 15_000;

function supportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** A chave VAPID vem em base64url e o `subscribe()` quer bytes. */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const response = await fetch("/api/push/public-key", { cache: "no-store" });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const key = (data as { key?: unknown } | null)?.key;
    return typeof key === "string" && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  // `getRegistration` responde na hora (inclusive `undefined`); `ready` pode pendurar.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

async function detect(): Promise<PushState> {
  if (!supportsPush()) return "unsupported";
  if (!IS_PRODUCTION) return "dev";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

/**
 * Liga e desliga a notificação neste aparelho. Serve o toggle do perfil e o
 * convite do ranking — os dois fazem exatamente o mesmo fluxo.
 */
export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      const next = await detect().catch((): PushState => "unsupported");
      if (!alive.current) return;
      setState(next);
      if (supportsPush()) setPermission(Notification.permission);
    })();
    return () => {
      alive.current = false;
    };
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    setError(null);
    setPending(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        setState("denied");
        setError(PUSH_MESSAGES.denied);
        return false;
      }

      const registration = await readyRegistration();
      if (!registration) {
        setError(PUSH_MESSAGES.failed);
        return false;
      }

      const key = await fetchPublicKey();
      if (!key) {
        setError(PUSH_MESSAGES.serverOff);
        return false;
      }

      // Já existe assinatura (permissão concedida numa visita anterior): reaproveita.
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(key),
        }));

      const keys = subscription.toJSON().keys;
      if (!keys?.p256dh || !keys.auth) {
        await subscription.unsubscribe().catch(() => false);
        setError(PUSH_MESSAGES.failed);
        return false;
      }

      const saved = await savePushSubscription({
        endpoint: subscription.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      });
      if (!saved.ok) {
        // Sem a linha no banco a assinatura não serve pra nada: desfaz no navegador.
        await subscription.unsubscribe().catch(() => false);
        setError(saved.error ?? PUSH_MESSAGES.failed);
        return false;
      }

      setState("on");
      return true;
    } catch {
      setError(PUSH_MESSAGES.failed);
      return false;
    } finally {
      if (alive.current) setPending(false);
    }
  }, []);

  const disable = useCallback(async (): Promise<boolean> => {
    setError(null);
    setPending(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe().catch(() => false);
        await removePushSubscription(endpoint);
      }
      setState("off");
      return true;
    } catch {
      setError("Não rolou desativar. Tenta de novo.");
      return false;
    } finally {
      if (alive.current) setPending(false);
    }
  }, []);

  return { state, permission, error, pending, enable, disable };
}
