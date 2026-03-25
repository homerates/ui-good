// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack from bundling react-pdf — it uses react-reconciler internally
  // and bundling it causes "Objects are not valid as a React child" (React error #31)
  serverExternalPackages: ['@react-pdf/renderer'],
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
