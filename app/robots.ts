// app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/sign-in/", "/sign-up/", "/onboarding/"],
      },
    ],
    sitemap: "https://chat.homerates.ai/sitemap.xml",
  };
}
