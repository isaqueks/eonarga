import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "E o narga?",
    short_name: "E o narga?",
    description: "Ranking de rolês do Centro. Interno. Zoeira.",
    lang: "pt-BR",
    start_url: "/feed?source=pwa",
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
    // "Compartilhar" do Instagram (e de qualquer app) cai no formulário de post com
    // o link no `?text=`; só Android/Chrome com o PWA instalado (docs/08 #37).
    share_target: {
      action: "/feed/novo",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
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
