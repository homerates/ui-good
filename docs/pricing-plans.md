# HomeRates.ai — Pricing Plans Reference

**Last updated:** 2026-07-28
**Source of truth:** `lib/stripe.ts` → `PLANS` object (gating) + `lib/credits.ts` (free-tier metering)
**Plan stored in:** Supabase `users.plan` (updated by Stripe webhook)

> Superseded 2026-07-28. The previous version of this doc (last updated 2026-04-05) predated
> the Pro repositioning and Enterprise tier and described a `chatMessages`/`canChat` monthly-cap
> mechanism that turned out to be dead code — see "How Limits Are Enforced" below for what
> actually runs.

---

## Plan Summary

| Feature | Free | Plus ($7/mo, $59/yr) | Pro ($19/mo, $159/yr) | Enterprise |
|---------|------|-----------------------|------------------------|------------|
| AI questions | Credit-metered (~6-7 standard questions, then grace) | Unlimited | Unlimited | Unlimited |
| Scenario posts | 2/month | Unlimited | Unlimited | Unlimited |
| PDF exports | ❌ | Unlimited | Unlimited | Unlimited |
| Rate alerts | ❌ | ✅ | ✅ | ✅ |
| Investor tools (CMA report, watchlist, portfolio) | ❌ | ❌ | ✅ | ✅ |
| Borrower slots (LO tool) | 0 | 0 | 10 | Custom |
| Checkout | Self-serve | Self-serve | Self-serve | `mailto:` only, no Stripe checkout |

---

## Who Each Plan Is For

**Free** — Any visitor. No payment required, no time limit. AI questions are metered by credits,
not a flat "N/month" cap — see below.

**Plus ($7/mo or $59/yr)** — Borrowers who are actively researching or in the mortgage process.
Removes all usage caps on chat, scenario posts, and PDF exports. Adds rate alerts.
`investorTools: false` — does not unlock the CMA/investor surfaces.

**Pro ($19/mo or $159/yr)** — Repositioned (commit `7a53c3c7`) as investor and loan-officer
tooling, not a "more borrower features" tier. `investorTools: true` unlocks the CMA report,
investor watchlist/portfolio, and mortgage-lender-of-record fields. Also includes 10 borrower
slots for managing client pipelines via `/lo/dashboard` and `/lo/borrowers`. Pricing page
currently labels this "introductory pricing" — see the pricing-integrity fix commit for the
current status of any scheduled price change.

**Enterprise** — Marketing-only band added `4f0eefe3`; no `enterprise` key exists in
`lib/stripe.ts`'s `PLANS`, no Stripe product/price, no self-serve checkout. CTA is a `mailto:`
link. Any Enterprise account is provisioned manually, not through the app's Stripe flow.

---

## How Limits Are Enforced

### AI questions — real mechanism: credits (`lib/credits.ts`)
- New free users are awarded starting credits via `awardCredits(userId, 100, "plan_free_monthly", ...)`
  (`app/api/onboarding/setup/route.ts`). **Note:** despite the `plan_free_monthly` transaction-type
  name implying a recurring monthly grant, live data (2026-07-28) shows only 3 of 22 free users
  have ever received more than one such grant — whether this is supposed to recur monthly and
  isn't, or was only ever meant to fire once at signup, has not been confirmed and needs its own
  investigation. Don't assume it recurs.
- Paid users (`plan !== 'free'`) always pass the credit gate — unlimited in practice.
- Free users spend credits per question, classified by regex on the question text:
  deep-analysis → 25 credits, short calc-style query → 5 credits, everything else → 15 credits.
  At 15 credits/question this is **~6-7 questions** from a 100-credit balance, not 20.
- Once credits hit 0, `GRACE_MAX = 3` additional "grace" queries are allowed
  (`usage_monthly.grace_queries`, incremented via the `increment_grace` RPC) before a 402 is
  returned. **Note:** live data shows several users with `grace_queries` values of 15, 7, 6, 5,
  4 — all exceeding `GRACE_MAX = 3`. Root cause not investigated as part of this doc update;
  flagging for a separate pass.
- Enforced in `app/api/answers/route.ts` via `checkCreditGate()` / `spendCredits()`.

### Dead code — do not build against this
- `lib/subscription.ts`'s `canChat()` / `incrementUsage()`, checked against
  `PLANS.free.chatMessages = 20` (`lib/stripe.ts`), is **never called** from anywhere outside its
  own definitions. `usage_monthly.chat_messages` is 0 across every real row. `GET /api/user/plan`
  still reports a static `chatLimit: 20` regardless of actual usage — that field does not reflect
  enforcement and should not be trusted or extended.

### Scenario posts (`scenarioPosts`)
- **Not** stored in `usage_monthly` — counted directly from `scenario_briefs` table.
- Count query: `scenario_briefs WHERE borrower_id = userId AND created_at >= first of current month`.
- All statuses count (active, matched, closed) — closing a scenario does **not** reset the counter.
- Checked in `canPostScenario(userId)` before every POST to `/api/scenarios`.
- Gate enforced both server-side (API 403 with `{ upgrade: true }`) and client-side (quota check
  on page load at `/connect/post`).
- Resets on the 1st of each calendar month.

### PDF exports (`pdfExports`)
- Tracked in `usage_monthly` (column: `pdf_exports`).
- Free plan limit: 0 (blocked entirely). Plus/Pro: unlimited.

---

## Referral Program (functional, not aspirational)

- `GET /api/referral/code` generates an 8-char code (`users.referral_code`).
- `/r/[slug]` landing page sets an `hr_ref` httpOnly cookie (7-day maxAge).
- On signup, `app/api/onboarding/setup/route.ts` reads the cookie, sets `users.referred_by` once,
  and awards the **referrer** 500 credits.
- Redemption is paid-subscriber-only: 50 credits per scenario slot, capped at 3/month
  (`app/api/credits/redeem/route.ts`). UI lives at `/profile`.
- Distinct from non-reward invite systems (`/api/invite/claim`, `/api/lo/gift-credits`,
  `/api/pro-directory/invite`) — those don't pay out credits.

---

## Quota API

**`GET /api/scenarios/quota`** (auth required)
Returns the current user's scenario post status for the month:
```json
{
  "allowed": true,
  "used": 1,
  "limit": 2,
  "plan": "free"
}
```
- `limit: null` means unlimited (Plus/Pro).
- Called on page load at `/connect/post` to show usage badge and gate before the form.

**`GET /api/user/plan`** (auth required)
Returns plan details. **`chatMessages` / `chatLimit` fields reflect the dead `canChat` mechanism,
not real credit usage** — do not use these to represent free-tier AI usage in any new UI. Query
`users.credits_balance` directly for the real remaining balance.

---

## Stripe Integration

- Price IDs set via environment variables (server-side, `lib/stripe.ts`, plus duplicated
  `NEXT_PUBLIC_` client-side copies in `app/pricing/page.tsx` — nothing checks these two
  independently-set values actually match):
  - `STRIPE_PLUS_MONTHLY_PRICE_ID` / `STRIPE_PLUS_ANNUAL_PRICE_ID`
  - `STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_PRO_ANNUAL_PRICE_ID`
- On successful payment: Stripe webhook → `/api/webhooks/stripe` → updates `users.plan` and
  `subscriptions` table via `getPlanFromPriceId()`.
- Plan resolution order: `users.plan` (primary) → `subscriptions.plan` (fallback for webhook delays).
- Cancellation: webhook sets `users.plan` back to `free`.
- Enterprise has no Stripe object at all — see "Who Each Plan Is For" above.

---

## Usage Badge Behaviour (UI)

Shown to signed-in users with finite limits (Free plan only — Plus/Pro show nothing):

| State | Color | Text |
|-------|-------|------|
| Under limit, more than 1 remaining | Green | `0/2 posts used` |
| 1 remaining (last post) | Orange | `1/2 posts used` |
| At limit | Red | `2/2 posts used — limit reached` |

Appears in:
- `/connect` landing page nav
- `/connect/post` page nav (client-side, loaded via `/api/scenarios/quota`)

---

## Key Rules for Developers

1. **Pro is investor/LO tooling, not a "more borrower features" tier.** `investorTools: true` is
   what actually gates Pro-only surfaces (CMA, watchlist, portfolio) — check that flag, not the
   plan name, when adding a new investor-facing feature.
2. **Free-tier AI usage is credit-based, not a flat monthly message count.** Don't reintroduce
   `chatMessages`/`canChat`-style logic — it's dead and disagrees with what's actually enforced.
3. **Closing a scenario does not reset the monthly counter.** The counter is a raw count of briefs
   created this month. This is intentional — it prevents cycling through posts to game the limit.
4. **Always gate server-side first.** The client-side quota check is a UX improvement only. The
   API route enforces the real limit.
5. **`borrowerSlots` is an LO feature**, not a borrower feature. Free and Plus both have
   `borrowerSlots: 0` — this does not affect borrowers' ability to post scenarios.
6. **Monthly reset (scenario posts, PDF exports) is calendar-month based** (`YYYY-MM`), not a
   rolling 30 days. Credits are a running balance, not a monthly reset, pending the
   `plan_free_monthly` recurrence question flagged above.
