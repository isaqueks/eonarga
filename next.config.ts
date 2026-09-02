import { readFileSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

// A versão do package.json vira a query do registro do SW (`/sw.js?v=…`): é o que faz
// o navegador baixar um worker novo e o que dá nome aos caches de cada release.
const { version } = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Imagem Docker usa .next/standalone (ver Dockerfile).
  output: "standalone",
  reactStrictMode: true,
  // Pacotes com binário nativo ficam fora do bundle e são resolvidos do node_modules.
  serverExternalPackages: ["@libsql/client", "libsql", "@node-rs/argon2", "sharp"],
  // Garante que o standalone leve os binários por plataforma e as migrations.
  outputFileTracingIncludes: {
    "/**/*": [
      "./drizzle/**/*",
      "./node_modules/@libsql/**/*",
      "./node_modules/libsql/**/*",
      "./node_modules/@node-rs/**/*",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: {
      // O padrão do Next é 1 MB e a foto de perfil pode ter até 10 MB (MAX_UPLOAD_BYTES);
      // a folga cobre o overhead do multipart. Quem valida o tamanho de fato é a action.
      bodySizeLimit: "11mb",
    },
  },
  async headers() {
    return [
      {
        // O service worker nunca pode vir do cache do navegador, senão uma versão
        // velha ficaria presa mandando no app.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
