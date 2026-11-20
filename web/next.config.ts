import type { NextConfig } from "next";

// En producción (Docker/VPS): BASE_PATH=/recetas → https://katiagadea.com.ar/recetas
// En local: vacío → http://localhost:3000
const basePath = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  // Evita que Turbopack tome un package-lock fuera del repo (p. ej. en el home).
  turbopack: {
    root: process.cwd(),
  },
  // Permite abrir el sitio desde el celular en la misma WiFi (IP local).
  // Sin esto, Next bloquea el JS de desarrollo y los botones no responden.
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
  ],
};

export default nextConfig;
