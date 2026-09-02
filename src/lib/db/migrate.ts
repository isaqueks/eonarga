import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";

import { db } from "./client";

/** Aplica as migrations de ./drizzle. Idempotente: roda no start do container e no `npm run db:migrate`. */
export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
