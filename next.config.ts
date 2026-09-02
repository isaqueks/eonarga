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
        // Headers de segurança do docs/05, em todas as rotas.
        source: "/(.*)",
        headers: securityHeaders(),
      },
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

/**
 * CSP e afins (docs/05). Sem nonce de propósito: o App Router e o next-themes
 * precisam de script inline, e nonce exigiria plumbing no proxy pra ganho pequeno
 * num app fechado. O que a CSP fecha de verdade aqui: origem de scripts, imagens
 * (só nós e os tiles do OSM), frames e formulários.
 */
function securityHeaders() {
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    // Turbopack usa eval no dev; Cloudflare pode injetar Rocket Loader / Web Analytics.
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://ajax.cloudflare.com https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "font-src 'self' data:",
    // A CSP também vale pro /sw.js, e lá o fetch dos tiles é `connect-src`, não `img-src`.
    `connect-src 'self'${dev ? " ws: wss:" : ""} https://tile.openstreetmap.org https://cloudflareinsights.com`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    // Manda só a origem pra terceiros (os tiles do OSM pedem pra saber quem chama).
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=()" },
  ];
}

export default nextConfig;
