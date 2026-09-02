import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { requireUser } from "@/lib/auth/guards";
import { listGalera, type GaleraUser } from "@/lib/queries/users";

export const metadata: Metadata = { title: "Galera" };

export const dynamic = "force-dynamic";

/** "3 lugares · 5 notas · 2 quero ir · 4 já fui", sempre no plural certo. */
function counters(person: GaleraUser): string {
  return [
    `${person.placesCreated} ${person.placesCreated === 1 ? "lugar" : "lugares"}`,
    `${person.reviewCount} ${person.reviewCount === 1 ? "nota" : "notas"}`,
    `${person.wantCount} quero ir`,
    `${person.visitedCount} já fui`,
  ].join(" · ");
}

/** Gênero e testosterona, omitindo o que ninguém preencheu. */
function bio(person: GaleraUser): string {
  const parts: string[] = [];
  if (person.gender) parts.push(person.gender);
  if (person.testosterone !== null) parts.push(`${person.testosterone} ng/dL`);
  return parts.length > 0 ? parts.join(" · ") : "sem dados. suspeito.";
}

function lastSeen(iso: string | null): string {
  if (!iso) return "nunca entrou";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "nunca entrou";
  return `visto ${formatDistanceToNow(date, { addSuffix: true, locale: ptBR })}`;
}

export default async function GaleraPage() {
  const { user: me } = await requireUser();
  const people = await listGalera();

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl">Galera</h1>
        <p className="text-muted-foreground text-sm">
          {people.length} {people.length === 1 ? "pessoa" : "pessoas"}. Nada é privado.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {people.map((person) => (
          <li
            key={person.id}
            className="border-border bg-card flex gap-3 rounded-lg border p-3 text-sm"
          >
            <UserAvatar name={person.name} avatarId={person.avatarId} size="md" />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 truncate font-semibold">{person.name}</h2>
                {person.id === me.id ? (
                  <span className="text-muted-foreground shrink-0 text-xs">(você)</span>
                ) : null}
                {person.role === "admin" ? (
                  <Badge variant="secondary" className="shrink-0">
                    admin
                  </Badge>
                ) : null}
              </div>

              <p className="text-muted-foreground truncate">{bio(person)}</p>
              <p className="text-foreground/80 tabular-nums">{counters(person)}</p>
              <p className="text-muted-foreground text-xs">{lastSeen(person.lastLoginAt)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
