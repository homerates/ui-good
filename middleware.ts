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

  // --- make ALL API routes public ---
  "/api(.*)",
  // ----------------------------------

  // Next internals
  "/_next(.*)",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",

  // Your public asset buckets
  "/images(.*)",
  "/static(.*)",
  "/assets(.*)",          // <-- add this (your logo lives at /assets/homerates-mark.svg)
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
export const config = {
  // Run middleware on everything EXCEPT Next internals, static files, and your public asset folders
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|assets/|images/|static/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|css|js)).*)',
  ],
};

