import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getApiUser, unauthorized } from "@/lib/api-auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { MENTION_MIN_QUERY, MENTION_NAME_MAX, normalizeName } from "@/lib/mentions";

export const dynamic = "force-dynamic";

/** Quantas sugestões o autocomplete mostra. */
const LIMIT = 8;

/**
 * Autocomplete de menção: `?q=bre` devolve quem tem "bre" no nome (sem acento, sem
 * caixa), quem começa com isso primeiro. Só com sessão (docs/05): a lista da galera
 * não é pública. Grupo pequeno, então filtra em memória mesmo.
 */
export async function GET(request: Request) {
  const me = await getApiUser();
  if (!me) return unauthorized();

  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const query = normalizeName(raw).slice(0, MENTION_NAME_MAX);
  if (query.length < MENTION_MIN_QUERY) return NextResponse.json({ people: [] });

  const people = await db
    .select({ id: users.id, name: users.name, avatarId: users.avatarId })
    .from(users)
    .where(eq(users.isActive, true));

  const matches = people
    .map((person) => ({ person, key: normalizeName(person.name) }))
    .filter(({ key }) => key.includes(query))
    .sort((a, b) => {
      const aStarts = a.key.startsWith(query) ? 0 : 1;
      const bStarts = b.key.startsWith(query) ? 0 : 1;
      return aStarts - bStarts || a.person.name.localeCompare(b.person.name, "pt-BR");
    })
    .slice(0, LIMIT)
    .map(({ person }) => person);

  return NextResponse.json(
    { people: matches },
    { headers: { "cache-control": "private, no-store" } },
  );
}
