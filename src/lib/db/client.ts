import type { PGlite } from "@electric-sql/pglite";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { createRequire } from "node:module";
import { Pool, types } from "pg";

import * as schema from "./schema";

/**
 * O banco (docs/08 #55): Postgres em produção (`postgres://…`, driver `pg`) e PGlite em
 * dev, teste e e2e (`pglite://./data/pglite` grava numa pasta; `pglite://memory` some ao
 * fechar). Mesmo dialeto, mesmas migrations, sem instalar servidor nenhum na máquina.
 *
 * O PGlite entra por `require` dentro do ramo dele, de propósito: assim não vai pro
 * bundle nem pra imagem Docker (são 25 MB de wasm que produção nunca usa). E a instância
 * só nasce na primeira query: o `next dev` sobe processos auxiliares (jest-worker) que
 * importam este módulo sem consultar nada, e dois PGlite na mesma pasta abortam.
 */
export type Db = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type DbKind = "postgres" | "pglite";

const DEV_DEFAULT_URL = "pglite://./data/pglite";

/** `count(*)` e `sum()` de inteiro (int8), `avg()` e `sum()/2.0` (numeric) chegam como número. */
const NUMBER_PARSERS: Record<number, (value: string) => number> = {
  20: Number, // int8
  1700: Number, // numeric
};

interface Created {
  db: Db;
  kind: DbKind;
  close: () => Promise<void>;
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;
  // Em produção a URL é obrigatória (o compose passa). O `next build` só carrega o módulo
  // e não consulta nada, então aqui não dá pra lançar: quem confere é o instrumentation.ts.
  return process.env.NODE_ENV === "production" ? "" : DEV_DEFAULT_URL;
}

function createPostgres(url: string): Created {
  for (const [oid, parse] of Object.entries(NUMBER_PARSERS)) {
    types.setTypeParser(Number(oid), parse);
  }
  // O Pool só conecta na primeira query.
  const pool = new Pool({
    connectionString: url || undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => {
    console.error("[eonarga] conexão do Postgres caiu:", error.message);
  });
  const db = drizzlePostgres({ client: pool, schema }) as unknown as Db;
  return { db, kind: "postgres", close: () => pool.end() };
}

function createPglite(target: string): Created {
  // `require` de verdade, não o do bundler: o pacote fica fora do bundle e da imagem.
  const load = createRequire(import.meta.url);
  const { drizzle } = load("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");

  // O drizzle só chama `query`/`transaction` na hora de executar; até lá, nada de wasm.
  let instance: PGlite | undefined;
  const real = (): PGlite => {
    if (!instance) {
      const { PGlite: PGliteClass } = load(
        "@electric-sql/pglite",
      ) as typeof import("@electric-sql/pglite");
      instance =
        target === "memory"
          ? new PGliteClass({ parsers: NUMBER_PARSERS })
          : new PGliteClass(target, { parsers: NUMBER_PARSERS });
    }
    return instance;
  };
  const lazy = new Proxy({} as PGlite, {
    get(_, property) {
      const client = real() as unknown as Record<PropertyKey, unknown>;
      const value = client[property];
      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(client)
        : value;
    },
  });

  const db = drizzle({ client: lazy, schema }) as unknown as Db;
  return { db, kind: "pglite", close: async () => await instance?.close() };
}

function create(): Created {
  const url = databaseUrl();
  if (url.startsWith("file:")) {
    throw new Error(
      `DATABASE_URL="${url}" é SQLite, que acabou na 0.19.0. Use postgres://… ou pglite://./data/pglite (docs/02).`,
    );
  }
  if (url.startsWith("pglite://")) return createPglite(url.slice("pglite://".length) || "memory");
  return createPostgres(url);
}

// Em dev o Next recarrega módulos; guardar no global evita abrir dezenas de pools (e, no
// PGlite, duas instâncias na mesma pasta, o que ele não aceita).
const g = globalThis as unknown as { __eonargaDb?: Created };
const created: Created = g.__eonargaDb ?? create();
if (process.env.NODE_ENV !== "production") g.__eonargaDb = created;

export const db: Db = created.db;
export const dbKind: DbKind = created.kind;

/** Fecha o pool (ou a instância do PGlite, se chegou a nascer). Os testes usam. */
export async function closeDb(): Promise<void> {
  await created.close();
  if (g.__eonargaDb === created) delete g.__eonargaDb;
}

export { schema };
