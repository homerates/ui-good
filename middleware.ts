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
  "/chat",
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
  "/api/share/load(.*)",
  // Auth flows (Clerk handles these itself)
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  // /welcome is intentionally NOT public — it's post-signup onboarding for signed-in users
  // Clerk must validate the session at the edge so the client context is ready when React hydrates
  // Public APIs
  "/api/shorten(.*)",
  "/api/ticker(.*)",
  "/api/health(.*)",
  "/api/answers(.*)",
  "/api/fred(.*)",
  "/api/calc(.*)",
  "/api/piti(.*)",
  "/api/calculate(.*)",
  "/api/property/lookup(.*)",
  "/api/alerts/check(.*)",
  // Webhooks — verified by their own signature checks, not Clerk
  "/api/webhooks/clerk(.*)",
  "/api/webhooks/stripe(.*)",
  // Pricing page (public — signed-out users must be able to see it)
  "/pricing(.*)",
  // Lender Match landing (public — borrowers must see it before signing up)
  "/connect",
  // For professionals landing (public — LOs and agents must see it before signing up)
  "/for-pros",
  // Professional directory + self-registration (public browsing; form handles its own auth check)
  "/professionals(.*)",
  "/api/pro-directory(.*)",
  // Knowledge hub + market news (public SEO pages)
  "/knowledge-hub(.*)",
  "/market-news(.*)",
  // Messages — client-side auth via useAuth; API routes remain server-protected
  // Making public here prevents Clerk edge middleware from redirecting email link clicks
  // when the cookie isn't immediately visible at the edge (new tab, email client, etc.)
  "/messages(.*)",
  // Market intelligence — server-side AI keys only, no user PII; auth guard not needed
  "/api/market-intelligence(.*)",
  // Deal room join — must be accessible before sign-in (token validates identity)
  "/deal-rooms/join(.*)",
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
