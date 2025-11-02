// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Public routes (no auth required).
 * Add any additional public paths here (docs, blog, marketing, etc.)
 */
const isPublic = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
  "/api/public(.*)",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/_next(.*)",        // Next.js internals
  "/static(.*)",       // if you use /public/static
  "/images(.*)",       // if you expose images directly
]);

/**
 * Webhooks should never be gated behind auth.
 * Example: Stripe, Clerk webhooks, etc.
 */
const isWebhook = createRouteMatcher([
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Always allow webhooks and explicitly public routes
  if (isWebhook(req) || isPublic(req)) return;

  // Everything else requires auth (Clerk v5)
  await auth.protect();
});

