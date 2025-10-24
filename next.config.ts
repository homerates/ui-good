// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // optional: only if TS errors block deploys
  // typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
