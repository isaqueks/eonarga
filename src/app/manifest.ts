import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "E o narga?",
    short_name: "E o narga?",
    description: "Ranking de rolês do Centro. Interno. Zoeira.",
    lang: "pt-BR",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1110",
    theme_color: "#0e1110",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Adicionar lugar",
        url: "/lugares/novo",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      { name: "Mapa", url: "/mapa" },
    ],
  };
}
