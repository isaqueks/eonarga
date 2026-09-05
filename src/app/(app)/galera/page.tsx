import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { requireUser } from "@/lib/auth/guards";
import { formatInteger } from "@/lib/format";
import { isPushEnabled } from "@/lib/push";
import { listGalera, type GaleraUser } from "@/lib/queries/users";

import { Placar } from "./placar";
import { PokeRow } from "./poke-button";

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

/**
 * Gênero e testosterona, omitindo o que ninguém preencheu. Admin escreve o que quiser
 * nos dois (docs/08 #25): o número vem com ponto de milhar e a unidade grudada nele, e
 * a linha quebra em vez de cortar, senão "7000000000000 ng/dL" some atrás do "…".
 */
function bio(person: GaleraUser): string {
  const parts: string[] = [];
  if (person.gender) parts.push(person.gender);
  if (person.testosterone !== null) parts.push(`${formatInteger(person.testosterone)}\u00a0ng/dL`);
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
  const pushEnabled = isPushEnabled();

  return (
    <div className="flex flex-col gap-4 px-3 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl">Galera</h1>
        <p className="text-muted-foreground text-sm">
          {people.length} {people.length === 1 ? "pessoa" : "pessoas"}. Nada é privado.
        </p>
      </header>

      {people.length > 0 ? <Placar people={people} /> : null}

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

              <p className="text-muted-foreground wrap-anywhere">{bio(person)}</p>
              <p className="text-foreground/80 tabular-nums">{counters(person)}</p>
              <PokeRow
                userId={person.id}
                name={person.name}
                enabled={pushEnabled && person.id !== me.id}
              >
                <p className="text-muted-foreground text-xs">
                  {lastSeen(person.lastSeenAt ?? person.lastLoginAt)}
                </p>
              </PokeRow>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
