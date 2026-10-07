import type { NextConfig } from "next";

/**
 * ERP autenticado: todas as telas são renderizadas por requisição
 * (dados sempre atualizados), por isso não usamos Cache Components aqui.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
];

const nextConfig: NextConfig = {
  // Na Netlify o adaptador oficial cuida do empacotamento; em Docker/VPS usamos standalone.
  output: process.env.NETLIFY ? undefined : "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  experimental: {
    // Fotos de obra (até 20 por envio). Vídeos grandes devem usar upload direto ao storage.
    serverActions: { bodySizeLimit: "25mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
