import { defineConfig } from "drizzle-kit";

// `generate` só lê o schema. A URL é pro `studio`/`push` e aponta pro Postgres local
// (o PGlite de dev não abre porta; pra olhar o banco de dev use o `db:studio` com um
// Postgres de verdade ou o próprio app).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://eonarga:eonarga@localhost:5432/eonarga",
  },
  strict: true,
  verbose: true,
});
