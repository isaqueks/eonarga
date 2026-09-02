/**
 * Roda uma vez quando o servidor Next sobe (dev, start e no container):
 * aplica migrations e faz o seed idempotente (categorias + primeiro admin).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.EONARGA_SKIP_MIGRATE === "1") return;

  const { runMigrations } = await import("./lib/db/migrate");
  const { seedAll } = await import("./lib/db/seed");

  await runMigrations();
  const result = await seedAll();
  if (result.categoriesCreated > 0) {
    console.log(`[eonarga] categorias criadas: ${result.categoriesCreated}`);
  }
  if (result.admin.created) {
    console.log(`[eonarga] admin criado: ${result.admin.email}`);
  }
}
