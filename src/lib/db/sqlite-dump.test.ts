import { getTableName, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sqlLiteral, sqliteDumpToSql, tablesInFkOrder, type Dump } from "./sqlite-dump";

type ClientModule = typeof import("./client");
type SchemaModule = typeof import("./schema");

let db: ClientModule["db"];
let closeDb: ClientModule["closeDb"];
let schema: SchemaModule;

const AT = "2026-09-01T12:00:00.000Z";

/** Um pedaço de produção como o `sqlite3 -json` entrega: booleans 0/1, datas em texto. */
const dump: Dump = {
  // De propósito fora de ordem: filhos antes dos pais, aviso de flop antes do post.
  post_comments: [
    {
      id: "c1",
      post_id: "p1",
      user_id: "u1",
      body: "",
      photo_id: "ph1",
      photo_width: 800,
      photo_height: 600,
      audio_id: null,
      audio_ext: null,
      audio_duration_ms: null,
      audio_peaks: null,
      created_at: AT,
      updated_at: AT,
    },
  ],
  posts: [
    {
      id: "p2",
      user_id: "u1",
      body: "O post de Ana flopou 200%",
      photo_id: null,
      place_id: null,
      lat: -27.5975,
      lng: -48.55,
      flop_of_post_id: "p1",
      flopped_at: null,
      created_at: AT,
      updated_at: AT,
    },
    {
      id: "p1",
      user_id: "u1",
      body: "Tô aqui e tem narga. Aspas: 'ok' e \"ok\"",
      photo_id: null,
      place_id: "pl1",
      lat: -27.5975,
      lng: -48.55,
      flop_of_post_id: null,
      flopped_at: AT,
      created_at: AT,
      updated_at: AT,
    },
  ],
  places: [
    {
      id: "pl1",
      slug: "sebo",
      name: "Sebo do João",
      category_id: "cat1",
      lat: -27.5975,
      lng: -48.55,
      has_narga: "yes",
      status: "active",
      created_by: "u1",
      created_at: AT,
      updated_at: AT,
    },
  ],
  categories: [
    { id: "cat1", name: "Sebo", slug: "sebo", emoji: "📚", color: "#8fd3b0", sort_order: 4 },
  ],
  users: [
    {
      id: "u1",
      name: "Ana",
      email: "ana@example.com",
      password_hash: "x",
      role: "admin",
      is_active: 1,
      must_change_password: 0,
      last_login_at: null,
      last_seen_at: AT,
      avatar_id: null,
      gender: null,
      testosterone: null,
      created_at: AT,
      updated_at: AT,
    },
  ],
  // Tabela que não existe mais: fica de fora, sem quebrar.
  sqlite_stat1: [{ tbl: "users", idx: null, stat: "1" }],
};

beforeAll(async () => {
  process.env.DATABASE_URL = "pglite://memory";
  const { runMigrations } = await import("./migrate");
  await runMigrations();
  ({ db, closeDb } = await import("./client"));
  schema = await import("./schema");
});

afterAll(async () => {
  await closeDb();
});

describe("tablesInFkOrder", () => {
  it("põe pais antes de filhos e cobre o schema inteiro", () => {
    const names = tablesInFkOrder().map((table) => getTableName(table));
    expect(names.indexOf("users")).toBeLessThan(names.indexOf("sessions"));
    expect(names.indexOf("categories")).toBeLessThan(names.indexOf("places"));
    expect(names.indexOf("places")).toBeLessThan(names.indexOf("reviews"));
    expect(names.indexOf("posts")).toBeLessThan(names.indexOf("post_comments"));
    expect(names.indexOf("post_comments")).toBeLessThan(names.indexOf("post_comment_likes"));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("push_subscriptions");
  });
});

describe("sqlLiteral", () => {
  it("0/1 vira boolean pelo tipo da coluna; texto escapa aspas; null é NULL", () => {
    expect(sqlLiteral(1, schema.users.isActive)).toBe("true");
    expect(sqlLiteral(0, schema.users.mustChangePassword)).toBe("false");
    expect(sqlLiteral(null, schema.users.avatarId)).toBe("NULL");
    expect(sqlLiteral("d'água", schema.places.name)).toBe("'d''água'");
    expect(sqlLiteral(-27.5975, schema.places.lat)).toBe("-27.5975");
    expect(sqlLiteral(7, schema.users.testosterone)).toBe("7");
    expect(() => sqlLiteral(2, schema.users.isActive)).toThrow(/Boolean inválido/);
  });
});

describe("sqliteDumpToSql", () => {
  it("gera um script que o Postgres aceita, na ordem certa, e conta o que entrou", async () => {
    const { sql: script, statements, summary } = sqliteDumpToSql(dump);
    // O psql roda o arquivo inteiro numa transação; aqui, o mesmo, comando a comando.
    const apply = () =>
      db.transaction(async (tx) => {
        for (const statement of statements) await tx.execute(sql.raw(statement));
      });

    expect(summary.rows).toMatchObject({ users: 1, categories: 1, places: 1, posts: 2 });
    expect(summary.unknownTables).toEqual(["sqlite_stat1"]);
    expect(summary.unknownColumns).toEqual({});
    expect(script.startsWith("BEGIN;\nTRUNCATE TABLE ")).toBe(true);
    // O post original vem antes do aviso que aponta pra ele.
    expect(script.indexOf("('p1'")).toBeLessThan(script.indexOf("('p2'"));

    await apply();

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ isActive: true, mustChangePassword: false, lastSeenAt: AT });
    const posts = await db.select().from(schema.posts).orderBy(schema.posts.id);
    expect(posts.map((post) => post.id)).toEqual(["p1", "p2"]);
    expect(posts[0].body).toContain("Aspas: 'ok' e \"ok\"");
    expect(posts[1].flopOfPostId).toBe("p1");
    const comments = await db.select().from(schema.postComments);
    expect(comments[0]).toMatchObject({ photoId: "ph1", photoWidth: 800, audioId: null });

    // Rodar de novo: o TRUNCATE limpa e o resultado é o mesmo (nada duplica).
    await apply();
    expect(await db.select().from(schema.posts)).toHaveLength(2);

    // Tipos que o driver devolve: count/sum são número, não texto (parsers do client.ts).
    const [agg] = await db
      .select({ n: sql<number>`count(*)`, half: sql<number>`sum(${schema.posts.lat}) / 2.0` })
      .from(schema.posts);
    expect(agg).toEqual({ n: 2, half: -27.5975 });
  });
});
