# Security Audit — HomeRates.Ai

**Date:** 2026-06-10
**Scope:** Clerk middleware, Supabase RLS + service-role usage, API input validation / rate limiting / error leakage, secrets, Stripe, dependencies.
**Status:** Remediated 2026-06-10 — see "Remediation status" below. Build + typecheck pass.

## Remediation status (2026-06-10)

| ID | Finding | Status |
|----|---------|--------|
| C-1 | Clerk middleware route-protection bypass | ✅ Fixed — `@clerk/nextjs` → 6.39.5 (≥6.39.2 patched, stayed on v6 to avoid v7 breaking changes) |
| H-1 | Report token used `Math.random()` | ✅ Fixed — `crypto.randomInt`, token length 10→22 |
| H-2 | Clerk org/billing auth bypass | ✅ Fixed — `@clerk/clerk-js` → 5.125.13 (past vulnerable `<=5.125.9`) |
| H-3 | Open redirect via `/api/shorten` → `/s/[slug]` | ✅ Fixed — `target_url` host allowlist + relative-path only; slug now `crypto.randomInt` |
| M-2 | Anon-key fallback in `projects/[id]` | ✅ Fixed — service role only, fails loud if missing |
| M-3 | Error-detail leakage to client | ✅ Fixed — generic messages, detail logged server-side |
| M-4 | Cron auth fail-open in `alerts/check` | ✅ Fixed — fail-closed; also accepts Vercel `Authorization: Bearer` |
| L-1 | Stripe `priceId` not allowlisted | ✅ Fixed — `isKnownPriceId()` guard in checkout |
| M-1 | RLS inert (Clerk ≠ Supabase Auth) | ⏳ Open — architectural; documented below, needs decision |
| L-3 | Moderate transitive npm advisories | ⏳ Partial — Clerk chain cleared; residual `@solana/wallet-adapter` (bundled by clerk-js, unused by app) + pre-existing `next`/`lodash`/`eslint` chains remain. Run `npm audit` to review |
| L-2, L-4 | `Math.random()` slug / bootstrap admin id | ✅ / ℹ️ — slug fixed; bootstrap id is by-design, no action |

**Original findings below (for reference).**

---

## Summary

| Severity | Count | Headline |
|----------|-------|----------|
| Critical | 1 | `@clerk/nextjs@6.37.3` middleware route-protection bypass (CVSS 9.1) — the app's entire auth model is middleware-based |
| High | 3 | Public report tokens generated with `Math.random()` exposing borrower PII; Clerk org/billing auth bypass; open redirect via `/api/shorten` → `/s/[slug]` |
| Medium | 4 | RLS is inert (Clerk ≠ Supabase Auth → `auth.uid()` always null); anon-key fallback footgun; error-detail leakage; cron + anon-gate fail-open |
| Low | 4 | Stripe priceId not allowlisted; `Math.random()` slugs; moderate npm advisories; hardcoded bootstrap admin id |

**Architectural note:** Every data path reads/writes Supabase through the **service-role key on the server**. No client-side component queries Supabase with the anon key. That is good — but it also means RLS provides *no* row-level defense (see M-1). Data safety rests entirely on two things: (1) the service-role key never leaking, and (2) each API route correctly filtering by the authenticated `userId`. The route-level ownership checks reviewed (`buyer-sessions/[id]`, `projects/[id]`, `messages/[threadId]`) are correctly scoped. That makes the Clerk middleware CVE (C-1) the single most important issue: it is the layer the whole model leans on.

---

## CRITICAL

### C-1 — `@clerk/nextjs@6.37.3`: middleware-based route-protection bypass
- **Where:** [package.json](package.json) (`@clerk/nextjs: ^6.37.3`, installed 6.37.3); auth enforced in [middleware.ts:144-145](middleware.ts#L144-L145) via `auth.protect()`.
- **Advisory:** GHSA-vqx2-fgx2-5wq9, CWE-436/863, **CVSS 9.1**. Affects `>=6.0.0 <6.39.2`.
- **Attack:** A crafted request can bypass `clerkMiddleware` route protection, reaching pages/routes that rely on the middleware to force authentication. Because this app gates *all* non-public routes through `auth.protect()` in middleware (rather than per-route `auth()` checks on every page), a middleware bypass exposes any protected **page**. Most sensitive *API* routes re-check `auth()`/`requireAdmin()` server-side (good), but protected pages and any route relying solely on the matcher are exposed.
- **Fix:** Upgrade `@clerk/nextjs` to **≥ 6.39.2** (`npm install @clerk/nextjs@latest`), re-run `npm audit`, redeploy to staging, verify sign-in + `auth.protect()` still work. This single upgrade also clears C-adjacent High items H-2 below (same dependency tree).

---

## HIGH

### H-1 — Public borrower-report tokens use `Math.random()`; endpoint leaks PII unauthenticated
- **Where:** token generated at [app/api/report/generate/route.ts:18-23](app/api/report/generate/route.ts#L18-L23) (`Math.floor(Math.random()*chars.length)`); consumed unauthenticated at [app/api/report/[token]/route.ts:17-31](app/api/report/[token]/route.ts#L17-L31) (comment: "public, no auth") and the `/report/[token]` page.
- **Data exposed:** borrower `name`, `email`, `property_address`, `actual_balance`, `actual_rate`, `actual_purchase_price`, `actual_purchase_date`, plus the professional's contact card ([route.ts:88-110](app/api/report/[token]/route.ts#L88-L110)).
- **Attack:** `Math.random()` is a non-cryptographic PRNG — its output is predictable and not safe for security tokens. An attacker who can observe a few issued tokens (or who brute-forces the 10-char `a-z2-9` space programmatically) can predict/enumerate other valid report tokens and harvest borrower PII at scale. This is a privacy-regulation exposure (NPI/financial data), not just a nuisance.
- **Fix:** Replace with `crypto.randomUUID()` or `crypto.randomBytes(16).toString('base64url')`. Consider also adding an `expires_at` and a server-side rate limit on the public GET.

### H-2 — Clerk org/billing/reverification authorization bypass
- **Where:** same dependency as C-1 — `@clerk/backend`, `@clerk/clerk-js`, `@clerk/clerk-react`, `@clerk/nextjs`, `@clerk/shared`.
- **Advisory:** GHSA-w24r-5266-9c3c, CWE-754/863, **CVSS 8.1**. Affects `@clerk/nextjs >=6.0.0 <=6.39.2`.
- **Attack:** Authorization checks that combine organization, billing, or reverification conditions can be bypassed. Relevant if any gating (e.g. Pro/Team plan or brokerage-org checks) is done with Clerk's org/billing helpers.
- **Fix:** Cleared by the same upgrade to `@clerk/nextjs ≥ 6.39.2`.

### H-3 — Open redirect via public `/api/shorten` → `/s/[slug]`
- **Where:** [app/api/shorten/route.ts:30-126](app/api/shorten/route.ts#L30-L126) accepts `url` from **any caller** (`userId || 'anon'`, no auth required — `/api/shorten` is in the public matcher [middleware.ts:44](middleware.ts#L44)) and stores it as `short_links.target_url` with no host validation. [app/s/[slug]/page.tsx:183-206](app/s/[slug]/page.tsx#L183-L206) then redirects the visitor to that stored `target_url` via `window.location.replace(...)`.
- **Attack:** Anyone can mint a `https://chat.homerates.ai/s/<slug>` link that silently redirects to an attacker-controlled phishing site — a credible phishing primitive because the link wears the trusted brand domain. (The inline-script injection itself is mitigated by `JSON.stringify`, so this is an open-redirect, not XSS.)
- **Fix:** Restrict `target_url` to an allowlist of known hosts (or relative paths only), and/or require an authenticated session to create short links. Reject absolute URLs whose host is not `homerates.ai`/`chat.homerates.ai`.

---

## MEDIUM

### M-1 — RLS provides no row-level enforcement (Clerk ≠ Supabase Auth)
- **Where:** every policy in [supabase/staging_seed.sql](supabase/staging_seed.sql) of the form `USING (clerk_user_id = auth.uid()::text)` (e.g. `chat_threads`, `user_answers`, `projects`, `memory_threads`).
- **Issue:** The app authenticates with **Clerk**, not Supabase Auth, so `auth.uid()` is **always NULL** for any anon-key request. These policies therefore never match — they collapse to deny-all for the anon key, and all real traffic uses the service-role key which **bypasses RLS entirely**. Net effect: RLS is a deny-by-default backstop but contributes **zero** row-level defense-in-depth. The security model is entirely (a) service-role key secrecy + (b) per-route `userId` filters.
- **Why it matters:** If a single API route forgets its `.eq('user_id', userId)` filter, there is no second line of defense — RLS will not catch it. A `lib/supabaseWithClerk.ts` exists ([lib/supabaseWithClerk.ts](lib/supabaseWithClerk.ts)) but reads go through the service-role client.
- **Fix:** Either (a) document explicitly that RLS is intentionally inert and ownership is enforced in the API layer (and add a test that every user-scoped query filters by `userId`), or (b) wire Clerk → Supabase third-party JWT so `auth.uid()` resolves and the existing policies become live.

### M-2 — Service-role client silently falls back to the public anon key
- **Where:** [app/api/projects/[id]/route.ts:11-13](app/api/projects/[id]/route.ts#L11-L13) (`SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`). Contrast with the explicit "service role only (do NOT fallback to anon)" guard in [app/api/answers/route.ts:122-124](app/api/answers/route.ts#L122-L124).
- **Issue:** If the service-role env var is ever missing, this route runs under the browser-exposed anon key. Combined with M-1 (anon key = `auth.uid()` null = deny-all), today it fails closed rather than leaking — but it is an inconsistent footgun that would mask a misconfiguration and behaves differently from the rest of the codebase.
- **Fix:** Remove the anon fallback; fail loudly if the service key is absent (match the `answers` route pattern).

### M-3 — Error responses leak internal details to the client
- **Where:** [app/api/projects/[id]/route.ts:93-115](app/api/projects/[id]/route.ts#L93-L115) returns raw `error` objects and exception `message`/`stage`/`reason` to the caller; many routes return Supabase `error.message` directly (e.g. [buyer-sessions/[id]/route.ts:60](app/api/buyer-sessions/[id]/route.ts#L60), [121](app/api/buyer-sessions/[id]/route.ts#L121)).
- **Attack:** Information disclosure — leaks table/column names, constraint details, and internal stack context that aid an attacker mapping the schema.
- **Fix:** Return generic messages (`{ error: "Request failed" }`) to clients; log the detailed error server-side only.

### M-4 — Cron and anon-gate auth fail open
- **Where:** [app/api/alerts/check/route.ts:120](app/api/alerts/check/route.ts#L120) — `if (CRON_SECRET && secret !== CRON_SECRET)` skips the check entirely when `CRON_SECRET` is unset. [lib/anonGate.ts:15,40-42](lib/anonGate.ts#L15-L42) returns `allowed: true` on any DB error and keys on a spoofable IP.
- **Attack:** If `CRON_SECRET` is not configured in an environment, `/api/alerts/check` (a public-matcher route) is callable by anyone, triggering rate-alert work. The anon gate (3/day for chat + investor) is bypassable via `x-forwarded-for` spoofing and degrades to unlimited on DB hiccups.
- **Fix:** Make cron routes fail **closed** — reject if `CRON_SECRET` is unset. Treat the anon gate as best-effort only; do not rely on it for cost control of expensive AI calls.

---

## LOW

### L-1 — Stripe `priceId` accepted from client without allowlist
- **Where:** [app/api/stripe/checkout/route.ts:19-24,63-75](app/api/stripe/checkout/route.ts#L19-L75). The client supplies `priceId`; Stripe enforces the real price so amounts cannot be tampered, but any valid price object in the account could be selected.
- **Fix:** Validate `priceId` against the known set (`NEXT_PUBLIC_STRIPE_*_PRICE_ID`) before creating the session. **Webhook signature verification is correctly implemented** ([app/api/webhooks/stripe/route.ts:130-141](app/api/webhooks/stripe/route.ts#L130-L141), `constructEvent` with `STRIPE_WEBHOOK_SECRET`) — no action needed there.

### L-2 — `Math.random()` slug generation in `/api/shorten`
- **Where:** [app/api/shorten/route.ts:21-28](app/api/shorten/route.ts#L21-L28). Low impact (collision-retry loop exists), but predictable slugs are undesirable; prefer `crypto`.

### L-3 — Moderate npm advisories (transitive)
- `lodash-es` via the `@chevrotain/*` chain (moderate). `fixAvailable: true`. Run `npm audit fix`. No high/critical outside the Clerk chain (C-1/H-2).

### L-4 — Hardcoded bootstrap admin Clerk ID
- **Where:** [lib/adminAuth.ts:15-17](lib/adminAuth.ts#L15-L17) (`BOOTSTRAP_ADMIN_IDS`). A Clerk user id is not a secret, and the fallback is a deliberate lockout-recovery design, so this is acceptable — noted for awareness. Admin API routes are otherwise consistently gated by `requireAdmin()` / `isAdminId()` (verified across `app/api/admin/*`).

---

## What was verified clean

- **Admin routes:** all `app/api/admin/*` enforce `requireAdmin()` or `isAdminId()` server-side.
- **IDOR:** `buyer-sessions/[id]`, `projects/[id]`, and `messages/[threadId]` all filter by the authenticated `userId` / thread-party membership.
- **No client-side anon-key data access:** the only `"use client"` file touching identity data ([app/identity/page.tsx](app/identity/page.tsx)) goes through the server `/api/identity` route, not a direct Supabase query.
- **No hardcoded secrets** found in source (`sk_live`/`sk_test`/`whsec_`/`xai-`/`tvly-`/JWT patterns) outside `node_modules`. `NEXT_PUBLIC_` usage is limited to non-secret values (Supabase URL, public anon key, Stripe **price IDs**, Google Maps key, app base URL, git SHA).
- **Stripe webhook** signature verification present and correct.

---

## Recommended remediation order

1. **C-1 / H-2** — `npm install @clerk/nextjs@latest` (≥6.39.2), test on staging, deploy. *(One step clears the Critical and one High.)*
2. **H-1** — swap report-token generation to `crypto`; add expiry + rate limit on the public GET.
3. **H-3** — allowlist `target_url` host (or require auth) in `/api/shorten`.
4. **M-2 / M-3 / M-4** — remove anon-key fallback, generic client errors, fail-closed cron.
5. **M-1** — decide: document RLS-is-inert + add a query-filter test, or wire Clerk→Supabase JWT.
6. **L-1 / L-3** — allowlist Stripe price IDs; `npm audit fix` for the moderate chain.
