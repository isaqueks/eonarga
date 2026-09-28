import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Cada arquivo que usa banco sobe um PGlite (Postgres em wasm, docs/08 #55) no
    // beforeAll; com vários workers em paralelo o boot passa fácil dos 10 s padrão.
    hookTimeout: 90_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
