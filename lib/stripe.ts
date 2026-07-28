// lib/stripe.ts
import Stripe from "stripe";

// Lazy singleton — only instantiated at runtime (never at build time)
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Plan definitions
// Keep in sync with Stripe dashboard products/prices
// ---------------------------------------------------------------------------
export const PLANS = {
  free: {
    name: "Free",
    priceMonthly: 0,
    priceAnnual: 0,
    priceIdMonthly: null,
    priceIdAnnual: null,
    borrowerSlots: 0,
    chatMessages: 20,       // per month
    scenarioPosts: Infinity, // unlimited — scenarios are the marketplace supply side
    pdfExports: 0,
    alerts: false,
    investorTools: false,   // CMA intelligence, rent AVM, cap rate, DSCR analysis
    description: "Get started with HomeRates.ai",
  },
  plus: {
    name: "Plus",
    priceMonthly: 7,
    priceAnnual: 59,
    priceIdMonthly: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID ?? null,
    priceIdAnnual:  process.env.STRIPE_PLUS_ANNUAL_PRICE_ID  ?? null,
    borrowerSlots: 0,
    chatMessages: Infinity,
    scenarioPosts: Infinity,
    pdfExports: Infinity,
    alerts: true,
    investorTools: false,
    description: "Unlimited questions, PDF exports, alerts",
  },
  pro: {
    name: "Pro",
    priceMonthly: 19,
    priceAnnual: 159,
    priceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? null,
    priceIdAnnual:  process.env.STRIPE_PRO_ANNUAL_PRICE_ID  ?? null,
    borrowerSlots: 10,
    chatMessages: Infinity,
    scenarioPosts: Infinity,
    pdfExports: Infinity,
    alerts: true,
    investorTools: true,    // full CMA + rent AVM + Investment Intelligence Panel
    description: "Everything in Plus — investor tools, borrower management, and LO dashboard",
  },
} as const;

export type PlanKey = keyof typeof PLANS;

// ---------------------------------------------------------------------------
// Pricing Integrity Fix (Phase 1), Part C — dated Pro price switch
// -----------------------------------------------------------------------
// Pro's $19/mo has been marketed as "introductory" since 756c1698
// (2026-05-17) but nothing ever backed that with a real second price or a
// switch mechanism. STRIPE_PRO_MONTHLY_PRICE_ID_V2 / _ANNUAL_PRICE_ID_V2
// are new, separate Stripe Price objects at $49/mo and $411/yr (same
// ~30% annual discount as the current $19/$159 pair) -- set these in
// Vercel once created in Stripe. Until they're set, resolveProPriceId
// falls back to the existing $19/$159 prices unchanged (no behavior
// change if this ships before the new prices exist).
//
// PRO_PRICE_SWITCH_DATE is a plain ISO date, config-driven rather than
// hardcoded so it can be corrected without a code change if the real
// production deploy date differs from this default. Default below is
// 2026-10-26 (90 days from 2026-07-28, the day this fix was built) --
// confirm or override via the env var once the actual prod deploy date
// for this change is known.
const PRO_PRICE_SWITCH_DATE = process.env.PRO_PRICE_SWITCH_DATE ?? "2026-10-26";

function isPastProPriceSwitch(): boolean {
  return new Date() >= new Date(`${PRO_PRICE_SWITCH_DATE}T00:00:00Z`);
}

/**
 * New checkouts only: resolves a requested Pro price ID to whichever Pro
 * price should actually be charged today. Existing subscribers are never
 * touched by this -- it only affects what a brand-new Checkout Session
 * references, never an existing subscription's price.
 */
export function resolveCheckoutPriceId(requestedPriceId: string): string {
  const v2Monthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID_V2;
  const v2Annual  = process.env.STRIPE_PRO_ANNUAL_PRICE_ID_V2;
  if (!isPastProPriceSwitch()) return requestedPriceId;

  if (requestedPriceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID && v2Monthly) return v2Monthly;
  if (requestedPriceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID  && v2Annual)  return v2Annual;
  return requestedPriceId;
}

/** True for every price ID this app has ever sold as Plus/Pro (including the dated Pro V2 prices). */
export function isKnownPriceId(priceId: string): boolean {
  if (!priceId) return false;
  return [
    process.env.STRIPE_PLUS_MONTHLY_PRICE_ID,
    process.env.STRIPE_PLUS_ANNUAL_PRICE_ID,
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID_V2,
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID_V2,
  ].filter(Boolean).includes(priceId);
}

/** Resolve a Stripe price ID back to a plan key */
export function getPlanFromPriceId(priceId: string): PlanKey {
  if (
    priceId === process.env.STRIPE_PLUS_MONTHLY_PRICE_ID ||
    priceId === process.env.STRIPE_PLUS_ANNUAL_PRICE_ID
  ) return "plus";
  if (
    priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID ||
    priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID ||
    priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID_V2 ||
    priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID_V2
  ) return "pro";
  return "free";
}

/** Borrower slots for a given plan */
export function getBorrowerSlots(plan: PlanKey): number {
  return PLANS[plan].borrowerSlots;
}

/** Monthly chat message limit (null = unlimited) */
export function getChatLimit(plan: PlanKey): number | null {
  const limit = PLANS[plan].chatMessages;
  return limit === Infinity ? null : limit;
}
