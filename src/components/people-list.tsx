import { UserAvatar } from "@/components/user-avatar";
import type { PersonRef } from "@/lib/queries/places";
import { cn } from "@/lib/utils";

/** "Já foram: [avatar] Ana, [avatar] Bia" — avatares pequenos com o nome ao lado. */
export function PeopleList({
  label,
  people,
  className,
}: {
  label: string;
  people: PersonRef[];
  className?: string;
}) {
  if (people.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      {people.map((person) => (
        <span key={person.id} className="inline-flex items-center gap-1">
          <UserAvatar name={person.name} avatarId={person.avatarId} size="sm" />
          <span>{person.name}</span>
        </span>
      ))}
    </div>
  );
}
