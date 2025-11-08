// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep things simple; no experimental flags.
  async redirects() {
    return [
      {
        source: "/chat",
        destination: "/app/chat",
        permanent: false, // 307
      },
    ];
  },
};

export default nextConfig;
