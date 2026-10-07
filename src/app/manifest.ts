import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Revolution Imper Gestão 360",
    short_name: "Revolution 360",
    description: "Controle total da sua operação.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f4f5",
    theme_color: "#0e2a3b",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Bater ponto", url: "/campo?acao=ponto" },
      { name: "Diário de obra", url: "/campo?acao=diario" },
    ],
  };
}
