// next.config.ts
//
// NOT CURRENTLY LIVE: a sibling next.config.mjs exists in this repo, and Next.js
// resolves that file in preference to this one whenever both are present — confirmed
// directly 2026-08-24 via a local production build + curl (this file's redirects()
// and headers() were found to have no effect; /chat did not redirect, and none of the
// X-Robots-Tag rules below were present on any response). next.config.mjs is the file
// that actually governs headers/redirects/webpack config today, and now carries its
// own copy of the noindex headers() this file defines. This file's redirects() (the
// legacy /lo, /borrowers, /join shims) and serverExternalPackages PDF workaround
// remain untouched and are DEFERRED — NOT PART OF THIS WORKSTREAM; if they're meant to
// be live, they need to move to next.config.mjs the same way headers() did.
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
      { source: "/share/:path*",      headers: [noIndex] },
      { source: "/track5",            headers: [noIndex] },
      { source: "/messages",          headers: [noIndex] },
      { source: "/messages/:path*",   headers: [noIndex] },
      { source: "/pro/:path*",        headers: [noIndex] },
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
