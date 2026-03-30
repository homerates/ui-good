// lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

// ---------------------------------------------------------------------------
// Plan definitions
// Keep in sync with Stripe dashboard products/prices
// ---------------------------------------------------------------------------
export const PLANS = {
  free: {
    name: "Free",
    priceMonthly: 0,
    priceId: null,
    borrowerSlots: 0,
    chatMessages: 20,         // per month
    pdfExports: 0,
    alerts: false,
    description: "Get started with HomeRates.ai",
  },
  pro: {
    name: "Pro",
    priceMonthly: 29,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    borrowerSlots: 10,
    chatMessages: Infinity,
    pdfExports: Infinity,
    alerts: true,
    description: "For loan officers managing borrowers",
  },
  team: {
    name: "Team",
    priceMonthly: 79,
    priceId: process.env.STRIPE_TEAM_PRICE_ID ?? null,
    borrowerSlots: 50,
    chatMessages: Infinity,
    pdfExports: Infinity,
    alerts: true,
    description: "For teams and high-volume originators",
  },
} as const;

export type PlanKey = keyof typeof PLANS;

/** Resolve a Stripe price ID back to a plan key */
export function getPlanFromPriceId(priceId: string): PlanKey {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return "team";
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
