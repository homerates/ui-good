// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * PUBLIC ROUTES (must work signed-out)
 * - Short links: /s/[slug]
 * - Share snapshot: /share
 * - Public APIs required by signed-out sharing
 */
const isPublicRoute = createRouteMatcher([
  "/share(.*)",
  "/s(.*)",
  "/api/shorten(.*)",
]);

export default clerkMiddleware((auth, req) => {
  if (isPublicRoute(req)) return;
  auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
