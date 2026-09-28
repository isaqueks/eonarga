import { Skeleton } from "@/components/ui/skeleton";

/**
 * O que aparece enquanto o feed é montado no servidor (docs/08 #56): o título, o botão
 * de postar e três cards apagados, no lugar exato dos de verdade. Com isso o Next manda
 * o layout na hora e a navegação pro feed responde antes de o banco responder.
 */
export default function FeedLoading() {
  return (
    <div
      className="flex flex-1 flex-col gap-4 px-3 py-4"
      aria-busy="true"
      aria-label="Carregando as novidades"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-xl">Novidades</h1>
      </header>
      <Skeleton className="h-12 w-full rounded-md" />
      <ul className="flex flex-col">
        {[0, 1, 2].map((i) => (
          <li key={i} className="py-1.5">
            <div className="border-border bg-card flex flex-col gap-2 rounded-xl border px-2.5 py-3">
              <div className="flex items-center gap-2">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
