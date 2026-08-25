// app/robots.ts
//
// NOT CURRENTLY LIVE: a static public/robots.txt exists in this repo, and Next.js
// serves that file in preference to this dynamic route whenever both are present
// (documented Next.js behavior — the static file wins outright, this route is never
// invoked). Confirmed directly 2026-08-24 via a local production build + curl.
// public/robots.txt is the file that actually governs crawler behavior today.
// Kept here, corrected and in sync with public/robots.txt's disallow list, so this
// file is not a live landmine if the static one is ever removed — but any real
// crawler-behavior change must be made in public/robots.txt.
import type { MetadataRoute } from "next";

// Private / borrower-adjacent / professional-only / interactive-workflow surfaces.
// Every crawler group below (wildcard AND every named AI/search bot) must carry this
// same list — robots.txt group-matching is exclusive (most-specific match wins), so a
// named group with no disallow list silently overrides the wildcard's protection for
// that bot. Keeping one shared array is what prevents that drift.
const PRIVATE_PATHS = [
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
  "/track5",
  "/messages",
  "/messages/",
  "/pro/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ── Standard crawlers ──────────────────────────────────────────
      {
        userAgent: "*",
        allow: ["/", "/api/og", "/track5-intelligence"],
        disallow: PRIVATE_PATHS,
      },
      // ── AI / LLM crawlers — explicitly welcome on public pages only ─
      { userAgent: "Twitterbot",          allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "facebookexternalhit", allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "GPTBot",              allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "ChatGPT-User",        allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "ClaudeBot",           allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "anthropic-ai",        allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "PerplexityBot",       allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "Google-Extended",     allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "Googlebot",           allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "Bingbot",             allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "Grok",                allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "DeepSeekBot",         allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "GeminiBot",           allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "cohere-ai",           allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "Meta-ExternalAgent",  allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "YouBot",              allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "Amazonbot",           allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "Applebot",            allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
      { userAgent: "Baiduspider",         allow: ["/", "/track5-intelligence"], disallow: PRIVATE_PATHS },
    ],
    sitemap: "https://chat.homerates.ai/sitemap.xml",
  };
}
