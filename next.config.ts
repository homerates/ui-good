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
    return [
      // Hard noindex on any route that should never appear in search
      {
        source: "/lo/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/profile",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/borrower/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/borrowers/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/library",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/probe",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/identity",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/s/:slug",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/share",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/join",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
