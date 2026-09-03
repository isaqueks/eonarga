"use client";

import { Download, Share, Smartphone } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  consumeDeferredPrompt,
  ensureInstallPromptListener,
  getDeferredPrompt,
  subscribeInstallPrompt,
  wasInstalledNow,
} from "./install-prompt-store";

/** `"ios"` = explicar o caminho; `"android"` = prompt nativo ou instrução do menu. */
type Platform = "ios" | "android" | null;

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

function isMobile(): boolean {
  if (isIos()) return true;
  if (/android|mobile/i.test(window.navigator.userAgent)) return true;
  return window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900;
}

// Calculado uma vez por carga: `useSyncExternalStore` exige snapshot estável, e
// user agent / display-mode não mudam no meio do caminho.
let platformCache: Platform | undefined;

function getPlatform(): Platform {
  if (platformCache !== undefined) return platformCache;
  platformCache = null;
  if (isMobile() && !isStandalone()) platformCache = isIos() ? "ios" : "android";
  return platformCache;
}

function subscribeNothing() {
  return () => {};
}

/**
 * "Instalar aplicativo": fica sempre visível no celular enquanto o app não estiver
 * instalado (docs/08 #32). Android/Chrome usa o prompt nativo quando o navegador
 * ofereceu um; senão (e no iOS, que nunca oferece) abre as instruções.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const platform = useSyncExternalStore(subscribeNothing, getPlatform, () => null);
  const deferred = useSyncExternalStore(subscribeInstallPrompt, getDeferredPrompt, () => null);
  const installed = useSyncExternalStore(subscribeInstallPrompt, wasInstalledNow, () => false);
  const [showHelp, setShowHelp] = useState(false);

  // Garante o listener mesmo se esta for a primeira tela hidratada.
  ensureInstallPromptListener();

  const install = useCallback(async () => {
    const prompt = consumeDeferredPrompt();
    if (!prompt) {
      setShowHelp(true);
      return;
    }
    await prompt.prompt();
    await prompt.userChoice;
  }, []);

  if (!platform || installed) return null;

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        className={
          "border-primary/50 text-foreground h-12 w-full justify-center gap-2 text-base " +
          (className ?? "")
        }
        onClick={install}
      >
        {deferred ? (
          <Download className="size-5" aria-hidden />
        ) : (
          <Smartphone className="size-5" aria-hidden />
        )}
        Instalar aplicativo
      </Button>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar o E o narga?</DialogTitle>
            <DialogDescription>
              Fica na tela inicial, abre em tela cheia e recebe as notificações da galera.
            </DialogDescription>
          </DialogHeader>
          {platform === "ios" ? (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              <li>Abre este site no Safari (outros navegadores do iPhone não instalam).</li>
              <li className="flex flex-wrap items-center gap-1">
                Toca em Compartilhar <Share className="size-4" aria-hidden /> na barra de baixo.
              </li>
              <li>
                Escolhe <strong>Adicionar à Tela de Início</strong> e confirma.
              </li>
            </ol>
          ) : (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              <li>Toca no menu do navegador (os três pontinhos).</li>
              <li>
                Escolhe <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
              </li>
              <li>Confirma. O cachorro aparece na tela inicial.</li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
