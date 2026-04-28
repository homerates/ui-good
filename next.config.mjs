// next.config.mjs
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Map "@/..." -> "<repo>/src/..."
    config.resolve.alias["@"] = path.resolve(process.cwd(), "src");
    return config;
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  // Proxy all Clerk traffic through homerates.ai so corporate/financial network
  // firewalls never see clerk.homerates.ai — browsers only talk to our own domain.
  async rewrites() {
    return [
      {
        source: '/clerk-proxy/:path*',
        destination: 'https://clerk.homerates.ai/:path*',
      },
    ];
  },
};

export default nextConfig;
