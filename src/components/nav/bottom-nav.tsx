"use client";

import { Dices, Map, Plus, Trophy, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Ranking", icon: Trophy },
  { href: "/mapa", label: "Mapa", icon: Map },
  { href: "/role", label: "Rolê", icon: Dices },
  { href: "/perfil", label: "Perfil", icon: User },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-[720px] items-stretch pb-[env(safe-area-inset-bottom)]">
        {ITEMS.slice(0, 2).map((item) => (
          <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}

        <li className="flex flex-1 items-center justify-center">
          <Link
            href="/lugares/novo"
            aria-label="Adicionar lugar"
            aria-current={isActive(pathname, "/lugares/novo") ? "page" : undefined}
            className="bg-primary text-primary-foreground focus-visible:ring-ring/50 -mt-5 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform outline-none focus-visible:ring-3 active:translate-y-px"
          >
            <Plus className="size-7" aria-hidden />
          </Link>
        </li>

        {ITEMS.slice(2).map((item) => (
          <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </ul>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "focus-visible:ring-ring/50 flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 py-2 text-[0.7rem] font-medium outline-none focus-visible:ring-3",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    </li>
  );
}
