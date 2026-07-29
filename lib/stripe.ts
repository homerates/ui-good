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
// PRO_PRICE_SWITCH_DATE: deliberately NO default date. An earlier version
// of this defaulted to a hardcoded date, which meant the switch would fire
// automatically on a calendar timer with no human decision point -- and
// separately, a temporary test-mode override of this same env var leaked
// into Production and Preview (unscoped), causing two rounds of real
// pricing bugs (Pro showing $49 with no warning). Both failure modes share
// one root cause: a silently-behaving date threshold nobody had to
// consciously act on. Fixed by requiring an explicit, deliberate value --
// unset means the intro price stays live indefinitely, which is the
// intended behavior until a real decision is made based on subscriber
// growth/business strategy, not a fixed default. Set this env var only when
// that decision has actually been made.
const PRO_PRICE_SWITCH_DATE = process.env.PRO_PRICE_SWITCH_DATE ?? null;

function isPastProPriceSwitch(): boolean {
  if (!PRO_PRICE_SWITCH_DATE) return false;
  return new Date() >= new Date(`${PRO_PRICE_SWITCH_DATE}T00:00:00Z`);
}

/** True only once both V2 price IDs exist AND the switch date has passed — the single
 *  condition both checkout resolution and displayed pricing must agree on. */
function isProPriceSwitched(): boolean {
  return isPastProPriceSwitch() &&
    !!process.env.STRIPE_PRO_MONTHLY_PRICE_ID_V2 &&
    !!process.env.STRIPE_PRO_ANNUAL_PRICE_ID_V2;
}

/**
 * New checkouts only: resolves a requested Pro price ID to whichever Pro
 * price should actually be charged today. Existing subscribers are never
 * touched by this -- it only affects what a brand-new Checkout Session
 * references, never an existing subscription's price.
 */
export function resolveCheckoutPriceId(requestedPriceId: string): string {
  if (!isProPriceSwitched()) return requestedPriceId;

  if (requestedPriceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID) return process.env.STRIPE_PRO_MONTHLY_PRICE_ID_V2!;
  if (requestedPriceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID)  return process.env.STRIPE_PRO_ANNUAL_PRICE_ID_V2!;
  return requestedPriceId;
}

const PRO_V2_MONTHLY_PRICE = 49;
const PRO_V2_ANNUAL_PRICE  = 411;

/**
 * Single source of truth for what the Pro price actually is today — used by
 * GET /api/pricing/pro-price so the *displayed* price on the pricing page
 * can never drift from what checkout actually charges. Mirrors the same
 * isProPriceSwitched() gate resolveCheckoutPriceId uses.
 */
export function getCurrentProPricing(): {
  priceMonthly: number;
  priceAnnual: number;
  annualMonthly: number;
  isIntro: boolean;
  // The post-switch price, always populated (even when isIntro is already
  // false, in which case it equals priceMonthly/priceAnnual) -- lets the
  // pricing page render a "was $49" strikethrough next to the active intro
  // price without hardcoding a second copy of PRO_V2_MONTHLY_PRICE.
  introTargetMonthly: number;
  introTargetAnnual: number;
} {
  if (isProPriceSwitched()) {
    return {
      priceMonthly: PRO_V2_MONTHLY_PRICE,
      priceAnnual: PRO_V2_ANNUAL_PRICE,
      annualMonthly: Math.round((PRO_V2_ANNUAL_PRICE / 12) * 100) / 100,
      isIntro: false,
      introTargetMonthly: PRO_V2_MONTHLY_PRICE,
      introTargetAnnual: PRO_V2_ANNUAL_PRICE,
    };
  }
  return {
    priceMonthly: PLANS.pro.priceMonthly,
    priceAnnual: PLANS.pro.priceAnnual,
    annualMonthly: Math.round((PLANS.pro.priceAnnual / 12) * 100) / 100,
    isIntro: true,
    introTargetMonthly: PRO_V2_MONTHLY_PRICE,
    introTargetAnnual: PRO_V2_ANNUAL_PRICE,
  };
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
