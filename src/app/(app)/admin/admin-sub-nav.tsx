"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/categorias", label: "Categorias" },
  { href: "/admin/importar", label: "Importar" },
] as const;

export function AdminSubNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções da administração" className="border-border flex gap-1 border-b">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-medium",
              active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
