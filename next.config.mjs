// next.config.mjs
//
// This is the config file Next.js actually loads — confirmed directly 2026-08-24 via
// a local production build + curl (next.config.ts's headers()/redirects() were found
// to be entirely inert; a sibling next.config.ts exists with a more complete
// headers()/redirects()/serverExternalPackages setup, but Next.js resolves this .mjs
// file first when both are present, so that file has never taken effect in this app).
// The noindex headers() below restore the crawler/indexing protection next.config.ts
// intended for private, borrower-adjacent, and professional-only routes. Any future
// noindex/redirect change must be made HERE to actually take effect.
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

  async headers() {
    const noIndex = { key: "X-Robots-Tag", value: "noindex, nofollow" };
    return [
      { source: "/lo/:path*",         headers: [noIndex] },
      { source: "/profile",           headers: [noIndex] },
      { source: "/borrower/:path*",   headers: [noIndex] },
      { source: "/borrowers/:path*",  headers: [noIndex] },
      { source: "/library",           headers: [noIndex] },
      { source: "/probe",             headers: [noIndex] },
      { source: "/identity",          headers: [noIndex] },
      { source: "/s/:slug",           headers: [noIndex] },
      { source: "/share/:path*",      headers: [noIndex] },
      { source: "/track5",            headers: [noIndex] },
      { source: "/messages",          headers: [noIndex] },
      { source: "/messages/:path*",   headers: [noIndex] },
      { source: "/pro/:path*",        headers: [noIndex] },
      { source: "/join",              headers: [noIndex] },
      { source: "/onboarding/:path*", headers: [noIndex] },
      { source: "/sign-in/:path*",    headers: [noIndex] },
      { source: "/sign-up/:path*",    headers: [noIndex] },
      { source: "/api/:path*",        headers: [noIndex] },
    ];
  },

};

export default nextConfig;
