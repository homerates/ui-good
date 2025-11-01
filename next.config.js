/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable server runtime (required for Clerk + API routes)
  output: 'standalone',

  // Keep your existing lint behavior so builds don’t block
  eslint: { ignoreDuringBuilds: true },

  // Optional: keep this to ensure images and static assets still work as expected
  images: { domains: [] },
};

module.exports = nextConfig;
