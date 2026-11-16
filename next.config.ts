import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reutiliza secciones recién visitadas; las acciones invalidan sus rutas al guardar.
  experimental: {
    staleTimes: { dynamic: 60 },
    // La carga masiva sube Excel de hasta 4 MB a una acción del servidor.
    serverActions: { bodySizeLimit: "5mb" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
