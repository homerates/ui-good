// middleware.ts (REPLACE ALL)
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Public routes (no auth required)
 */
const isPublic = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Make ALL API routes public (chat, calc, version, etc.)
  "/api/(.*)",
  "/_next(.*)",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/images(.*)",
  "/static(.*)",
]);

/**
 * Webhooks are always public
 */
const isWebhook = createRouteMatcher(["/api/webhooks(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Allow webhooks and public routes
  if (isWebhook(req) || isPublic(req)) return;

  // Everything else requires auth (Clerk v5)
  await auth.protect();
});

/**
 * Apply middleware to all routes except static assets
 * (prevents unnecessary work and weird edge cases)
 */
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
