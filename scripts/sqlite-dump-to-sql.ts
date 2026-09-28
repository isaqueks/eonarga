import fs from "node:fs";
import path from "node:path";

import { sqliteDumpToSql, type Dump } from "../src/lib/db/sqlite-dump";

/**
 * Migração SQLite → Postgres (docs/08 #55), passo do meio:
 *   npx tsx scripts/sqlite-dump-to-sql.ts <pasta com um <tabela>.json por tabela> <saida.sql>
 * Os JSON vêm de `sqlite3 -json eonarga.db "select * from <tabela>"` (arquivo vazio =
 * tabela vazia). O .sql sai pronto pro `psql -v ON_ERROR_STOP=1 -1 -f`.
 */
const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error("uso: tsx scripts/sqlite-dump-to-sql.ts <pasta-json> <saida.sql>");
  process.exit(2);
}

const dump: Dump = {};
for (const file of fs.readdirSync(dir).sort()) {
  if (!file.endsWith(".json")) continue;
  const raw = fs.readFileSync(path.join(dir, file), "utf8").trim();
  dump[file.slice(0, -".json".length)] = raw ? (JSON.parse(raw) as Dump[string]) : [];
}

const { sql, summary } = sqliteDumpToSql(dump);
fs.writeFileSync(out, sql);
for (const [table, rows] of Object.entries(summary.rows))
  console.log(`${table.padEnd(24)} ${rows}`);
if (summary.unknownTables.length)
  console.log("fora (tabela desconhecida):", summary.unknownTables.join(", "));
for (const [table, cols] of Object.entries(summary.unknownColumns)) {
  console.log(`fora (colunas desconhecidas em ${table}):`, cols.join(", "));
}
console.log(`escrito ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} kB)`);
