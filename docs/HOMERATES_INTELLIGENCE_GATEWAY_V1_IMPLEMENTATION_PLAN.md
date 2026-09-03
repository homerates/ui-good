# HomeRates Intelligence Gateway V1 — Implementation Plan

**Status: LOCKED (2026-09-02, Rayaan).** This is the implementation-planning baseline for Gateway V1,
alongside the now-also-locked `docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_ARCHITECTURE.md`. No file listed
below has been created — locking this plan fixes its ordering and scope for a future implementation
session, it does not authorize starting one. This document turns the architecture doc's reasoning into an
exact, ordered task list a future implementation session can follow directly, without re-deriving the
decisions already made there. Read the architecture doc first for *why* — this doc is deliberately lean on
justification and heavy on *what, where, in what order*.

**Do not start implementation from this document without explicit authorization at that time.** Writing
this plan is not that authorization.

Depends on, and must not contradict: `docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md` (locked,
`d63ffea8`) and `docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_ARCHITECTURE.md`.

---

## Before Phase A: preconditions to re-verify, not assume

Code moves fast in this repository. Before implementing, re-confirm (don't trust this plan's age):
- `lib/propertyIntelligence.ts`'s `getPropertyIntelligenceData()` still has the call graph documented in
  the architecture doc §4 — re-run the same audit (grep for `.insert(`/`.update(`/`.upsert(`/`.delete(`,
  grep for `fetch(` across the full dependency list) rather than trusting this plan's snapshot of it.
- `zod` is still a `package.json` dependency.
- No credential/API-key table has been added to `supabase/migrations/` in the meantime (would change §8's
  "no existing precedent" premise).
- `lib/anonGate.ts` still exists with the same shape (rate-limit precedent).

---

## Phase A — Shared Gateway service + corpus-only guard

**New files only. Nothing existing is modified in this phase.**

1. Create `lib/gateway/` directory.
2. Create `lib/gateway/corpusOnlyIntelligence.ts`:
   - Export `getPropertyIntelligenceCorpusOnly(propertyId: string): Promise<PropertyIntelligenceData | null>`
   - Implementation: import and call `getPropertyIntelligenceData` from `../propertyIntelligence` unchanged.
     No other logic in this function — its entire value is being the *only* function the rest of
     `lib/gateway/` is permitted to call into existing intelligence code.
   - File-level comment stating explicitly: this is the sole Gateway entry point into existing
     intelligence; nothing else in `lib/gateway/` may import from `lib/propertyIntelligence.ts`,
     `lib/pricing/*`, `lib/scoring/*`, `app/api/property/lookup`, `app/api/beta/grok-property`, or any
     Tavily/Redfin client module.
3. Create the import-boundary test (exact framework TBD by what this repo already uses for tests — none
   were found in wide use this session; if none exists, a plain script run in CI that greps
   `lib/gateway/*.ts` (excluding `corpusOnlyIntelligence.ts` itself) for any of the forbidden import paths
   above and fails on a match is sufficient — doesn't require a test framework to be meaningful).
4. Create `lib/gateway/intelligenceGateway.ts` with the entry point signature:
   ```
   export async function getPropertyIntelligence(
     request: { address: string },
     callerContext: { credentialId: string; partnerId: string; scopes: string[] }
   ): Promise<GatewayResult>
   ```
   Phase A implementation: address normalization + lookup against `properties.address_full` (case-
   insensitive, matching the existing established pattern used elsewhere in this corpus — see
   `codebase_invariants` memory on address-matching precision) → call
   `getPropertyIntelligenceCorpusOnly(propertyId)` → return the raw result, **unshaped** (Output Shaping is
   Phase B — Phase A's stop condition only requires proving the safe call path works end-to-end, not that
   its output is externally safe yet).
   Auth/rate-limit/circuit-breaker checks are Phases C/D — Phase A's `callerContext` parameter exists in
   the signature now so later phases don't need to change the function's shape, but Phase A itself does not
   enforce anything against it yet.

**Definition of done for Phase A:** calling `getPropertyIntelligence({address: <known-good-address>},
<any-callerContext>)` returns the same data `getPropertyIntelligenceData()` would for that address's
`properties.id`, and the import-boundary check passes.

---

## Phase B — Output shaping + schema validation

1. Create `lib/gateway/outputSchema.ts`:
   - A zod schema, `ExternalPropertyIntelligenceV1Schema`, mirroring
     `docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md` §7's response contract exactly — every field in
     that JSON shape, with the right zod type (`z.enum([...])` for `availability.status` and `claim_type`,
     `z.number().nullable()` for numeric fields that can be null, etc.).
   - Export the inferred type: `export type ExternalPropertyIntelligenceV1 = z.infer<typeof ExternalPropertyIntelligenceV1Schema>`.
2. Create `lib/gateway/outputShaping.ts`:
   - Export `shapeForExternalContract(raw: PropertyIntelligenceData): ExternalPropertyIntelligenceV1`.
   - Implementation discipline: read every needed field off `raw` by explicit dotted path
     (`raw.valuation.avm.value`, never `...raw`), write every field of the return object by explicit key.
     No destructure-then-omit pattern anywhere in this function.
   - Map internal `eligibility` → external `availability.status` per Contract V1 §12's table exactly
     (`index`→`AVAILABLE`, `noindex`→`PARTIAL`, `unavailable`→`NOT_AVAILABLE`).
   - Compute `freshness.staleness` from `raw.provenance`'s most-recent timestamp against the threshold
     from architecture doc §29 open question #2 (not yet decided — use a placeholder constant clearly
     marked `// TODO: confirm staleness threshold, see architecture doc §29 Q2` rather than silently
     picking a number and treating it as final).
   - Collapse `raw.provenance.propertyEnrichmentSource`'s raw pipeline string into one of the fixed
     `source_category` enum values from Contract V1 §11 (`PUBLIC_LISTING_DATA` / `AI_ASSISTED_ANALYSIS` /
     `MARKET_DATA`) via an explicit mapping table, not a passthrough.
   - Build `decision_intelligence` from `raw.decisionIntelligence.strengths/concerns/missing` only —
     never read `.l2`/`.l3`/`.l4`/`.methodologyVersion`/`.source` in this file at all (not "read but
     discard" — literally never reference them, so a future refactor can't accidentally start returning
     them by loosening a `pick`).
3. Update `lib/gateway/intelligenceGateway.ts` (from Phase A) to call `shapeForExternalContract()` then
   `ExternalPropertyIntelligenceV1Schema.safeParse()` on the result before returning. On parse failure:
   return the Gateway's `INTERNAL_ERROR` shape (Phase C/§16 of the architecture doc defines the full error
   taxonomy; Phase B only needs this one case wired).

**Definition of done for Phase B:** for each of Contract V1 §17's five example scenarios (A-E), running a
real property through the full A+B path produces output that both matches the example shape and passes
`ExternalPropertyIntelligenceV1Schema.safeParse()`. A test that manually constructs a raw object containing
`decisionIntelligence.l2 = {score: 82, summary: '...'}` and confirms the shaped output has no trace of it
anywhere (not renamed, not nested elsewhere — absent).

---

## Phase C — Partner auth + credentials

1. Draft (do not run) migration `supabase/migrations/0XX_gateway_partners_credentials.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS gateway_partners (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name          text NOT NULL,
     contact_email text NOT NULL,
     status        text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','suspended','cancelled')),
     rate_limit_tier text NOT NULL DEFAULT 'pilot',
     quota_tier      text NOT NULL DEFAULT 'pilot',
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_at    timestamptz NOT NULL DEFAULT now()
   );

   CREATE TABLE IF NOT EXISTS gateway_credentials (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     partner_id    uuid NOT NULL REFERENCES gateway_partners(id),
     key_prefix    text NOT NULL UNIQUE,
     key_hash      text NOT NULL,
     scopes        text[] NOT NULL DEFAULT ARRAY['property_intelligence:read'],
     status        text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','revoked','disabled')),
     expires_at    timestamptz,
     created_at    timestamptz NOT NULL DEFAULT now(),
     last_used_at  timestamptz,
     revoked_at    timestamptz
   );

   ALTER TABLE gateway_partners ENABLE ROW LEVEL SECURITY;
   ALTER TABLE gateway_credentials ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "service_role_all" ON gateway_partners USING (true) WITH CHECK (true);
   CREATE POLICY "service_role_all" ON gateway_credentials USING (true) WITH CHECK (true);
   ```
   Real migration number to be assigned at implementation time (next available, not `0XX` literally).
   Matches this repo's established RLS pattern (service-role-only access, confirmed as the convention used
   by `046_grok_property_cache.sql` and `079_aerial_view_cache.sql` earlier this session).
2. Create `lib/gateway/credentials.ts`:
   - `issueCredential(partnerId: string, scopes?: string[]): Promise<{ plaintextKey: string; prefix: string }>`
     — generates a cryptographically random secret, hashes it (Node's built-in `crypto` module, no new
     dependency needed), stores prefix + hash, returns the plaintext exactly once.
   - `verifyCredential(plaintextKey: string): Promise<{ credentialId: string; partnerId: string; scopes: string[] } | null>`
     — extracts the prefix, looks up the row, hashes the supplied key, compares to `key_hash`, checks
     `status === 'active'` and `expires_at` if set, updates `last_used_at`. Returns `null` (not a thrown
     error) on any failure — the Gateway's auth layer (next step) converts `null` into `UNAUTHORIZED`.
   - `revokeCredential(credentialId: string): Promise<void>`.
3. Create `lib/gateway/auth.ts`:
   - `authenticateRequest(apiKeyHeader: string | null): Promise<CallerContext | GatewayError>` — wraps
     `verifyCredential()`, also checks the partner's own `status === 'active'` (a revoked credential should
     already block this, but a *disabled partner* with still-technically-active individual credentials must
     also be blocked here — don't rely on cascading credential revocation to cover partner-level disable).
4. Wire `intelligenceGateway.ts`'s `getPropertyIntelligence()` to call `authenticateRequest()` first and
   return `UNAUTHORIZED`/`FORBIDDEN` per architecture doc §16 before doing anything else.
5. Create the minimum admin surface:
   - `app/api/admin/gateway-partners/route.ts` (list/create partners), `app/api/admin/gateway-partners/[id]/route.ts`
     (update status/tier), `app/api/admin/gateway-credentials/route.ts` (issue), `.../[id]/route.ts` (revoke)
     — every route `requireAdmin()`-gated, matching the exact pattern in e.g.
     `app/api/admin/marketplace-lenders/invite/route.ts`.
   - `app/admin/gateway-partners/page.tsx` — a plain list/create/revoke UI, styled consistently with other
     `/admin/*` pages already in the app, not a new design system.

**Definition of done for Phase C:** an admin can create a partner and issue a credential through the admin
UI; that credential authenticates a real Phase A+B Gateway call; revoking it immediately blocks the next
call (test #3 from the architecture doc's validation plan, run for real, not just asserted).

---

## Phase D — Rate limits + quotas + circuit breaker

1. Draft migration `supabase/migrations/0XX_gateway_usage_counters.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS gateway_usage_counters (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     scope_type    text NOT NULL CHECK (scope_type IN ('credential','partner','ip')),
     scope_key     text NOT NULL,          -- credential id, partner id, or IP string
     window_type   text NOT NULL CHECK (window_type IN ('minute','day','month')),
     window_key    text NOT NULL,          -- e.g. '2026-09-02T14:30' / '2026-09-02' / '2026-09'
     count         integer NOT NULL DEFAULT 0,
     UNIQUE (scope_type, scope_key, window_type, window_key)
   );
   ALTER TABLE gateway_usage_counters ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "service_role_all" ON gateway_usage_counters USING (true) WITH CHECK (true);
   ```
   One flexible table for both rate-limit (minute window) and quota (day/month window) rather than
   separate tables — same shape, different window granularity, per architecture doc §10/§11.
2. Create `lib/gateway/rateLimit.ts`:
   - `checkAndIncrement(scopeType, scopeKey, windowType, limit): Promise<{ allowed: boolean; remaining: number }>`
     — same upsert-with-`onConflict` mechanic as `lib/anonGate.ts`, **but returns `allowed: false` on any
     Supabase error** (fail-closed — the one deliberate, documented divergence from `anonGate.ts`'s
     fail-open default; comment this inversion explicitly in the code, citing why, so a future reader
     doesn't "fix" it back to match `anonGate.ts`).
   - A small wrapper, `checkAllLimits(callerContext, requestIp)`, that runs the per-credential (minute),
     per-partner (minute), per-IP (minute), per-credential (day), per-credential (month) checks per
     architecture doc §10/§11, short-circuiting on the first failure.
3. Create `lib/gateway/circuitBreaker.ts`:
   - `isCircuitOpen(): Promise<boolean>` — reads the single config row from `gateway_config` (created in
     this phase or Phase E, whichever comes first in actual implementation order — both need it, create it
     once).
   ```sql
   CREATE TABLE IF NOT EXISTS gateway_config (
     key   text PRIMARY KEY,
     value jsonb NOT NULL
   );
   ```
   Rows: `('circuit_state', '{"open": false}')`, `('kill_switch', '{"enabled": false}')` — two rows in one
   small table (per architecture doc §19's note that these may share a mechanism).
4. Wire `intelligenceGateway.ts`: circuit-breaker/kill-switch check first (before auth, per architecture
   doc §12), then auth (Phase C), then `checkAllLimits()`, then the Phase A/B lookup+shaping path.

**Definition of done for Phase D:** a scripted burst against a test credential correctly returns
`RATE_LIMITED` at the configured threshold and not before; a simulated Supabase-down condition (e.g.
temporarily pointing at a bad connection string in a test environment) causes `checkAndIncrement` to return
`allowed: false`, confirmed by test, not just code inspection.

---

## Phase E — Logging/admin controls

1. Draft migration `supabase/migrations/0XX_gateway_request_log.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS gateway_request_log (
     id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     credential_id     uuid REFERENCES gateway_credentials(id),
     partner_id        uuid REFERENCES gateway_partners(id),
     address_hash      text NOT NULL,      -- sha256 of normalized address, never the raw string
     availability      text,               -- 'AVAILABLE' | 'PARTIAL' | 'NOT_AVAILABLE'
     status_code       text NOT NULL,      -- Gateway error taxonomy value, or 'OK'
     latency_ms        integer,
     rate_limit_state  jsonb,              -- snapshot of remaining counts at request time
     created_at        timestamptz NOT NULL DEFAULT now()
   );
   ALTER TABLE gateway_request_log ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "service_role_all" ON gateway_request_log USING (true) WITH CHECK (true);
   ```
2. Create `lib/gateway/logging.ts`: `logRequest(entry)` — computes `address_hash` via Node's `crypto`
   (sha256 of the normalized address string, never the raw address itself, per architecture doc §17).
3. Wire `intelligenceGateway.ts` to call `logRequest()` on every path (success, every error type) — this is
   the mechanism that later proves "zero prohibited paid-call attempts" (architecture doc §17) by simply
   never having a code path that could log one.
4. Extend the Phase C admin page with: usage view (aggregate query over `gateway_usage_counters` and
   `gateway_request_log`), recent-errors view (filtered `gateway_request_log` query), and the kill-switch
   toggle (writes to `gateway_config`'s `kill_switch` row, `requireAdmin()`-gated, matching the same admin
   pattern as everything else in Phase C).

**Definition of done for Phase E:** `gateway_request_log` never contains a plaintext address (spot-check by
querying the table directly after a test request and confirming only a hash is present); an admin can view
real usage for a real test partner in the admin UI; flipping the kill switch in the admin UI causes the
very next Gateway request (from a still-valid credential) to fail with `SERVICE_DISABLED`.

---

## Phase F — Internal test harness

Run every test enumerated in architecture doc §27/§28 (validation plan + adversarial tests) end-to-end
against the fully-assembled Phases A-E, not just per-phase in isolation — some of these (e.g. "first-party
HomeRates behavior remains unchanged") are only meaningful once the whole Gateway exists alongside the
unmodified first-party app.

**This phase is the gate before any platform-adapter work is even considered** — per the architecture
doc's own MCP/adapter boundary (§20/§21) and the original instruction that this whole workstream stops
after architecture + implementation planning. Do not begin Phase F expecting it to lead directly into MCP
implementation without a fresh, explicit go-ahead for that separate workstream.

---

## What this plan deliberately does not decide

Per architecture doc §29, these are real open questions this plan does not silently resolve by picking a
number: credential/`key_hash` retention window for revoked keys, `gateway_request_log` retention period,
whether partner tiers are a fixed enum or free-form values, per-IP allowances for a partner's own known
infrastructure, and the exact numeric rate-limit/quota defaults (§11's pilot values are a proposal, not a
researched conclusion). Any of these being wrong is a config change, not an architecture change — none of
them block starting Phase A.

---

**Per the governing instruction: this plan is a stop condition, not a starting gun.** No file listed above
exists yet. Implementation of any phase requires its own explicit authorization at that time.
