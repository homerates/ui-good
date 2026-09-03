# HomeRates Intelligence Gateway V1 — Architecture

**Status: LOCKED (2026-09-02, Rayaan).** This is the architectural baseline for Gateway V1. No Gateway
code, routes, migrations, credentials, rate limiting, admin UI, or platform adapter has been implemented —
locking this document fixes the *decisions* below for implementation planning; it does not authorize
building anything. This document turns the LOCKED `docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md`
(commit `d63ffea8`) into a concrete, buildable architecture and must not modify that contract's semantics —
it doesn't, and isn't touched by this lock.

**Decisions preserved as LOCKED by this status:**
- Same Next.js/Vercel application for V1 (§25).
- Opaque partner API keys, hashed at rest (§7/§8).
- Supabase-backed rate limiting using the existing counter pattern (`lib/anonGate.ts`) where appropriate,
  but **fail-closed** for Gateway access (§10) — the opposite of that pattern's own fail-open default.
- A dedicated corpus-only wrapper (`getPropertyIntelligenceCorpusOnly()`) as the sole Gateway intelligence
  entry point (§13).
- **The corpus-only wrapper's narrow implementation is itself the runtime security boundary.** Automated
  import-boundary/build validation is additional defense against future architectural drift, not a
  substitute for that runtime enforcement (§13).
- Allowlist-based external response construction — never serialize-then-redact (§14).
- Independent zod schema validation before any external response, fail-closed on failure (§15).
- A Supabase-controlled global Gateway kill switch that can disable external access without affecting
  first-party HomeRates (§19).
- External Property Intelligence remains zero-paid-fallback (§12/§13).
- Legal/IP review remains **REQUIRED — PARALLEL — NOT COMPLETED.** See
  `docs/MCP_Legal_IP_Checkpoint_Brief.md`. This document does not depend on that review completing first,
  per the standing governance decision, but does not substitute for it either.

**Prepared:** 2026-09-02, grounded in a direct, code-level audit — not assumptions — of
`getPropertyIntelligenceData()`'s full call graph, and a direct audit of this repository's existing
dependencies, rate-limiting precedent, partner/credential precedent, and admin-surface conventions. Every
"reuse X" recommendation below cites the real file that was read to justify it.

---

## 1. Executive summary

The Gateway is a new, single, server-side service inside the existing Next.js/Vercel app — not a separate
service, not a new deployment target. It sits between authenticated external callers and the one existing,
already-safe internal function (`getPropertyIntelligenceData()`) that already produces Contract V1's raw
material. The Gateway's entire job is: authenticate the caller, validate and rate-limit the request, call
that one existing function, shape its output through an allowlist into the locked external contract, and
log enough to operate and audit it — nothing more. No new intelligence logic. No new provider integrations.
No live/paid fallback path exists anywhere in this design; the guarantee is structural (§13), not a
promise.

Recommended V1 answers, expanded with reasoning in §26: same Next.js app, opaque API keys hashed at rest,
a Supabase-counter rate-limit/quota mechanism modeled on the existing `lib/anonGate.ts` pattern but
fail-closed, a dedicated corpus-only wrapper function as the enforcement mechanism, and a Supabase-backed
config row (not an env var) for the kill switch so it can be flipped without a redeploy.

## 2. Locked Contract V1 dependency

Everything below assumes `docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md` (locked, commit `d63ffea8`)
as fixed. The Gateway does not reinterpret which fields are `EXPOSE`/`TRANSFORM`/`INTERNAL ONLY` — that
decision was already made. The Gateway's Output Shaping layer (§14) implements Contract V1; it does not
redesign it. Any need to change Contract V1's semantics discovered during this design is called out as an
open question (§30), not silently resolved here.

## 3. System diagram

```
External AI Client (ChatGPT / Claude / Grok / Copilot / other)
        │
        ▼
Platform Adapter                         (future — not built now; §20)
        │  translates platform auth + tool-call format only
        ▼
┌─────────────────────────────────────────────────────────────┐
│  HomeRates Intelligence Gateway  (this document)             │
│                                                                │
│  Authentication / Identity  ──▶  Request Policy / Validation  │
│         │                                 │                   │
│         ▼                                 ▼                   │
│  Rate Limit / Quota  ──────▶  Global Cost Circuit Breaker      │
│         │                                 │                   │
│         └─────────────────┬───────────────┘                   │
│                            ▼                                  │
│              Corpus-Only Safe Lookup (§13)                    │
└────────────────────────────┼──────────────────────────────────┘
                             ▼
              getPropertyIntelligenceData()      (existing, unmodified — §4)
                             │
                             ▼
                     Raw Internal Result
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Output Shaping  (response-path only — §14)                   │
│  RAW RESULT → new external object from allowlist → validate   │
└────────────────────────────┼──────────────────────────────────┘
                             ▼
              Locked External Property Intelligence V1
                             │
                             ▼
                    Platform Adapter → External AI
```

Output Shaping is explicitly **response-path only**. Request validation (§6) and disclosure shaping (§14)
are separate controls that never share code — conflating them was flagged as a real risk in the diagram
review that led to Contract V1, and the same discipline applies here.

## 4. Internal entry-point audit

**Audited directly from source, not from comments.** `getPropertyIntelligenceData(propertyId)` in
`lib/propertyIntelligence.ts` calls `assembleRaw(propertyId)` plus a fixed set of pure/cached-read helper
functions. Full call graph, each node confirmed by direct code read during this session:

```
getPropertyIntelligenceData(propertyId)
├─ assembleRaw(propertyId)                         [reads only — confirmed: zero .insert/.update/.upsert/.delete calls anywhere in propertyIntelligence.ts]
│   ├─ supabase.from('properties').select(...)
│   ├─ supabase.from('property_snapshots').select(...)
│   ├─ supabase.from('grok_property_cache').select(...)     [reads a CACHE table — does not call Grok]
│   └─ supabase.from('featured_properties').select(...)
├─ computeLLPA() / resolveObmmiSeriesId()           [lib/pricing/llpa-engine.ts — pure calculation, no fetch]
├─ getStateLimitInfo() / getConformingStatus()      [lib/pricing/conforming-limits.ts — static table lookup]
├─ estimateJumboAnchor()                            [lib/pricing/jumboEstimate.ts — confirmed: zero fetch() calls in file]
├─ calculateMortgage()                              [lib/mortgageCalculator.ts — pure calculation]
├─ lookupTaxRate()                                  [lib/property/taxTable.ts — static table lookup]
├─ scoreL2() / scoreL3() / scoreL4()                [lib/scoring/decisionScore.ts — confirmed: zero fetch() calls in file]
└─ getLatest(seriesId)                              [lib/market-data/query.ts — confirmed: reads ONLY
                                                       market_data_observations table (pre-synced by the
                                                       separate market-data-sync cron) + an in-memory
                                                       cache; no live FRED call happens inside this
                                                       function]
```

**Findings, stated as confirmed facts, not inference:**
- **What it reads:** `properties`, `property_snapshots`, `grok_property_cache`, `featured_properties`,
  `market_data_observations` — all read-only.
- **Whether it can write anything:** No. Confirmed by direct grep of the file for
  `.insert(`/`.update(`/`.upsert(`/`.delete(` — zero matches.
- **Whether it invokes external providers:** No. `grok_property_cache` is a cache *table*, not a live Grok
  call — reading it does not invoke Grok. No `fetch()` call exists anywhere in the confirmed call graph.
- **Whether any indirect fallback can invoke paid APIs:** No fallback path exists in this call graph at
  all — every dependency is either a Supabase read or a pure/static computation.
- **Whether any request parameter can alter that behavior:** The function's only parameter is
  `propertyId: string` — there is no flag, option, or mode argument that could route it toward a live call.
- **Whether it depends on authenticated first-party assumptions:** No. It takes a raw property ID and
  returns data; it has no `auth()`/Clerk dependency anywhere in its own code. (Its *caller*,
  `app/property-intelligence/[id]/page.tsx`, is a public page per `middleware.ts`'s `isPublicRoute` list —
  confirming this function is already designed to be called for anonymous, unauthenticated requests.)
- **Whether it contains side effects:** None beyond the in-process `getLatest()` memory cache, which is
  read-through and has no externally observable effect.
- **Whether it can safely be called from a server-side Gateway:** Yes — it is a plain async function with
  no request/response coupling, no session dependency, and no side effects. It is already exactly the
  shape a Gateway needs to call.

**Divergence from the locked contract:** none found. Contract V1's §15 (Internal reuse boundary) claimed
this function excludes all live/paid calls "by its own existing design" — this audit independently confirms
that claim at the call-graph level, not just from the function's own header comment. No implementation gap
was found between what Contract V1 assumed and what the code actually does.

**Not modified in this workstream**, per instruction — this audit is read-only.

## 5. Gateway responsibilities

The Gateway owns: authentication context, authorization/scopes, request validation, rate-limit and quota
enforcement, cost-policy enforcement (the circuit breaker), the corpus-only safe lookup wrapper, output
shaping, external schema validation, and observability/audit logging.

The Gateway does **not** own, and must never reimplement: property methodology, LLPA calculations, Track 5
methodology, five-card intelligence logic, provider integrations, deep enrichment, or acquisition. All of
that stays exactly where it already lives (`lib/propertyIntelligence.ts` and its dependencies), called
through the one entry point in §4/§13, never duplicated.

Proposed naming, following this repo's existing `lib/*.ts` module convention (e.g. `lib/adminAuth.ts`,
`lib/subscription.ts`) rather than inventing a new directory structure: `lib/gateway/intelligenceGateway.ts`
exporting a single entry point, conceptually `getPropertyIntelligence(request, callerContext)`. Exact
naming is a Phase A implementation detail (§27), not fixed here.

## 6. Request policy

Grounded directly in Contract V1 §6. Allowed fields: `address` only. Required: `address`. Everything else
is rejected, not silently ignored — an explicit allowlist-reject policy (not an allowlist-strip policy),
so a caller sending an unexpected field gets a clear `INVALID_REQUEST` rather than a request that silently
did something other than what they asked.

**Explicitly rejected, never accepted under any name:** `refresh`/`force`/`deep=true` or any flag that
could alter internal behavior, `provider=...`, `debug=true`, an internal `properties.id` (Contract V1 §6:
address is the primary interface; V1 has no ID-based bypass), any field not in the address-only allowlist.

**Validation:** max length ~300 characters (abuse/DoS guard, not a business rule — matches Contract V1
§6). Normalization reuses the existing strict-normalization function already used for corpus matching
(lowercase, strip punctuation, collapse whitespace — same class of function already used by
`grok_property_cache` writes and the deep-enrich pipeline, not a new normalization scheme). Malformed JSON
→ `INVALID_REQUEST`. Non-US address → same `NOT_AVAILABLE` path as no corpus match (Contract V1 §6).
Ambiguous address → no fuzzy matching in V1, treated as `NOT_AVAILABLE` if it doesn't resolve to an exact
normalized match.

**Unknown-field policy, explicit recommendation:** reject with `INVALID_REQUEST`, don't silently ignore.
Silently ignoring unknown fields is how a client mistakenly believes an unsupported option (e.g.
`refresh=true`) was honored when it was actually dropped — an explicit rejection is safer and more honest
about what the contract actually supports.

## 7. Authentication design

**Clerk sessions are not the mechanism.** Confirmed directly: `lib/adminAuth.ts`'s `requireAdmin()` and
every other in-app auth check depend on `auth()` from `@clerk/nextjs/server`, which requires a live
first-party browser session — there is no server-to-server equivalent, and building one would mean asking
external AI platforms to somehow obtain a HomeRates user's Clerk session, which is both impossible for a
platform acting on behalf of many of its own users and architecturally wrong for what this is (partner
identity, not end-user identity).

**Options evaluated:**
- **(A) Opaque API keys** — simplest, matches this repo's overall preference for minimal infrastructure,
  requires no new external dependency (no OAuth provider, no JWT library beyond what's already available).
- **(B) Signed tokens (JWT)** — adds a verification/signing-key management burden for no V1 benefit; V1 has
  no need for stateless verification at the edge, since every request already hits the Gateway's own
  Supabase-backed rate-limit check regardless, so there's no latency win from avoiding a DB lookup.
- **(C) OAuth client credentials** — the closest "correct" enterprise pattern for server-to-server partner
  auth, but requires standing up an OAuth token-issuance endpoint and token lifecycle management this repo
  has no precedent for anywhere (confirmed: no existing OAuth-provider code in `lib/` or `app/api/`).
  Overengineered for V1's actual need (a handful of platform partners, not a self-serve developer
  ecosystem).
- **(D) Another repository-compatible mechanism** — none found; this would be the first server-to-server
  partner-auth surface in the app.

**Recommendation: (A) opaque API keys**, matching the Reproducibility/architecture-compatibility
discipline of not overengineering for hypothetical future requirements (`feedback_architecture_compatibility_check.md`).
End-user delegated OAuth (a platform's own end user authorizing HomeRates access to something
user-specific) is explicitly deferred — V1 has no user-specific data to protect behind such a flow (§13 of
Contract V1 already confirms the response contains no borrower/cross-user data), so there is nothing for
delegated OAuth to gate in V1.

## 8. Credential design

No existing precedent for credential storage exists anywhere in this codebase — confirmed by a direct
search of every migration file for `api_key`/credential-shaped tables (zero matches). This is genuinely new
schema, designed here but **not created yet** (additive-only, per instruction).

**Never persist plaintext after issuance** — standard practice, and the only credential-shaped table this
repo will have, so there's no existing convention to match or diverge from; following industry-standard
practice directly.

Proposed shape (schema, not a migration):
- `key_prefix` — a short, non-secret public identifier shown in the admin UI and in logs (e.g.
  `hri_live_a1b2c3`) so an operator can identify a key without ever seeing the secret again.
- `key_hash` — a salted hash (SHA-256 or better) of the full secret; the full secret is shown to the
  admin exactly once at issuance time and never stored or displayable again.
- `status` — `active`/`revoked`/`disabled`, mirroring the lifecycle-status pattern already established in
  `marketplace_lenders` (`status text check (status in (...))`, migration `055_marketplace_lenders.sql`) —
  reusing a real, already-proven convention rather than inventing a new one.
- `partner_id` — foreign key to a `gateway_partners` table (§24).
- `scopes` — array, V1 always `['property_intelligence:read']` (§9), but stored as an array from day one
  so a V2 scope doesn't require a schema migration to add, only a new value.
- `rate_limit_tier` / `quota_tier` — foreign key or enum referencing tier definitions (§10/§11).
- `expires_at` — nullable timestamp; optional in V1, not required.
- `created_at`, `last_used_at`, `revoked_at` — audit timestamps.

**Rotation:** issuing a new key and revoking the old one — no in-place secret rotation mechanism needed for
V1 (that's a V2 convenience feature, not a security requirement; revoke-and-reissue is secure and simple).

**Display behavior:** the full secret is returned exactly once, in the admin-issuance API response body —
never re-displayable, never logged, never stored anywhere but the hash.

**Is Supabase appropriate?** Yes — every other piece of state in this app lives in Supabase (confirmed
throughout the whole session's work), there is no reason for credentials specifically to live elsewhere,
and Supabase's Postgres gives real transactional guarantees a KV store wouldn't.

## 9. Authorization / scopes

V1 exposes exactly one capability: `property_intelligence:read`. Every issued credential in V1 gets exactly
this scope — there is no scope selection UI needed yet, since there's nothing else to select.

Scopes are stored **per credential**, not per partner — a partner could plausibly want two credentials with
different scopes in the future (e.g. a staging key vs. a production key with different tiers), and storing
at the credential level costs nothing extra now while avoiding a schema change later when a second scope
exists. This does not mean building scope *selection* UI now — the admin issuance flow can simply always
set `['property_intelligence:read']` for V1; only the column needs to already be an array.

## 10. Rate limiting

**Audited the repository directly for existing infrastructure:** no Redis, no Upstash, no rate-limiting
library in `package.json` (confirmed — full dependency list checked, §"package audit" below). One real,
production precedent exists: `lib/anonGate.ts` — a Supabase-counter pattern (`ip + date` key, `count`
column, `upsert` with `onConflict: 'ip,date'`) already used for anonymous chat/investor-intel rate limiting.

**Recommendation: reuse the same mechanical pattern, with one deliberate change.** `anonGate.ts`
**fails open** on any DB error ("never block on DB error") — correct for a consumer-facing feature where
blocking a real user over an infra hiccup is the wrong tradeoff. The Gateway is the opposite case: per the
failure-mode review's own instruction (§22), external access where cost/privacy/IP exposure is at stake
should default **fail-closed**. So: same table shape and upsert mechanism, inverted default — a rate-limit
check that can't reach Supabase returns "deny," not "allow."

**Tiers, per §9's required coverage:**
- **Per credential** — the primary limit, since credentials are the actual identity unit.
- **Per partner** — an aggregate ceiling across all of one partner's credentials, so a partner can't
  circumvent their limit by requesting multiple keys.
- **Per IP** — a secondary guard specifically against credential theft/sharing (§21) — if traffic on one
  credential suddenly fans out across many IPs beyond what a single platform's server infrastructure would
  plausibly produce, that's a signal worth a coarser IP-level check too, not a replacement for the
  credential-level one.
- **Burst vs. sustained** — a short-window burst limit (e.g. per-minute) catches runaway/misconfigured
  clients fast; a longer sustained limit (§11's daily/monthly quota) catches slow-drip abuse the burst
  limit wouldn't.

## 11. Quotas

Distinct from rate limiting (§10) — quota is about total volume over a longer window, not request pace.
Recommend V1 track **requests per day** and **requests per month** per credential (partner-level quota is
the sum, enforced the same way as partner-level rate limiting in §10). Requests-per-minute is a rate-limit
concern (§10), not a quota concern — keeping these conceptually and mechanically separate, per instruction.

**Conservative pilot defaults, explicitly proposed, not fact:**
- Rate limit: 10 requests/minute per credential, 30 requests/minute per partner (burst).
- Quota: 500 requests/day, 5,000 requests/month per credential.

These numbers exist to prevent bulk scraping/oracle-style extraction (§21) while comfortably supporting a
real pilot integration's normal usage — they are a starting point for the first partner conversation, not
a permanent ceiling, and should be revisited once real usage data exists (§28's operating-metrics loop is
exactly how that revision gets informed by evidence instead of guesswork).

## 12. Global cost circuit breaker

A named, independent component — distinct from rate limiting/quotas, per instruction. Its job isn't "slow
down one bad actor" (that's §10/§11), it's "stop everything if total system-wide behavior looks wrong,"
which matters even though — **especially** because — V1 has zero paid-fallback budget by design (§13).

**V1's stricter rule, stated exactly as instructed:** external Property Intelligence requests have zero
paid-fallback budget. If any code path would cause a paid live call, it fails closed — full stop, not a
warning.

**How that's enforced structurally, not by developer discipline (§13 gives the mechanism):** the circuit
breaker's practical job in V1 is narrower than its name suggests, because there's no live spending to
actually throttle yet. Its real V1 value is as insurance against **future** drift: if a later Gateway tool
legitimately needs paid generation (a hypothetical V2/V3 capability, not built now), the circuit breaker is
the pre-existing, already-wired component that a new paid code path would have to check before spending —
so cost containment is designed in from V1's first line of code, not retrofitted after the first accidental
overspend (matching the exact failure mode `feedback_grok_cache_rule.md` already documents as a real,
already-happened incident).

**Recommended implementation:** a single Supabase-backed config row (`gateway_config` table or similar,
§24) holding a boolean/enum "circuit state" (`closed` = normal, `open` = fail everything), checked at the
very top of the Gateway's request path — before auth, before rate limiting, before anything else — so a
tripped breaker is the cheapest possible failure (one read, immediate reject), not something that still
walks through the rest of the pipeline first.

## 13. Corpus-only guarantee

**This is the load-bearing V1 invariant**, and the instruction is explicit: don't just say "call
`getPropertyIntelligenceData()` because it currently doesn't [make paid calls]" — that's a fact about
today's code, not a guarantee that survives a future refactor.

**Mechanisms evaluated:**
- Explicit corpus-only service mode / dependency injection — would require threading a "no-live-calls" flag
  through every dependency in §4's call graph, touching code this workstream is explicitly told not to
  modify.
- Policy context / runtime guard that intercepts `fetch()` globally within the Gateway's request scope —
  powerful but heavy-handed, and risks false positives against the legitimate Supabase client calls the
  function genuinely needs to make.
- **Separate internal function that calls the same core logic but structurally cannot reach a live path —
  recommended.**

**Recommended architecture:** a thin wrapper, `getPropertyIntelligenceCorpusOnly(propertyId)`, that lives
in the Gateway's own module (not inside `lib/propertyIntelligence.ts` — that file is explicitly not
modified in this workstream) and does exactly one thing: calls the existing `getPropertyIntelligenceData()`
unchanged, with no other logic. **The wrapper's narrow implementation is itself the runtime security
boundary** — because it structurally contains nothing but that one call (§4's audit already proved that
call's entire dependency graph is corpus/cache-only), there is no live-call path for the Gateway to reach
*at runtime*, independent of any build-time tooling. This is enforcement by construction, not by convention
or by a check that could be disabled.

**The automated import-boundary check (validation plan §28, tests #8-#13) is additional defense against
future architectural drift, not a substitute for that runtime enforcement.** Its job is narrower than the
wrapper's own guarantee: it catches a *future* change — a developer adding a second call target to the
wrapper file, or a live-provider import creeping in elsewhere under `lib/gateway/` — before it ships, by
failing the build. If that check were deleted entirely, the wrapper as specified today would still be
corpus-only; the check exists to keep it that way over time, not to make it that way now.

This is the strongest guarantee achievable without either duplicating `propertyIntelligence.ts`'s logic (which
the instructions explicitly forbid — no parallel implementation) or modifying it (also forbidden in this
workstream) — a structural import-boundary check is real protection, not merely documentation, while
adding zero duplication.

## 14. Output shaping

**RAW INTERNAL RESULT → construct NEW external object from explicit allowed fields → validate against
Contract V1 → return.** Never serialize-then-redact — this is Contract V1's own §3 hard rule, restated as
an implementation requirement here, not re-litigated.

The output-shaping module is a single function, `shapeForExternalContract(raw: PropertyIntelligenceData):
ExternalPropertyIntelligenceV1`, that reads every field it needs from `raw` by name and writes every field
of the external object by name — there is no spread operator, no object-rest-destructure-then-delete
pattern anywhere in this function, by convention enforced in code review (and by the schema-validation
fail-closed behavior in §15 as a second line of defense: even if a stray internal field somehow leaked
through, it would only ever reach a *caller* if it passed Contract V1's own schema, which doesn't include
it).

Protects both **values** (§5 of Contract V1's classification matrix — which raw values are safe to expose
at all) and **field names/shape** (Contract V1 §3's explicit warning that a value can be non-sensitive
while its field name is sensitive) — explicitly guards against L1-L4/weights/thresholds,
`methodologyVersion`, model/vendor names, cross-model orchestration references, prompt structure, cache
metadata, database IDs, provider-fallback details, `search_count`, acquisition metadata, debug traces,
internal confidence-scoring implementation, reasoning traces, and any raw Supabase column name — the exact
list Contract V1 §5 and §10-§14 already enumerated field-by-field; this section implements that list, it
does not re-derive it.

## 15. Schema validation

**Audited the repository for existing validation libraries:** `zod` is already a `package.json` dependency
(confirmed directly), with one existing precedent (`src/lib/schema.ts`'s `AnswerReq` object — a
`z.object({...})` with `.min()`/`.enum()`/`.max()` constraints and an exported `z.infer<>` type). Minimal
existing usage, but real precedent for the pattern, and zero new dependency required.

**Recommendation: zod**, for the external response schema — validate the shaped output against a zod
schema that mirrors Contract V1 exactly before it's ever returned to a caller. **On validation failure: fail
closed** — return `INTERNAL_ERROR` (§16), never fall back to returning the raw/unvalidated object. This is
the second, independent line of defense behind §14's allowlist-construction discipline — two different
failure modes (a coding mistake in the shaping function, and a schema drift between Contract V1 and its
implementation) both get caught by requiring the *output*, not just the *construction process*, to prove
itself safe before it leaves the Gateway.

## 16. Error model

External error taxonomy, aligned with Contract V1's own vocabulary where relevant (its `availability`
states are a *response*, these are Gateway-*rejection* categories — related but distinct):

| Code | Meaning | Retryable |
|---|---|---|
| `UNAUTHORIZED` | Missing or invalid credential | No — fix credential first |
| `FORBIDDEN` | Valid credential, insufficient scope, or partner disabled | No |
| `RATE_LIMITED` | Per-credential/partner/IP rate limit exceeded | Yes, after backoff |
| `QUOTA_EXCEEDED` | Daily/monthly quota exhausted | Yes, next window |
| `INVALID_REQUEST` | Malformed/unsupported request shape (§6) | No — fix request |
| `NOT_AVAILABLE` | Contract V1's own availability state — not a Gateway error, a valid response | N/A |
| `STALE` | Not a distinct error — a `freshness.staleness` field within a normal `AVAILABLE` response (Contract V1 §11/§12) | N/A |
| `SERVICE_DISABLED` | Global kill switch is open (§12/§18) | Yes, once re-enabled |
| `INTERNAL_ERROR` | Schema-validation failure, unexpected exception, or any other unclassified failure | Yes, may be transient |

**Never exposed in any error response:** stack traces, SQL error text, provider error bodies, internal
route paths, model/vendor names, cache state, secret IDs, or any detail beyond the fixed code + a short,
generic, human-readable message. Full detail goes to the Gateway's own logs (§17) only.

## 17. Logging / observability

Must answer, for any given request: who called (partner + credential, never the raw secret), which tool
(`property_intelligence:read` — trivial in V1, matters once a V2 scope exists), which property (see
below), when, response status, availability state, latency, rate-limit/quota state at time of request, and
— critically — whether any prohibited paid-call attempt was ever detected (should always be "no," logged
explicitly so its absence is provable, not just assumed).

**Address logging — explicit privacy tradeoff, resolved toward normalized/hashed form.** Storing raw
addresses in Gateway logs would let an operator debug real queries easily, but persists a log of exactly
what an external platform's end users are asking about — a genuine privacy surface this repo has otherwise
been careful to avoid creating (`feedback_consumer_privacy_hard_rule.md`'s spirit, even though the direct
rule is about consumer-to-LO data flow, not this exact scenario). **Recommendation: log a normalized-address
hash, not the raw string.** This still lets an operator correlate "this exact query happened N times" or
"this address is generating errors" without persisting a plaintext log of real people's real address
lookups. If a genuine debugging need for the raw address arises, it should require a deliberate, logged,
admin-initiated action — not be sitting in every log line by default.

**Never logged:** the plaintext API key/secret (only `key_prefix`, per §8), and no request/response body
content beyond what's needed for the fields above.

## 18. Admin controls

**Audited for an existing pattern to reuse:** `lib/adminAuth.ts`'s `requireAdmin()` (Clerk `auth()` +
`admin_users` table + a hardcoded bootstrap-admin fallback) already gates every admin surface in this app —
confirmed as the mechanism behind `/admin/marketplace-lenders`-style pages and every `app/api/admin/*`
route audited this session. **Recommendation: reuse `requireAdmin()` unchanged** for every new
Gateway-admin route/page — this is exactly what it's for, and inventing a second admin-gate mechanism for
one new feature area would be pure duplication with no benefit.

**Minimum necessary admin operations for V1** (explicitly not a full dashboard, per instruction):
create partner, issue credential (returns the plaintext secret exactly once), revoke credential,
enable/disable partner, view usage (aggregate counts per partner/credential, sourced from §10/§11's own
counter tables — no separate analytics system needed), view recent errors (a simple recent-Gateway-errors
list, sourced from §17's logs), change quota/rate-limit tier, and the global kill switch (§19). A single
new admin page (e.g. `/admin/gateway-partners`) following the existing pattern (`app/admin/*/page.tsx` +
`app/api/admin/*/route.ts`, `requireAdmin()`-gated) covers all of these — no new admin framework needed.

## 19. Kill switch

An immediate, server-side, all-Gateway-requests-fail-closed switch, independent of any external platform's
own configuration (a platform partner cannot un-disable HomeRates' own kill switch from their side, by
construction — it's checked entirely server-side).

**Where it should live:** a single row in a small `gateway_config` table in Supabase (not an environment
variable). An env var requires a redeploy to change — unacceptable latency for an actual incident response
switch. A Supabase-backed boolean, checked at the very top of every Gateway request (before auth, per
§12), can be flipped from the admin UI (§18) in seconds with no deploy. This is the same config-row pattern
recommended for the circuit breaker in §12 — in practice these may be the same table/mechanism, or two
rows in one small table; a genuinely separate concept from the corpus-only guarantee (§13), which prevents
paid calls specifically, versus the kill switch, which stops *all* Gateway traffic for any operational
reason (an incident, a planned pause, anything).

**First-party HomeRates app behavior is completely independent of this switch** — the kill switch only
gates the Gateway's own request path; it has no connection to `app/property-intelligence/[id]/page.tsx` or
any other first-party surface, which continue calling `getPropertyIntelligenceData()` directly as they
already do today, unaffected.

## 20. Platform adapter boundary

**Adapters may:** translate a platform's own auth/context format into a Gateway credential-bearing request,
map that platform's tool-invocation format into the Gateway's request contract (§6), call the Gateway (and
only the Gateway), and translate the Gateway's response into whatever protocol shape that platform expects.

**Adapters may not:** call HomeRates engines directly, change intelligence methodology, bypass auth/quota,
trigger live enrichment, reshape proprietary raw results (that's the Gateway's Output Shaping job, §14, not
an adapter's), or contain any business logic of their own. An adapter is a translation layer with zero
decision-making authority — every actual decision (is this caller allowed, is this data safe to return) is
made by the Gateway, every time, regardless of which adapter is asking.

This boundary is what makes the Gateway genuinely platform-neutral: MCP, a ChatGPT Apps SDK manifest, a
Copilot Federated Connector, and any future protocol are all just different translation shims in front of
the exact same Gateway behavior — none of them can special-case their own access to get something another
adapter couldn't.

## 21. MCP boundary

**Not implemented in this workstream, and this document does not authorize implementing it.** Documenting
only where it will sit once built:

```
MCP Server / Adapter → Gateway → getPropertyIntelligenceData() → Contract V1
```

Never: `MCP → propertyIntelligence.ts directly`. Never: `MCP → Supabase directly`. Never: `MCP →
Grok/Tavily/Redfin directly`. The Gateway is the sole authoritative external-access boundary, regardless of
protocol — MCP is one adapter among the several the diagram in the original architecture conversation
named (ChatGPT, Grok, Copilot, other), and none of them get a shortcut.

## 22. Threat model

| Threat | Likelihood | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Credential theft | Medium | High (attacker gets the stolen credential's full quota) | Hashed storage (§8), per-IP secondary limit (§10), instant admin revocation (§18) | Window between theft and detection/revocation — real, not eliminated |
| Bulk scraping | Medium-High | Medium (coverage-footprint leak, §14 of Contract V1) | Rate limit + quota (§10/§11) | A patient, slow-drip scraper under quota thresholds could still map coverage over a long period |
| Oracle/reverse-engineering of Track 5 | Low-Medium (requires sophistication) | High if successful (Trade Secret #1) | Output shaping excludes raw scores entirely (§14) — no numeric gradient exists to attack | Categorical verdict pattern-mapping (Contract V1 §14) — real, low-severity, not zero |
| Schema probing | Medium | Low | Consistent `INVALID_REQUEST` behavior, no verbose error detail (§16) | Low — this contract is deliberately small, little to discover |
| Malformed-input attacks | Medium | Low | Strict validation, fail-closed on schema failure (§6/§15) | Low |
| Quota bypass (multiple credentials) | Medium | Medium | Partner-level aggregate limits, not just per-credential (§10/§11) | An operator creating many partners to evade this — an admin-process control, not a technical one |
| Partner key sharing | Medium | Medium | Per-IP secondary rate limit as an anomaly signal (§10); usage visibility for admins (§18) | Real — nothing technical fully prevents a partner from sharing their own key |
| Replay | Low | Low (read-only, idempotent requests — replaying a read has minimal impact) | Not specially mitigated in V1; revisit if V1 ever adds a non-idempotent operation | Acceptable for a read-only contract |
| Endpoint enumeration | Low | Low | Single endpoint, address-only request shape — little to enumerate | Low |
| Attempted live-provider triggering | Low (no accepted parameter enables it) | High if it ever succeeded | Structural: no request field can select a live path (§6); corpus-only wrapper (§13) | Only realistic vector is a future code change reintroducing one — covered by §13's import-boundary check |
| Response leakage (internal fields) | Low | High if it happened | Allowlist construction + schema validation, two independent layers (§14/§15) | A bug in the allowlist function itself is the remaining risk — mitigated, not eliminated, by validation |
| Debug leakage | Low | Medium | No debug flags accepted (§6); generic error bodies only (§16) | Low |
| Denial-of-service | Medium | Medium | Rate limit/quota/circuit breaker layered defense (§10-§12) | A sufficiently distributed attack could still degrade service — no CDN/WAF-level mitigation designed here, may be a Vercel-platform-level concern outside this document's scope |
| Internal-route bypass | Low | High if it happened | Gateway is the sole caller of the corpus-only wrapper (§13); no other route exposes it externally | Low |

No claim of perfect security is made anywhere in this document, per instruction.

## 23. Failure-mode matrix

| Failure | Recommended behavior | Why |
|---|---|---|
| Gateway itself unavailable | N/A (client sees a connection failure) | First-party app unaffected regardless (§19) |
| Supabase unavailable | **Fail closed** | Cost/IP/privacy at stake externally — the opposite default from `anonGate.ts`'s consumer-facing fail-open (§10) |
| Rate-limit store unavailable | **Fail closed** | Same store as above in this design (§10) — same reasoning |
| Schema-validation failure | **Fail closed** (§15) | Never return an unvalidated/potentially-unsafe object |
| Property known but partial | Return `PARTIAL` — this is a normal Contract V1 response, not a failure | Contract V1 §12 |
| Property stale | Return `AVAILABLE` with `staleness: STALE` — not a failure | Contract V1 §11/§12 |
| Partner disabled | **Fail closed** (`FORBIDDEN`) | Deliberate admin action; honor it immediately |
| Credential revoked | **Fail closed** (`UNAUTHORIZED`) | Same |
| Quota-state unavailable (can't determine current usage) | **Fail closed** | Can't prove the request is within quota — don't assume it is |
| Unexpected paid-call attempt (should be structurally impossible, §13) | **Fail closed**, trip the circuit breaker (§12), alert | This should never happen; treat any occurrence as an incident, not a retryable error |
| Internal engine (`getPropertyIntelligenceData()`) throws | **Fail closed** (`INTERNAL_ERROR`) | Never expose the raw exception (§16) |

Consistent theme, matching the instruction directly: **default fail-closed wherever privacy, cost, or IP
could be exposed by failing open.** The only fail-open-shaped behaviors in this whole design are Contract
V1's own legitimate non-error states (`PARTIAL`, `STALE`) — which aren't failures at all.

## 24. Database / schema impact

Additive only. Nothing below is created in this workstream — proposed for the implementation phases (§27).

| Table | Purpose | Retention | Privacy classification |
|---|---|---|---|
| `gateway_partners` | One row per external integration partner (name, contact, status lifecycle mirroring `marketplace_lenders`' pattern) | Indefinite (business record) | Internal business data, not consumer PII |
| `gateway_credentials` | API key hash/prefix, scopes, tier, status, per §8 | Indefinite, but `key_hash` for a revoked key can be purged after a retention window (TBD, not decided here) | Secret material (hash only) — highest-sensitivity table in this set |
| `gateway_usage_counters` | Rate-limit and quota counters, modeled on `anon_chat_usage`'s shape (credential/partner + window + count) | Short-lived for rate-limit windows (can be pruned after expiry); quota windows retained per §28's operating-metrics need | No consumer PII — counts only |
| `gateway_request_log` | Audit log per §17 — normalized-address-hash, not raw address; partner/credential/status/latency/availability-state | A defined retention window (recommend 90 days as a starting point, not decided here) — long enough for abuse investigation, not indefinite | Contains a one-way address hash, not raw consumer query content — lower sensitivity than a raw-address log would be, but still real operational data worth a retention policy rather than indefinite accumulation |
| `gateway_config` | Kill switch + circuit-breaker state, §12/§19 | Indefinite (operational config) | No sensitivity — boolean/enum state only |

No changes proposed to any existing table. `getPropertyIntelligenceData()`'s own tables (`properties`,
`property_snapshots`, `grok_property_cache`, `featured_properties`) are read-only from the Gateway's
perspective and untouched by this schema.

## 25. Deployment recommendation

Per `feedback_architecture_compatibility_check.md`: don't introduce new architecture without a stated
reason it's actually needed.

**Evaluated:** same Next.js/Vercel app (new API routes under `app/api/gateway/*`) vs. a separate service vs.
a separate Vercel project vs. an edge/serverless route pattern.

**Recommendation: same Next.js/Vercel application.** Every piece of this design — the corpus-only wrapper
(§13), the Output Shaping layer (§14), the rate-limit/quota counters (§10/§11) — needs to call
`getPropertyIntelligenceData()` and read the same Supabase tables the rest of the app already uses. A
separate service would mean either duplicating that access (violating the "no parallel implementation"
rule) or adding network-hop latency and a second deployment/monitoring surface for zero functional benefit.
This entire app is already one Next.js/Vercel deployment (confirmed throughout this whole session's work —
no existing precedent for a second service anywhere in this repository), and nothing about the Gateway's
actual requirements (auth, rate limiting, a read-only DB call, response shaping) needs isolation a separate
service would provide. The genuine isolation this design needs — the Gateway must never call anything the
corpus-only wrapper doesn't expose — is achieved by the import-boundary discipline in §13, not by physical
service separation.

Comparison, briefly: operational complexity (same app = lower, one deploy pipeline already in place),
isolation (achieved via code boundary, not needed via infra boundary), security boundary (auth/rate-limit
logic is identical either way — a separate service doesn't make credential checking more secure), cost
(a second Vercel project/service is pure additional cost with no offsetting benefit here), reuse (same app
reuses the existing Supabase client, existing admin-auth pattern, existing deploy/CI pipeline directly).

## 26. Implementation phases

Base sequence for this specific repository, not a generic template:

**Phase A — Shared Gateway service + corpus-only guard**
Scope: `lib/gateway/intelligenceGateway.ts` (the single entry point), `getPropertyIntelligenceCorpusOnly()`
wrapper (§13), the import-boundary check as an automated test. Files likely affected: new `lib/gateway/`
directory only — nothing existing modified. Tests: call graph never reaches a live-call module. Rollback
boundary: entirely new code, zero risk to existing app — revert by deleting the new files. Stop condition:
the wrapper returns real data for a known-good property ID, calling nothing but
`getPropertyIntelligenceData()`.

**Phase B — Output shaping + schema validation**
Scope: `shapeForExternalContract()` (§14), the zod schema mirroring Contract V1 (§15). Files: new
`lib/gateway/outputShaping.ts` + `lib/gateway/schema.ts`. Tests: every Contract V1 example response (§17 of
the contract doc) round-trips through shaping + validation correctly; a deliberately-corrupted raw object
never survives to a returned response. Rollback boundary: still no existing file touched. Stop condition:
shaped output for a real property matches Contract V1's example shape field-for-field.

**Phase C — Partner auth + credentials**
Scope: `gateway_partners`/`gateway_credentials` migrations (§24), credential issuance/hashing/verification
logic, the admin issuance flow (§18). Files: new migration files, `lib/gateway/auth.ts`, one new admin
page/route pair. Tests: valid key authenticates, revoked/expired key rejected, wrong scope rejected.
Rollback boundary: new tables only, additive migrations, no existing table touched. Stop condition: a
manually-issued test key can authenticate a Gateway request end-to-end.

**Phase D — Rate limits + quotas + circuit breaker**
Scope: `gateway_usage_counters` migration, the fail-closed counter-check logic modeled on `anonGate.ts`
(§10), the `gateway_config`-backed circuit breaker (§12). Files: new migration, `lib/gateway/rateLimit.ts`,
`lib/gateway/circuitBreaker.ts`. Tests: limit/quota trip correctly at the configured threshold; a
simulated Supabase-unavailable condition fails closed, not open. Rollback boundary: additive only. Stop
condition: a scripted burst of requests against a test credential correctly gets rate-limited.

**Phase E — Logging/admin controls**
Scope: `gateway_request_log` migration, the admin usage/error views, the kill switch UI control (§18/§19).
Files: new migration, admin page additions. Tests: address is logged as a hash, never plaintext; kill
switch immediately blocks new requests. Rollback boundary: additive only; kill switch itself is a safety
feature, not a risk. Stop condition: an admin can view real usage for a real test partner and flip the kill
switch live.

**Phase F — Internal test harness**
Scope: the full validation-plan test suite (§28) run end-to-end against Phases A-E together, including the
adversarial cases. Files: test files only. Stop condition: every test in §28 passes; this is the gate
before any platform adapter work (explicitly out of scope for this whole document, §21) is even
considered.

## 27. Validation plan

Direct tests for every case named in the instruction, plus the reasoning for each:

1. Valid authorized request returns Contract V1 shape only — the core happy path.
2. Invalid credential cannot access — `UNAUTHORIZED`.
3. Revoked credential cannot access — `UNAUTHORIZED`, immediately after admin revocation (no caching delay
   that would let a just-revoked key keep working).
4. Unauthorized scope cannot access — `FORBIDDEN` (trivial in V1's single-scope world, but the test still
   matters once a V2 scope exists and this is the regression guard).
5. Rate limit works — burst past the per-credential limit, confirm `RATE_LIMITED`.
6. Quota works — same for the daily/monthly ceiling, confirm `QUOTA_EXCEEDED`.
7. Global kill switch works — flip it, confirm every request (even from a valid credential) gets
   `SERVICE_DISABLED`.
8. Unknown property does not trigger live lookup — assert zero calls to any live-provider module for an
   address with no corpus match.
9. Partial property does not trigger live lookup — same assertion for a `PARTIAL`-eligible property.
10. Stale property does not trigger paid refresh — same assertion for a property whose `as_of` is old.
11. Grok cannot be called — static/import-boundary assertion (§13), not just a runtime test.
12. Tavily cannot be called — same.
13. Redfin cannot be called — same.
14. Internal fields cannot leak — snapshot-test the shaped output against Contract V1's schema; assert
    every `INTERNAL ONLY`-classified field (Contract V1 §5) is absent by construction.
15. Raw objects cannot leak on exceptions — force an internal throw, assert the caller only ever sees
    `INTERNAL_ERROR` with the fixed generic message, never the real error.
16. Schema-validation failure fails closed — feed the shaping function a deliberately malformed object,
    confirm the Gateway returns `INTERNAL_ERROR`, never the malformed object itself.
17. First-party HomeRates behavior remains unchanged — since Phase A never modifies
    `lib/propertyIntelligence.ts` or its callers, this is really a regression guard confirming that claim:
    `app/property-intelligence/[id]/page.tsx` renders identically before and after the Gateway exists.
18. Existing five-card methodology remains unchanged — same reasoning; the Gateway calls the existing
    function, it doesn't fork it.

**Adversarial tests, explicitly included per instruction:** attempt every rejected request-field from §6
(`refresh=true`, `force=true`, `provider=...`, `debug=true`, a raw `properties.id`) and confirm each is
rejected, not silently dropped-and-processed; attempt a request with an internal property ID formatted to
look like an address, confirm it's treated as an (almost certainly non-matching) address string, not as an
ID bypass; attempt rapid credential-cycling to test whether partner-level (not just credential-level) rate
limiting actually catches it.

## 28. Operating metrics

At minimum: external requests (count, over time), unique partners, unique property requests (distinct
addresses queried), available-response rate, partial-response rate, not-available rate, repeat-request
rate (same address queried more than once — a proxy for whether external AI usage is exploratory or
sustained), latency (p50/p95), rate-limit/quota events (how often limits actually bind — informs whether
the pilot defaults in §11 are well-calibrated or need adjusting), blocked malicious/invalid request count.

**Eventually, not now:** external-AI-usage → HomeRates-traffic attribution/consumer engagement. This
requires a real tracking mechanism this document does not design and should not assume exists — Contract
V1's response contains no tracking pixel, no referral parameter, nothing that would let HomeRates attribute
a later human visit back to an earlier AI query. If that attribution becomes a real product goal, it needs
its own deliberate design (and its own privacy review, given `feedback_consumer_privacy_hard_rule.md`'s
standing caution about tracking), not an assumption baked in here.

## 29. Open questions

1. Credential rotation/`key_hash` retention window for revoked keys (§8/§24) — not decided here, needs an
   operational-policy owner.
2. `gateway_request_log` retention period (§24) — 90 days proposed as a starting point, not confirmed.
3. Should partner-level rate/quota tiers be a fixed small enum (e.g. `pilot`/`standard`) or a free-form
   per-partner number from day one? Recommend starting with the fixed enum (simpler, matches "conservative
   pilot values" framing in §11) and revisit once a second real partner exists.
4. Does the per-IP rate-limit tier (§10) need any allowance for a platform's own infrastructure
   legitimately calling from a small, known set of egress IPs (which could look like "one IP generating a
   lot of traffic" even when fully legitimate)? Worth resolving with the first real partner's actual
   traffic pattern, not guessed at now.
5. Exact numeric values in §11's pilot quota/rate-limit defaults are a starting proposal, not a locked
   decision — flagged here explicitly so they aren't mistaken for a researched conclusion.

## 30. Final recommendation

Contract V1 is buildable behind a Gateway that adds no new intelligence logic, no new provider
integrations, and no live/paid call path anywhere — every piece of this architecture either reuses an
existing, audited, safe function (`getPropertyIntelligenceData()`) or reuses an existing repository
pattern (`anonGate.ts`'s counter mechanism, `marketplace_lenders`' status lifecycle, `requireAdmin()`'s
admin gate, zod for validation) rather than inventing new infrastructure. The one genuinely new piece of
infrastructure — credential storage (§8) — has no existing precedent to reuse because none of this app's
prior features needed server-to-server partner identity; it is designed here from first principles but
follows industry-standard practice (hash-at-rest, single-display-at-issuance) rather than a novel scheme.

**RECOMMENDED V1 DEPLOYMENT:** same Next.js/Vercel application (§25).

**RECOMMENDED V1 AUTH:** opaque API keys, hashed at rest (§7/§8).

**RECOMMENDED RATE-LIMIT ARCHITECTURE:** Supabase-counter pattern modeled on `lib/anonGate.ts`, fail-closed
instead of that file's fail-open default (§10).

**RECOMMENDED CORPUS-ONLY ENFORCEMENT:** a dedicated wrapper function
(`getPropertyIntelligenceCorpusOnly()`) whose narrow implementation is itself the runtime security
boundary — it is the Gateway's sole permitted call target, and contains nothing but the one already-audited
safe call. An automated import-boundary test adds defense against future drift by failing the build if the
Gateway ever imports a live-provider module directly, but is not a substitute for that runtime enforcement
(§13).

**RECOMMENDED OUTPUT-SHAPING APPROACH:** allowlist construction (never serialize-then-redact) plus
independent zod schema validation as a second line of defense, fail-closed on any validation failure
(§14/§15).

**RECOMMENDED GLOBAL KILL SWITCH:** a Supabase-backed config row, checked before any other Gateway logic,
independently flippable from the admin UI with no redeploy required (§19).

**READY TO IMPLEMENT GATEWAY V1: YES**, on the architecture as specified — with these caveats, not treated
as silent gaps: the open questions in §29 should get real answers (not necessarily before Phase A begins,
but before Phase C/D where credentials and quotas become load-bearing); and per the standing governance
decision, implementation may proceed in parallel with, not blocked by, the Legal/IP review.

**LEGAL/IP REVIEW STATUS: REQUIRED — PARALLEL — NOT COMPLETED.**
