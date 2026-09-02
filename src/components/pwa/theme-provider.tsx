"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";

/** Barra do sistema no celular: fundo do tema, pra não ficar uma faixa preta no claro. */
const THEME_COLOR = { dark: "#0e1110", light: "#f4f6f5" } as const;

/**
 * Escuro é o padrão (docs/04) e não seguimos o sistema: quem quiser claro troca no perfil.
 * `attribute="class"` porque o Tailwind aqui usa `@custom-variant dark (&:is(.dark *))`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <ThemeColorMeta />
      {children}
    </NextThemesProvider>
  );
}

/**
 * O `viewport.themeColor` do Next é estático e o nosso tema é classe, não media query:
 * sincronizar a meta no cliente é o jeito de a barra do Android acompanhar o toggle.
 */
function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = resolvedTheme === "light" ? THEME_COLOR.light : THEME_COLOR.dark;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [resolvedTheme]);

  return null;
}
