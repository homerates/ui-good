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

/** True only for the four price IDs this app actually sells. */
export function isKnownPriceId(priceId: string): boolean {
  if (!priceId) return false;
  return [
    process.env.STRIPE_PLUS_MONTHLY_PRICE_ID,
    process.env.STRIPE_PLUS_ANNUAL_PRICE_ID,
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
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
    priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID
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
