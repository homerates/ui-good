// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack from bundling react-pdf — it uses react-reconciler internally
  // and bundling it causes "Objects are not valid as a React child" (React error #31)
  serverExternalPackages: ['@react-pdf/renderer'],

  async redirects() {
    return [
      // Legacy route shim
      { source: "/chat", destination: "/", permanent: true },
      // Old loan-officer paths that may still be indexed — redirect to homepage
      { source: "/lo/:path*", destination: "/", permanent: true },
      { source: "/borrowers/:path*", destination: "/", permanent: true },
      { source: "/borrower/:path*", destination: "/", permanent: true },
      { source: "/join", destination: "/", permanent: true },
    ];
  },

  async headers() {
    const noIndex = { key: "X-Robots-Tag", value: "noindex, nofollow" };
    return [
      // Hard noindex on any route that should never appear in search
      { source: "/lo/:path*",         headers: [noIndex] },
      { source: "/profile",           headers: [noIndex] },
      { source: "/borrower/:path*",   headers: [noIndex] },
      { source: "/borrowers/:path*",  headers: [noIndex] },
      { source: "/library",           headers: [noIndex] },
      { source: "/probe",             headers: [noIndex] },
      { source: "/identity",          headers: [noIndex] },
      { source: "/s/:slug",           headers: [noIndex] },
      { source: "/share",             headers: [noIndex] },
      { source: "/join",              headers: [noIndex] },
      { source: "/onboarding/:path*", headers: [noIndex] },
      { source: "/onboarding",        headers: [noIndex] },
      { source: "/sign-in/:path*",    headers: [noIndex] },
      { source: "/sign-up/:path*",    headers: [noIndex] },
      { source: "/api/:path*",        headers: [noIndex] },
    ];
  },
};

export default nextConfig;
