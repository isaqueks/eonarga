"use client";

/**
 * Guarda o `beforeinstallprompt` do Chrome num lugar só, fora do React. O evento
 * dispara uma vez por carga e cedo; se cada tela registrasse o listener no seu
 * `useEffect`, quem chegasse depois perdia o prompt nativo e caía nas instruções.
 * O root layout chama `ensureInstallPromptListener()` assim que hidrata.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Listener = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let registered = false;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function ensureInstallPromptListener() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Sem isso o Chrome mostra a barrinha dele, fora de hora.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function wasInstalledNow(): boolean {
  return installed;
}

/** Depois de usar o prompt ele não serve mais; o Chrome manda outro se fizer sentido. */
export function consumeDeferredPrompt(): BeforeInstallPromptEvent | null {
  const current = deferred;
  deferred = null;
  notify();
  return current;
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
