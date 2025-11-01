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

export default clerkMiddleware((auth, req) => {
  // Always allow webhooks and explicitly public routes
  if (isWebhook(req) || isPublic(req)) return;

  // Everything else requires auth
  auth().protect();
});

/**
 * Matcher:
 * - Run on all routes except next internals and files with extensions
 * - This keeps static assets and prebuilt chunks out of middleware
 */
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
