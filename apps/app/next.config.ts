import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El paquete de marca se publica como TypeScript sin compilar.
  transpilePackages: ['@tabi/ui'],
  cacheComponents: true,
  partialPrefetching: true,
  // En desarrollo, abrir la app desde un celular en la misma red Wi-Fi (para probar QR y NFC).
  allowedDevOrigins: ['192.168.*.*'],
};

export default nextConfig;
