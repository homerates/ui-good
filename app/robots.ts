// app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ── Standard crawlers ──────────────────────────────────────────
      {
        userAgent: "*",
        allow: ["/", "/api/og"],
        disallow: [
          "/api/",
          "/sign-in/",
          "/sign-up/",
          "/onboarding/",
          "/lo/",
          "/borrower/",
          "/borrowers/",
          "/join/",
          "/identity/",
          "/profile/",
          "/my-home/",
          "/probe/",
          "/library/",
          "/s/",
          "/share/",
        ],
      },
      // ── AI / LLM crawlers — explicitly welcome ─────────────────────
      { userAgent: "Twitterbot",        allow: "/" },
      { userAgent: "facebookexternalhit", allow: "/" },
      { userAgent: "GPTBot",          allow: "/" },
      { userAgent: "ChatGPT-User",    allow: "/" },
      { userAgent: "ClaudeBot",       allow: "/" },
      { userAgent: "anthropic-ai",    allow: "/" },
      { userAgent: "PerplexityBot",   allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Googlebot",       allow: "/" },
      { userAgent: "Bingbot",         allow: "/" },
      { userAgent: "Grok",            allow: "/" },
      { userAgent: "DeepSeekBot",     allow: "/" },
      { userAgent: "GeminiBot",       allow: "/" },
      { userAgent: "cohere-ai",       allow: "/" },
      { userAgent: "Meta-ExternalAgent", allow: "/" },
      { userAgent: "YouBot",          allow: "/" },
      { userAgent: "Amazonbot",       allow: "/" },
      { userAgent: "Applebot",        allow: "/" },
      { userAgent: "Baiduspider",     allow: "/" },
    ],
    sitemap: "https://chat.homerates.ai/sitemap.xml",
  };
}
