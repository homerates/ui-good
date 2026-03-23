// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * PUBLIC ROUTES (must work signed-out / accessible to Googlebot)
 * - Homepage + main chat UI
 * - All calculator + SEO pages
 * - Legal pages
 * - Short links and share snapshots
 * - Public APIs (ticker, health, answers, shorten)
 * - Sitemap + robots (Google must be able to fetch these)
 */
const isPublicRoute = createRouteMatcher([
  // Core app
  "/",
  // Calculator pages
  "/calculators(.*)",
  "/affordability-calculator(.*)",
  "/conventional-loan-calculator(.*)",
  "/dscr-calculator(.*)",
  "/fha-calculator(.*)",
  "/refinance-calculator(.*)",
  // Income cluster / SEO pages
  "/how-much-house-can-i-afford-on-(.*)",
  // Legal
  "/about(.*)",
  "/privacy(.*)",
  "/disclosures(.*)",
  // Sharing
  "/share(.*)",
  "/s(.*)",
  // Auth flows (Clerk handles these itself)
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  // Public APIs
  "/api/shorten(.*)",
  "/api/ticker(.*)",
  "/api/health(.*)",
  "/api/answers(.*)",
  "/api/fred(.*)",
  "/api/calc(.*)",
  "/api/piti(.*)",
  "/api/calculate(.*)",
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
