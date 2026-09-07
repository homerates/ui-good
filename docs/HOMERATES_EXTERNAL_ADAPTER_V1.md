# HomeRates External Property Intelligence Adapter V1

**Status: Phase G, private pilot only.** Not publicly submitted, not publicly announced. This document
records the transport decision (required before implementation, per the Phase G instruction) and the
adapter's full shape for review.

**LEGAL/IP REVIEW: REQUIRED — PARALLEL — NOT COMPLETED.** See `docs/MCP_Legal_IP_Checkpoint_Brief.md`. This
status does not block a private, narrowly-scoped pilot, but no broader exposure should occur while it
remains open.

---

## 1. Purpose

Prove the first external invocation path for HomeRates Property Intelligence: "Get HomeRates.ai
intelligence for a specific residential property address." One capability, read-only, no proprietary
machinery exposed. This is not public launch — it is a controlled, private test of whether an external AI
platform can invoke the existing Gateway safely and usefully.

## 2. Call flow

```
External AI platform (ChatGPT/Claude/other MCP-compatible host)
  -> HTTP POST /api/mcp/property-intelligence  (JSON-RPC 2.0, Authorization: Bearer <partner key>)
  -> app/api/mcp/property-intelligence/route.ts   (protocol envelope only -- no business logic)
  -> lib/gateway/intelligenceGateway.ts  getPropertyIntelligence()   (UNCHANGED, Phase A-F)
       -> auth -> scope -> rate limit/quota -> kill switch/circuit -> address validation
       -> lib/gateway/corpusOnlyIntelligence.ts -> lib/propertyIntelligence.ts (UNCHANGED)
       -> lib/gateway/outputShaping.ts -> Contract V1 schema validation
       -> lib/gateway/requestLog.ts (best-effort logging, UNCHANGED)
  <- GatewayResult
  <- JSON-RPC tool result (content + isError, or content + structured Contract V1 text)
```

The adapter route is a translation layer only. Every actual decision (is this caller allowed, is this data
safe to return, did the call succeed) is made by the Gateway, exactly as architecture doc §20 requires of
any platform adapter. The route contains no auth logic of its own beyond extracting a header value, no
rate-limit logic, no output-shaping logic, and no reference to `lib/propertyIntelligence.ts` or any live
provider — confirmed by `scripts/check-gateway-import-boundary.mjs`, which this route's directory is
outside of but which continues to prove `lib/gateway/` itself has not grown a second, adapter-specific path
around the corpus-only wrapper.

## 3. Transport chosen, and why

**Chosen: a minimal, hand-written JSON-RPC 2.0 HTTP handler implementing exactly the four MCP methods a
single stateless, read-only, non-streaming tool needs** (`initialize`, `notifications/initialized`,
`tools/list`, `tools/call`) — not the official `@modelcontextprotocol/server` TypeScript SDK.

**Why not the official SDK, given it was the initial preference:** the SDK's current stable line
(`@modelcontextprotocol/server@2.0.0`, implementing the 2026-07-28 MCP spec revision) declares a hard peer
dependency on `zod@^4.2.0` (confirmed directly via `npm view @modelcontextprotocol/server peerDependencies`,
not assumed). This repository pins `zod@3.23.8` throughout, including in the Gateway's own
`lib/gateway/outputSchema.ts`. Installing the SDK would require either upgrading the whole repository's zod
major version as a side effect of building one private-pilot adapter (a real, repo-wide change with its own
breaking-change audit, entirely disproportionate to this phase's scope), or running two incompatible zod
major versions side by side purely to satisfy an *optional* SDK convenience feature (`inputSchema`/
`outputSchema` validation) that a single `{address: string}` input does not remotely need. Per this phase's
own instruction — "Do NOT force MCP into the production architecture if a simpler thin adapter is required
first to prove the Gateway boundary" — a hand-written implementation of the protocol's stable, foundational
surface (JSON-RPC envelope; the `initialize` handshake shape; the `tools/list` shape; the `content`/
`isError` tool-result shape) avoids the dependency conflict entirely, is small enough to fully audit in one
file, and keeps 100% of intelligence/business logic in the existing, unmodified Gateway rather than
introducing a second schema-validation layer that could drift from Contract V1 over time.

**What this means concretely:** no new npm dependency was added. `tools/list`'s declared input schema is a
plain, hand-written JSON Schema object (not a Zod schema) — JSON Schema is what the MCP protocol itself
requires tools to declare (a wire-format requirement, independent of any particular SDK), so this is not a
reduced-fidelity substitute, just a directly-authored one.

**MCP is transport, not the security boundary, not the intelligence layer, not the IP boundary** — per this
phase's own framing. All of those remain exactly where Phases A-F put them: `lib/gateway/`.

**Mode: stateless, POST-only.** No session ID, no Server-Sent Events stream, no server-initiated push
messages — the tool is a single synchronous request/response read, so the simplest valid MCP HTTP profile
(POST-only, no GET/SSE) is sufficient. A client attempting GET on this route receives Next.js's default 405,
which is expected and correct for a route that never needs to open a server push stream.

**protocolVersion negotiation:** the handler echoes back whatever `protocolVersion` string the calling
client sends in its `initialize` request, rather than hardcoding one specific MCP spec revision. Given this
server's capabilities are minimal (one tool, no resources, no prompts, no sampling, no elicitation) and have
no version-specific behavioral differences to negotiate, this is a pragmatic choice for a private pilot
against real, possibly-varying client implementations — not a claim of full spec conformance testing across
every protocol revision.

## 4. Authentication

**Reuses the existing Phase C partner credential model unchanged. No second credential system.** The
adapter extracts `Authorization: Bearer <key>` from the incoming HTTP request and passes the raw string
straight through as `apiKeyHeader` to `getPropertyIntelligence()` — byte-for-byte the same parameter Phase
C-F already validated end-to-end. The adapter itself performs no independent credential lookup, no
signature check, no scope check — it does not know what a valid key looks like; only
`lib/gateway/auth.ts`'s `authenticateRequest()` (called inside the Gateway) does.

**Only `tools/call` is auth-gated** (via the Gateway call it makes). `initialize` and `tools/list` respond
with static protocol/tool metadata — no property data, no proprietary information, nothing beyond "a server
exists here and offers one read-only property-intelligence tool" — and are answered without a credential
check, matching how MCP clients commonly perform capability discovery before a user has necessarily supplied
a credential in every session. This does not weaken anything: the only method that can return HomeRates data
is `tools/call`, and that method's entire security posture is the unmodified Gateway's, including auth,
scope, rate limits, quotas, kill switch, and circuit breaker — all enforced with zero new code, because the
adapter calls the real `getPropertyIntelligence()` function unchanged.

**Required scope:** `property_intelligence:read` — enforced inside the Gateway exactly as before, not
re-implemented here.

**No OAuth, no anonymous invocation.** A private pilot's MCP host (ChatGPT developer mode, Claude, or a
direct test harness) is configured with a static bearer credential applied to every request to this server,
identical in shape to how any other server-to-server Gateway partner credential is used today.

## 5. Server-to-server secret handling

The partner credential is read only from the `Authorization` HTTP header, never from a query string, never
from the JSON-RPC request body. It is never written to any log (the Gateway's own `requestLog.ts`,
unchanged, never persists it), never echoed into any tool result or error message, and never referenced in
this route's source beyond the single line that reads the header and hands it to `getPropertyIntelligence()`.
There is no client-bundle exposure risk at all — this route runs exclusively server-side (`runtime =
'nodejs'`) and is never imported by, or reachable from, any browser-executed code.

## 6. Supported capability

**One tool. No others added, none planned to be added in this phase.**

- **Name:** `get_property_intelligence`
- **Description** (used by a calling model to decide when to invoke):
  > Use this tool when a user asks about a specific residential property and would benefit from current
  > HomeRates.ai intelligence about the property's value context, financing context, ownership costs,
  > market/location context, or property-centered decision drivers. Do not use it for generic mortgage
  > education or general housing questions that do not involve a specific property. This tool does not
  > provide underwriting approval, a mortgage offer, an appraisal, a guaranteed market value, or financial
  > advice — all figures are educational estimates for one specific address.
- **Input:** `{ "address": string }` — a free-text US postal address. No other fields accepted or read.
- **Output:** the existing Contract V1 response (`ExternalPropertyIntelligenceV1`, unchanged), embedded as
  JSON text inside the MCP tool result's `content` field. No second, adapter-specific intelligence schema
  was invented — this is the exact object `getPropertyIntelligence()` already returns from Phase A-F,
  serialized, not reshaped.

## 7. Error behavior

The Gateway's existing error taxonomy is preserved and mapped 1:1 into MCP's `isError: true` tool-result
convention (a normal JSON-RPC *success* envelope whose payload signals a tool-level failure — per the MCP
convention that business/validation failures are ordinary tool results, not transport-level JSON-RPC errors):

| Gateway result | MCP tool result |
|---|---|
| `ok: true` (`AVAILABLE`/`PARTIAL`/`NOT_AVAILABLE`) | `{content: [...Contract V1 JSON...], isError: false}` |
| `ok: false, error: SERVICE_DISABLED \| UNAUTHORIZED \| FORBIDDEN \| RATE_LIMITED \| INVALID_REQUEST \| INTERNAL_ERROR` | `{content: [{type:'text', text:'<code>: <message>'}], isError: true}` |

No new error code was invented. `SERVICE_DISABLED`/`UNAUTHORIZED`/`FORBIDDEN`/`RATE_LIMITED`/
`INVALID_REQUEST`/`INTERNAL_ERROR` are exactly the six values `lib/gateway/intelligenceGateway.ts` has
returned since Phase D. True JSON-RPC protocol-level errors (`error` field, not `isError`) are reserved for
actual transport/protocol failures the Gateway never sees: a malformed JSON-RPC envelope, an unknown method
name, or a `tools/call` naming a tool other than `get_property_intelligence`.

## 8. Privacy boundary

Identical to the Gateway's own, because nothing new is introduced here: no L1-L4, no Track5 internals, no
`methodologyVersion`, no raw provenance pipeline names, no borrower/Discover/Personal Fit data, no internal
database identifiers — all already excluded by `lib/gateway/outputShaping.ts`, unchanged. The adapter adds
no new field, no new derived value, no new leakage surface of its own.

## 9. IP boundary

Same as above — the adapter never touches Track 5, Autonomous DSC, the AI prompt library, or the anonymous
messaging system (the four locked trade secrets). It has no code path to any of them.

## 10. Cost boundary

The adapter cannot reach a live/paid provider under any input, because its only path into intelligence data
is the unmodified `getPropertyIntelligence()` → `getPropertyIntelligenceCorpusOnly()` →
`getPropertyIntelligenceData()` chain, already structurally proven (Phase A, re-proven every phase since) to
touch only `properties`, `property_snapshots`, `grok_property_cache`, and `featured_properties`, plus one
free/cached FRED-market-rate lookup. `NOT_AVAILABLE` remains a valid, expected outcome for an address with no
existing corpus match — the adapter never "helpfully" triggers enrichment to fill a gap.

## 11. Limitations

- Private pilot only — no Plugin Directory submission, no public announcement, no self-service credential
  issuance, no billing, no consumer account linking.
- No OAuth — a private pilot's static bearer-key configuration is sufficient and was not technically
  required to be replaced.
- `initialize`/`tools/list` are unauthenticated by design (see §4) — acceptable because they return zero
  business data, but noted here as an explicit, reviewable choice rather than an oversight.
- No resources, no prompts, no sampling, no elicitation, no streaming — only the one synchronous tool.
- Legal/IP review of the underlying Contract V1 and Gateway design remains open (see
  `docs/MCP_Legal_IP_Checkpoint_Brief.md`); this adapter does not change that status either direction.

## 12. Future platform reuse

Because the adapter contains no HomeRates-specific business logic — it is a thin JSON-RPC envelope around
one unmodified Gateway call — a future Claude, Grok, or Copilot adapter (or a second MCP deployment with
different transport settings) can be built the same way: extract a bearer credential, call
`getPropertyIntelligence()`, map the result into whatever shape that platform's own protocol expects. No
platform gets a shortcut around the Gateway; none of them require a second intelligence-logic
implementation.
