// app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // API routes — never indexed
          "/api/",
          // Auth flows
          "/sign-in/",
          "/sign-up/",
          "/onboarding/",
          // Loan-officer portal — auth-protected, not public content
          "/lo/",
          // Borrower-specific app flows
          "/borrower/",
          "/borrowers/",
          "/join/",
          "/identity/",
          // User account
          "/profile/",
          // Auth-required homeowner dashboard (no SEO value — sign-in wall)
          "/my-home/",
          // Internal/utility pages not meant for search
          "/probe/",
          "/library/",
          // Shared-link viewer (dynamic, no SEO value)
          "/s/",
          "/share/",
        ],
      },
    ],
    sitemap: "https://chat.homerates.ai/sitemap.xml",
  };
}
