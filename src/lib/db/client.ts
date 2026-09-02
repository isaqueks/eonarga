import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";

import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema> & { $client: Client };

const DEFAULT_URL = "file:./data/eonarga.db";

function ensureDir(url: string) {
  if (!url.startsWith("file:")) return;
  const filePath = url.slice("file:".length);
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function create(): Db {
  const url = process.env.DATABASE_URL ?? DEFAULT_URL;
  ensureDir(url);
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  // Por conexão: FKs ligadas, espera em vez de SQLITE_BUSY, e WAL pra leitura concorrente.
  // Fire-and-forget: as queries entram na mesma fila do cliente. O `next build` abre o
  // módulo em vários workers ao mesmo tempo, e mudar o journal_mode exige lock exclusivo;
  // por isso os erros são engolidos (o WAL é persistente: basta um deles conseguir).
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    for (const pragma of [
      "PRAGMA foreign_keys = ON",
      "PRAGMA busy_timeout = 5000",
      "PRAGMA journal_mode = WAL",
    ]) {
      void client.execute(pragma).catch(() => {});
    }
  }
  return drizzle({ client, schema });
}

// Em dev o Next recarrega módulos; guardar no global evita abrir dezenas de conexões.
const g = globalThis as unknown as { __eonargaDb?: Db };
export const db: Db = g.__eonargaDb ?? create();
if (process.env.NODE_ENV !== "production") g.__eonargaDb = db;

export { schema };
