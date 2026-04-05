# HomeRates.ai — Pricing Plans Reference

**Last updated:** 2026-04-05  
**Source of truth:** `lib/stripe.ts` → `PLANS` object  
**Plan stored in:** Supabase `users.plan` (updated by Stripe webhook)

---

## Plan Summary

| Feature | Free | Plus ($7/mo) | Pro ($19/mo) |
|---------|------|-------------|-------------|
| Chat messages | 20/month | Unlimited | Unlimited |
| Scenario posts | 2/month | Unlimited | Unlimited |
| PDF exports | ❌ | Unlimited | Unlimited |
| Rate alerts | ❌ | ✅ | ✅ |
| Borrower slots (LO tool) | 0 | 0 | 10 |
| Annual pricing | — | $59/yr | $159/yr |

---

## Who Each Plan Is For

**Free** — Any visitor. Covers basic exploration: 20 chat messages and 2 scenario posts per calendar month. No payment required, no time limit.

**Plus ($7/mo or $59/yr)** — Borrowers who are actively researching or in the mortgage process. Removes all usage caps on chat, scenario posts, and PDF exports. Adds rate alerts. This is the correct upgrade path for borrowers hitting limits.

**Pro ($19/mo or $159/yr)** — Loan officers and agents. Everything in Plus, plus 10 borrower slots for managing client pipelines via `/lo/dashboard` and `/lo/borrowers`. **Do not present Pro as an upgrade option to borrowers** — it is an LO product.

---

## How Limits Are Enforced

### Chat messages (`chatMessages`)
- Tracked in Supabase `usage_monthly` table (column: `chat_messages`)
- Incremented atomically via `incrementUsage(userId, 'chat_messages')` after each AI response
- Checked in `canChat(userId)` before every message — returns `{ allowed: false }` when at limit
- Resets on the 1st of each calendar month (key: `YYYY-MM`)

### Scenario posts (`scenarioPosts`)
- **Not** stored in `usage_monthly` — counted directly from `scenario_briefs` table
- Count query: `scenario_briefs WHERE borrower_id = userId AND created_at >= first of current month`
- All statuses count (active, matched, closed) — closing a scenario does **not** reset the counter
- Checked in `canPostScenario(userId)` before every POST to `/api/scenarios`
- Gate is enforced both server-side (API 403 with `{ upgrade: true }`) and client-side (quota check on page load at `/connect/post`)
- Resets on the 1st of each calendar month

### PDF exports (`pdfExports`)
- Tracked in `usage_monthly` (column: `pdf_exports`)
- Free plan limit: 0 (blocked entirely)
- Plus/Pro: unlimited

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
- `limit: null` means unlimited (Plus/Pro)
- Called on page load at `/connect/post` to show usage badge and gate before the form

**`GET /api/user/plan`** (auth required)  
Returns full plan details including chat usage:
```json
{
  "plan": "free",
  "billingPeriodEnd": null,
  "chatMessages": 14,
  "chatLimit": 20,
  "pdfExports": 0,
  "borrowerSlots": 0,
  "alertsEnabled": false
}
```

---

## Stripe Integration

- Price IDs set via environment variables:
  - `STRIPE_PLUS_MONTHLY_PRICE_ID`
  - `STRIPE_PLUS_ANNUAL_PRICE_ID`
  - `STRIPE_PRO_MONTHLY_PRICE_ID`
  - `STRIPE_PRO_ANNUAL_PRICE_ID`
- On successful payment: Stripe webhook → `/api/webhooks/stripe` → updates `users.plan` and `subscriptions` table
- Plan resolution order: `users.plan` (primary) → `subscriptions.plan` (fallback for webhook delays)
- Cancellation: webhook sets `users.plan` back to `free`

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

1. **Never show Pro as an upgrade option to borrowers.** Plus is the correct tier. Pro is for LOs/agents.
2. **Closing a scenario does not reset the monthly counter.** The counter is a raw count of briefs created this month. This is intentional — it prevents cycling through posts to game the limit.
3. **Always gate server-side first.** The client-side quota check is a UX improvement only. The API route enforces the real limit.
4. **`borrowerSlots` is an LO feature**, not a borrower feature. Free and Plus both have `borrowerSlots: 0` — this does not affect borrowers' ability to post scenarios.
5. **Monthly reset is calendar-month based** (`YYYY-MM`), not rolling 30 days.
