import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El paquete de marca se publica como TypeScript sin compilar.
  transpilePackages: ['@tabi/ui'],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
