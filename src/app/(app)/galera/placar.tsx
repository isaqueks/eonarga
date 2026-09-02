import { UserAvatar } from "@/components/user-avatar";
import { formatStars } from "@/lib/format";
import type { GaleraUser } from "@/lib/queries/users";
import {
  buildScoreboard,
  SCOREBOARD_LABELS,
  type ScoreboardEntry,
  type ScoreboardKey,
} from "@/lib/scoreboard";

/** "5 notas", "3 lugares", "2,5 de média" — o número de cada card. */
function formatValue(key: ScoreboardKey, value: number): string {
  switch (key) {
    case "reviews":
      return `${value} ${value === 1 ? "nota" : "notas"}`;
    case "places":
    case "visited":
      return `${value} ${value === 1 ? "lugar" : "lugares"}`;
    case "critic":
      return `${formatStars(value)} de média`;
  }
}

/**
 * Placar da galera (docs/01): quem mais avaliou, mais cadastrou, mais rodou e o
 * crítico mais chato. Quem ordena é `buildScoreboard`; aqui é só a vitrine.
 */
export function Placar({ people }: { people: GaleraUser[] }) {
  const entries = buildScoreboard(people);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-base">Placar</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {entries.map((entry) => (
          <li key={entry.key}>
            <PlacarCard entry={entry} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlacarCard({ entry }: { entry: ScoreboardEntry<GaleraUser> }) {
  return (
    <div className="border-border bg-card flex h-full flex-col gap-2 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs font-medium">{SCOREBOARD_LABELS[entry.key]}</p>

      {entry.person && entry.value !== null ? (
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar name={entry.person.name} avatarId={entry.person.avatarId} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{entry.person.name}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatValue(entry.key, entry.value)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">ninguém ainda</p>
      )}
    </div>
  );
}
