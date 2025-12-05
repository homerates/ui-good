// next.config.mjs
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Map "@/..." -> "<repo>/src/..."
    config.resolve.alias["@"] = path.resolve(process.cwd(), "src");
    return config;
  },

  // 👇 Add this block to disable ESLint during builds
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
