import { getTableColumns, getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable, type PgColumn } from "drizzle-orm/pg-core";

import * as schema from "./schema";

/**
 * Migração SQLite → Postgres (docs/08 #55), o lado puro: recebe o que `sqlite3 -json`
 * cuspiu de cada tabela e devolve um script SQL pro `psql`. Tabelas em ordem de FK (pais
 * antes de filhos), linhas com auto-referência (o aviso de flop aponta pro post) com as
 * "raízes" primeiro, booleans 0/1 virando true/false pelo tipo da coluna no schema.
 *
 * O script começa com TRUNCATE de tudo: o app já subiu uma vez e semeou categorias e
 * admin com ids novos, que dariam conflito com os originais. Rodar de novo é seguro.
 */

/** Uma linha como o `sqlite3 -json` entrega: coluna → valor (número, texto, null). */
export type DumpRow = Record<string, unknown>;
/** Nome da tabela (no banco) → linhas. */
export type Dump = Record<string, DumpRow[]>;

/** Quantas linhas por INSERT. */
const BATCH = 200;

/** Tabelas do schema, pais antes de filhos. */
export function tablesInFkOrder(): PgTable[] {
  const tables = Object.values(schema as Record<string, unknown>).filter(
    (value): value is PgTable => is(value, PgTable),
  );
  const byName = new Map(tables.map((table) => [getTableName(table), table]));
  const parents = new Map<string, Set<string>>();
  for (const table of tables) {
    const name = getTableName(table);
    const refs = new Set<string>();
    for (const fk of getTableConfig(table).foreignKeys) {
      const parent = getTableName(fk.reference().foreignTable);
      if (parent !== name) refs.add(parent);
    }
    parents.set(name, refs);
  }

  const ordered: PgTable[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (name: string) => {
    if (done.has(name)) return;
    if (visiting.has(name)) throw new Error(`Ciclo de FK envolvendo ${name}`);
    visiting.add(name);
    for (const parent of parents.get(name) ?? []) visit(parent);
    visiting.delete(name);
    done.add(name);
    ordered.push(byName.get(name)!);
  };
  for (const name of [...byName.keys()].sort()) visit(name);
  return ordered;
}

/** Colunas que apontam pra própria tabela (`posts.flop_of_post_id`). */
function selfReferences(table: PgTable): string[] {
  const name = getTableName(table);
  const columns: string[] = [];
  for (const fk of getTableConfig(table).foreignKeys) {
    if (getTableName(fk.reference().foreignTable) !== name) continue;
    for (const column of fk.reference().columns) columns.push(column.name);
  }
  return columns;
}

/** Valor JSON do SQLite → literal SQL, olhando o tipo da coluna no schema do Postgres. */
export function sqlLiteral(value: unknown, column: PgColumn): string {
  if (value === null || value === undefined) return "NULL";
  if (column.columnType === "PgBoolean") {
    if (value === 1 || value === "1" || value === true) return "true";
    if (value === 0 || value === "0" || value === false) return "false";
    throw new Error(`Boolean inválido em ${column.name}: ${String(value)}`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Número inválido em ${column.name}: ${value}`);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.includes("\0")) throw new Error(`NUL em ${column.name}: o Postgres não aceita`);
  return `'${text.replace(/'/g, "''")}'`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export interface DumpSummary {
  /** Tabela → linhas geradas. */
  rows: Record<string, number>;
  /** Tabelas presentes no dump que o schema não conhece (ficam de fora). */
  unknownTables: string[];
  /** Colunas presentes no dump que o schema não conhece, por tabela (ficam de fora). */
  unknownColumns: Record<string, string[]>;
}

export interface DumpScript {
  /** O script inteiro (BEGIN … COMMIT), pronto pro `psql`. */
  sql: string;
  /** Os mesmos comandos, um a um e sem BEGIN/COMMIT, pra quem roda dentro de uma transação. */
  statements: string[];
  summary: DumpSummary;
}

/** O script e um resumo do que entrou e do que ficou de fora. */
export function sqliteDumpToSql(dump: Dump): DumpScript {
  const tables = tablesInFkOrder();
  const known = new Set(tables.map((table) => getTableName(table)));
  const summary: DumpSummary = {
    rows: {},
    unknownTables: Object.keys(dump)
      .filter((name) => !known.has(name))
      .sort(),
    unknownColumns: {},
  };

  const lines: string[] = [];
  lines.push(
    `TRUNCATE TABLE ${tables.map((table) => quoteIdent(getTableName(table))).join(", ")} CASCADE;`,
  );

  for (const table of tables) {
    const name = getTableName(table);
    const rows = dump[name] ?? [];
    summary.rows[name] = rows.length;
    if (rows.length === 0) continue;

    const columns = Object.values(getTableColumns(table));
    const byDbName = new Map(columns.map((column) => [column.name, column]));
    const present = new Set<string>();
    const unknown = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) (byDbName.has(key) ? present : unknown).add(key);
    }
    if (unknown.size > 0) summary.unknownColumns[name] = [...unknown].sort();
    const used = columns.filter((column) => present.has(column.name));

    // Auto-referência: quem não aponta pra ninguém entra primeiro.
    const selfRefs = selfReferences(table);
    const sorted = [...rows].sort((a, b) => {
      const depthA = selfRefs.some((column) => a[column] != null) ? 1 : 0;
      const depthB = selfRefs.some((column) => b[column] != null) ? 1 : 0;
      return depthA - depthB;
    });

    const columnList = used.map((column) => quoteIdent(column.name)).join(", ");
    for (let i = 0; i < sorted.length; i += BATCH) {
      const values = sorted
        .slice(i, i + BATCH)
        .map((row) => `(${used.map((column) => sqlLiteral(row[column.name], column)).join(", ")})`)
        .join(",\n  ");
      lines.push(`INSERT INTO ${quoteIdent(name)} (${columnList}) VALUES\n  ${values};`);
    }
  }

  const sql = ["BEGIN;", ...lines, "COMMIT;"].join("\n") + "\n";
  return { sql, statements: lines, summary };
}
