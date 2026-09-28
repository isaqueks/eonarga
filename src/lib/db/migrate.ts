import { readMigrationFiles } from "drizzle-orm/migrator";
import type { PgDialect, PgSession } from "drizzle-orm/pg-core";
import path from "node:path";

import { db } from "./client";

/**
 * Aplica as migrations de ./drizzle. Idempotente: roda no start do container, no
 * `npm run db:migrate` e no começo de cada arquivo de teste. Chama o migrador do dialeto
 * direto (é o que `drizzle-orm/node-postgres/migrator` e `…/pglite/migrator` fazem por
 * dentro), pra servir aos dois drivers sem importar o PGlite em produção.
 */
export async function runMigrations() {
  const config = { migrationsFolder: path.join(process.cwd(), "drizzle") };
  const migrations = readMigrationFiles(config);
  const { dialect, session } = db as unknown as { dialect: PgDialect; session: PgSession };
  await dialect.migrate(migrations, session, config);
}
