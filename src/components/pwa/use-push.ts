"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { removePushSubscription, savePushSubscription } from "@/actions/push";
import { sameKey, type PushSubscriptionInput } from "@/lib/push-keys";

/**
 * Estado do push neste aparelho. Tudo é detectado no `useEffect` (nada disso existe
 * no servidor), então o primeiro render é sempre `"loading"` e não há divergência
 * de hidratação.
 *
 * "on" não é só "o navegador tem assinatura": a cada abertura a assinatura é regravada
 * no servidor (docs/08 #51), que é o que recria a linha que sumiu, passa o dono pra
 * conta logada e troca a assinatura se a chave do servidor mudou. Só fica "on" o que o
 * servidor confirmou — ou o que não deu pra conferir por falta de rede.
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
  /** Assinado neste aparelho, e o servidor sabe. */
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

/** O caminho de volta: os bytes da chave com que o navegador assinou, em base64url. */
function bytesToUrlBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Chave com que a assinatura foi feita; null quando o navegador não expõe. */
function keyOf(subscription: PushSubscription): string | null {
  const key = subscription.options?.applicationServerKey;
  return key ? bytesToUrlBase64(key) : null;
}

/** O que vai pro servidor. Null quando a assinatura veio sem as chaves de cifra (não serve). */
function toInput(subscription: PushSubscription): PushSubscriptionInput | null {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) return null;
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    applicationServerKey: keyOf(subscription),
  };
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

function subscribeWith(
  registration: ServiceWorkerRegistration,
  key: string,
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(key),
  });
}

async function unsubscribeQuietly(subscription: PushSubscription | null): Promise<void> {
  if (!subscription) return;
  await subscription.unsubscribe().catch(() => false);
}

/**
 * Confere a assinatura que o navegador tem com o servidor. Regravar é o que conserta
 * a linha que sumiu e o dono errado; chave trocada assina de novo na hora (a permissão
 * já foi dada, não pergunta nada). Só vira "off" quando o servidor recusou de vez —
 * aí a assinatura do navegador é desfeita, pra tela e banco baterem.
 */
async function syncWithServer(
  registration: ServiceWorkerRegistration,
  subscription: PushSubscription,
): Promise<PushState> {
  const input = toInput(subscription);
  if (!input) {
    await unsubscribeQuietly(subscription);
    return "off";
  }

  let result: Awaited<ReturnType<typeof savePushSubscription>>;
  try {
    result = await savePushSubscription(input);
  } catch {
    // Sem rede (ou servidor fora): fica como está, a próxima abertura confere de novo.
    return "on";
  }
  if (result.ok) return "on";

  if (result.reason === "key-changed" && result.key) {
    let fresh: PushSubscription | null = null;
    try {
      await unsubscribeQuietly(subscription);
      fresh = await subscribeWith(registration, result.key);
      const freshInput = toInput(fresh);
      if (freshInput && (await savePushSubscription(freshInput)).ok) return "on";
    } catch {
      // cai pro "off" abaixo
    }
    await unsubscribeQuietly(fresh);
    return "off";
  }

  await unsubscribeQuietly(subscription);
  return "off";
}

async function detect(): Promise<PushState> {
  if (!supportsPush()) return "unsupported";
  if (!IS_PRODUCTION) return "dev";
  if (Notification.permission === "denied") return "denied";
  // `getRegistration` responde na hora (inclusive `undefined`); `ready` pode pendurar.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return "off";
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return "off";
  return syncWithServer(registration, subscription);
}

/**
 * Liga e desliga a notificação neste aparelho. Serve o toggle do perfil e o
 * lembrete do feed — os dois fazem exatamente o mesmo fluxo.
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
      const next = await detect().catch((): PushState => "off");
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
    // Assinatura feita nesta chamada (ou reaproveitada): se não virar linha no banco,
    // é desfeita — assinatura sem linha é o que deixa a tela dizendo "ligadas" à toa.
    let subscription: PushSubscription | null = null;
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

      // Já existe assinatura (permissão concedida numa visita anterior): reaproveita,
      // a não ser que tenha sido feita com outra chave do servidor — essa o serviço de
      // push recusaria (403), então sai e entra uma nova.
      const existing = await registration.pushManager.getSubscription();
      const existingKey = existing ? keyOf(existing) : null;
      if (existing && existingKey && !sameKey(existingKey, key)) {
        await unsubscribeQuietly(existing);
        subscription = await subscribeWith(registration, key);
      } else {
        subscription = existing ?? (await subscribeWith(registration, key));
      }

      const input = toInput(subscription);
      if (!input) {
        await unsubscribeQuietly(subscription);
        setError(PUSH_MESSAGES.failed);
        return false;
      }

      const saved = await savePushSubscription(input);
      if (!saved.ok) {
        await unsubscribeQuietly(subscription);
        setError(saved.error ?? PUSH_MESSAGES.failed);
        return false;
      }

      setState("on");
      return true;
    } catch {
      await unsubscribeQuietly(subscription);
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
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = (await registration?.pushManager.getSubscription()) ?? null;
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe().catch(() => false);
        // Se a linha ficar (sem rede), o próximo push a encontra morta e apaga.
        await removePushSubscription(endpoint).catch(() => null);
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
