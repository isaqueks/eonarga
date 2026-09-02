"use client";

import { Download, Share } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const VISITS_KEY = "eonarga:visits";
const COUNTED_KEY = "eonarga:visit-counted";
const DISMISSED_KEY = "eonarga:install-dismissed";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
/** Só aparece a partir da 2ª visita: na primeira a pessoa nem sabe o que é o app ainda. */
const MIN_VISITS = 2;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** `"ios"` = tem que explicar na mão; `"other"` = espera o `beforeinstallprompt`. */
type Eligibility = "ios" | "other" | null;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // modo privado do Safari: sem contador, sem banner. Tudo bem.
  }
}

/** Conta uma visita por sessão (recarregar a home não conta de novo). */
function countVisit(): number {
  const current = Number(read(VISITS_KEY)) || 0;
  try {
    if (window.sessionStorage.getItem(COUNTED_KEY)) return current;
    window.sessionStorage.setItem(COUNTED_KEY, "1");
  } catch {
    return current;
  }
  const next = current + 1;
  write(VISITS_KEY, String(next));
  return next;
}

function isDismissed(): boolean {
  const at = Number(read(DISMISSED_KEY));
  if (!at) return false;
  return Date.now() - at < DISMISS_MS;
}

function isStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS moderno se apresenta como Macintosh; o toque é o que entrega.
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
}

// O resultado é calculado uma vez por carga de página e memorizado, porque
// `useSyncExternalStore` chama o snapshot a cada render e ele precisa ser estável
// (além de o contador de visitas não poder subir a cada re-render).
let cached: Eligibility | undefined;

function getSnapshot(): Eligibility {
  if (cached !== undefined) return cached;
  cached = null;
  if (!isStandalone() && !isDismissed() && countVisit() >= MIN_VISITS) {
    cached = isIos() ? "ios" : "other";
  }
  return cached;
}

/** Nada muda sozinho: o que muda o banner são eventos, e esses têm listener próprio. */
function subscribe(): () => void {
  return () => {};
}

/**
 * Convite pra instalar, no topo do ranking. Android/Chrome usa o prompt nativo;
 * iOS não tem prompt nenhum, então sobra explicar o caminho das pedras (docs/06).
 *
 * `useSyncExternalStore` em vez de `useEffect` + `setState` porque o que decide o
 * banner (localStorage, userAgent, display-mode) é estado de fora do React e não
 * existe no servidor: assim a hidratação começa escondida, sem divergência.
 */
export function InstallBanner() {
  const eligibility = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Sem isso o Chrome mostra a barrinha dele, que é feia e fora de hora.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = useCallback(() => {
    write(DISMISSED_KEY, String(Date.now()));
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    setDeferred(null);
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // Recusou o prompt nativo: some pelos mesmos 30 dias.
    if (outcome === "dismissed") dismiss();
  }, [deferred, dismiss]);

  if (dismissed || !eligibility) return null;
  const mode = deferred ? "android" : eligibility === "ios" ? "ios" : null;
  if (!mode) return null;

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div>
        <p className="text-sm font-medium">Bota na tela inicial?</p>
        {mode === "ios" ? (
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1 text-xs">
            No Safari: <Share className="size-3.5" aria-hidden /> Compartilhar → Adicionar à Tela de
            Início.
          </p>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs">
            Abre em tela cheia, com o cachorro no ícone.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {mode === "android" ? (
          <Button size="lg" className="h-11 flex-1" onClick={install}>
            <Download className="size-4" aria-hidden />
            Instalar
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="lg"
          className={mode === "android" ? "h-11 flex-1" : "h-11 px-3"}
          onClick={dismiss}
        >
          Agora não
        </Button>
      </div>
    </div>
  );
}
