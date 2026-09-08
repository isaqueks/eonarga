/**
 * Roda uma vez quando o servidor Next sobe (dev, start e no container):
 * aplica migrations, faz o seed idempotente (categorias + primeiro admin) e liga a
 * varredura de flop.
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

  // Varredura de flop (docs/08 #50): a cada 5 min, no próprio processo do servidor.
  if (process.env.EONARGA_SKIP_FLOP_SWEEP !== "1") {
    const { startFlopSweeper } = await import("./lib/flop");
    startFlopSweeper();
  }
}
