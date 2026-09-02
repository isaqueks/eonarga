import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
