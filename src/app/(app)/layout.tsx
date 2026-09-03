import { Newspaper, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { BottomNav } from "@/components/nav/bottom-nav";
import { requireUser } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

/** Alvo de 44 px, como o resto dos toques (docs/04). */
const headerIcon =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-11 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col">
      <header className="border-border bg-background/95 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
        <Link href="/feed" className="flex items-center gap-2">
          <Image
            src="/icons/logo-face.png"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-full object-cover"
          />
          <span className="font-display text-base">E o narga?</span>
        </Link>

        <Link
          href="/feed"
          aria-label="Novidades"
          title="Novidades"
          className={cn("ml-auto", headerIcon)}
        >
          <Newspaper className="size-5" aria-hidden />
        </Link>

        <Link href="/galera" aria-label="Galera" title="Galera" className={headerIcon}>
          <Users className="size-5" aria-hidden />
        </Link>
      </header>

      <main className="flex flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
