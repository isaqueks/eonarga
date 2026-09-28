import fs from "node:fs";
import path from "node:path";

import { getTableName, sql } from "drizzle-orm";

import { sqliteDumpToSql, tablesInFkOrder, type Dump } from "../src/lib/db/sqlite-dump";

/**
 * Ensaio da migração SQLite → Postgres (docs/08 #55) sem tocar em produção:
 *   npx tsx scripts/sqlite-dump-check.ts <pasta com um <tabela>.json por tabela>
 * Sobe um PGlite descartável, roda as migrations do repositório, aplica o script gerado
 * pelo `sqlite-dump-to-sql` e compara a contagem de linhas de cada tabela com o dump.
 * Qualquer diferença ou erro de FK/tipo aparece aqui, antes do `psql` de verdade.
 */
async function main() {
  const [dir] = process.argv.slice(2);
  if (!dir) {
    console.error("uso: tsx scripts/sqlite-dump-check.ts <pasta-json>");
    process.exit(2);
  }

  process.env.DATABASE_URL = "pglite://memory";

  const dump: Dump = {};
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const raw = fs.readFileSync(path.join(dir, file), "utf8").trim();
    dump[file.slice(0, -".json".length)] = raw ? (JSON.parse(raw) as Dump[string]) : [];
  }

  const { statements, summary } = sqliteDumpToSql(dump);
  if (summary.unknownTables.length) {
    console.log("fora (tabelas):", summary.unknownTables.join(", "));
  }
  for (const [table, cols] of Object.entries(summary.unknownColumns)) {
    console.log(`fora (colunas de ${table}):`, cols.join(", "));
  }

  const { runMigrations } = await import("../src/lib/db/migrate");
  await runMigrations();
  const { db, closeDb } = await import("../src/lib/db/client");

  const started = Date.now();
  await db.transaction(async (tx) => {
    for (const statement of statements) await tx.execute(sql.raw(statement));
  });
  console.log(`script aplicado em ${Date.now() - started} ms (${statements.length} comandos)`);

  let bad = 0;
  for (const table of tablesInFkOrder()) {
    const name = getTableName(table);
    const result = (await db.execute(sql`select count(*)::int as n from ${table}`)) as {
      rows: { n: number }[];
    };
    const n = Number(result.rows[0].n);
    const expected = summary.rows[name] ?? 0;
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`${ok ? "ok " : "!! "} ${name.padEnd(24)} dump=${expected} banco=${n}`);
  }
  await closeDb();
  if (bad > 0) {
    console.error(`${bad} tabela(s) com contagem diferente`);
    process.exit(1);
  }
  console.log("tudo bateu");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
