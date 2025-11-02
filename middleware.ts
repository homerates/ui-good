// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/** Public routes */
const isPublic = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/_next(.*)",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/images(.*)",
  "/static(.*)",
]);

/** Webhooks always public */
const isWebhook = createRouteMatcher(["/api/webhooks(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Allow webhooks & explicit public pages
  if (isWebhook(req) || isPublic(req)) return;

  // Everything else requires auth
  await auth.protect();
});

/** CRITICAL: never run middleware for /api */
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
