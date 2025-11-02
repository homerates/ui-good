// middleware.ts (REPLACE ALL)
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/** Public routes (no auth) */
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
  if (isWebhook(req) || isPublic(req)) return;
  await auth.protect();
});

/** CRITICAL: never run middleware for /api */
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
