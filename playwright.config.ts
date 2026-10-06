import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import webpush from "web-push";

const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;

import { E2E_ADMIN } from "./e2e/fixtures";

// Banco só do e2e (PGlite numa pasta, docs/08 #55), zerado a cada rodada: o servidor
// cria as tabelas e semeia no start. A config também é carregada nos workers, com o
// servidor já de pé; aí não pode apagar nada (TEST_WORKER_INDEX só existe no worker).
const E2E_DB_DIR = path.resolve("data/e2e-pglite");
if (!process.env.TEST_WORKER_INDEX) {
  fs.rmSync(E2E_DB_DIR, { recursive: true, force: true });
}

// Chaves VAPID só do e2e: ligam "Chamar galera" e "Dedar" sem depender do .env da
// máquina. O banco do e2e não tem assinatura, então nenhum push sai de verdade.
const vapid = webpush.generateVAPIDKeys();

export default defineConfig({
  testDir: "./e2e",
  // O smoke é um fluxo só, longo (e em dev cada action compila na primeira chamada);
  // com a segunda avaliação do mesmo lugar ele passou de 2 min, e com o feed de posts
  // (mais uma rota e mais uma action pra compilar) encostou nos 3.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    // Sem GPS de verdade: o botão "onde estou" recebe a Praça XV.
    geolocation: { latitude: -27.5975, longitude: -48.55 },
    permissions: ["geolocation", "clipboard-read", "clipboard-write", "microphone"],
    // Microfone falso do Chrome (um tom com bipes) pro "Gravar áudio" gravar de verdade.
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    // `E2E_SERVER_LOG=1` mostra também o stdout do servidor (cada request e, junto com
    // `EONARGA_SQL_LOG=1`, cada query): é o que revela onde o dev server travou.
    stdout: process.env.E2E_SERVER_LOG === "1" ? "pipe" : "ignore",
    env: {
      ...process.env,
      DATABASE_URL: "pglite://./data/e2e-pglite",
      NEXT_PUBLIC_CAPTCHA_MODE: "always",
      APP_URL: BASE_URL,
      // Liga o link público (src/lib/share.ts) sem depender do .env da máquina.
      APP_SECRET: "e2e-nao-use-isso-em-producao",
      ADMIN_NAME: "Admin",
      ADMIN_EMAIL: E2E_ADMIN.email,
      ADMIN_PASSWORD: E2E_ADMIN.password,
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: "mailto:e2e@eonarga.local",
    },
  },
});
