"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * Troca o tema. O rótulo muda por CSS (`dark:`), não por estado: a classe do <html>
 * já está certa antes da hidratação (script do next-themes), então não tem flash
 * nem divergência entre servidor e cliente.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="lg"
      className="h-11 w-full justify-start gap-2"
      onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
    >
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <Moon className="size-4 dark:hidden" aria-hidden />
      <span className="hidden dark:inline">Modo claro? E o narga?</span>
      <span className="dark:hidden">Voltar pro escuro</span>
    </Button>
  );
}
