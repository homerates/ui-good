// app/api/mcp/property-intelligence/route.ts
//
// HomeRates Intelligence Gateway V1, Phase G — the FIRST external invocation
// route this codebase has ever had. Read this file's own header before
// touching it: it is deliberately a thin JSON-RPC 2.0 / MCP protocol
// envelope around ONE unmodified Gateway call. It contains no auth logic,
// no rate-limit logic, no output-shaping logic, and no reference to
// lib/propertyIntelligence.ts or any live provider. Every real decision is
// made by lib/gateway/intelligenceGateway.ts's getPropertyIntelligence(),
// completely unchanged since Phase A-F.
//
// TRANSPORT -- see docs/HOMERATES_EXTERNAL_ADAPTER_V1.md section 3 for the
// full reasoning. Summary: the official @modelcontextprotocol/server v2 SDK
// requires zod@^4.2.0 as a peer dependency; this repo pins zod@3.23.8
// throughout (including lib/gateway/outputSchema.ts). Rather than force a
// repo-wide zod major-version upgrade -- or run two incompatible zod majors
// side by side -- purely to satisfy an OPTIONAL SDK convenience feature that
// a single {address: string} input doesn't need, this route hand-implements
// the MCP wire protocol directly. No new npm dependency was added.
//
// PROTOCOL REVISION -- 2026-07-28 was verified directly against the
// authoritative spec (modelcontextprotocol.io/specification/2026-07-28) as
// the current documented revision during Phase G research, and that page
// does describe a fully stateless model where every request carries its
// own protocol version and client capabilities in the JSON-RPC body's
// `_meta` object, mirrored into three HTTP headers (MCP-Protocol-Version,
// Mcp-Method, Mcp-Name). RELAXED 2026-09-08 against real, direct production
// evidence: ChatGPT's actual MCP client (`openai-mcp/1.0.0`) sends protocol
// version 2025-11-25, only the MCP-Protocol-Version header (no Mcp-Method,
// no Mcp-Name), and NO `_meta` object in the body at all -- confirmed via
// temporary diagnostic logging on a real rejected tools/list call, not
// speculation. Whatever the spec page says, no real client sends that
// shape yet, so this adapter now validates leniently: Mcp-Method/Mcp-Name/
// `_meta` are accepted and checked for header/body agreement WHEN present,
// never required; protocol version is read from either the header or
// `_meta` (whichever exists) and checked against a supported-versions list
// that now includes both revisions. There is no `server/discover` method
// in the real spec -- verified across the base protocol, transports, and
// Streamable HTTP pages, none of which mention it. Tool discovery is (and
// remains) `tools/list`.
//
// LEGACY HANDSHAKE -- kept as a narrow, clearly-isolated fallback, not the
// primary flow. Real-world MCP client behavior as of this session could not
// be confirmed either way from first-party OpenAI documentation (the Apps
// SDK help-center article returned 403 to an automated fetch during
// research); OpenAI's own Agents SDK depends on a Python `mcp` package range
// spanning both the legacy and current major versions, implying real
// clients may still speak either era. Per the spec's own documented
// backward-compatibility model (a modern-aware client tries a modern
// request first and only falls back to `initialize` on an unrecognized
// failure shape), keeping this tiny, harmless shim costs nothing and
// protects a private pilot against exactly that uncertainty -- it is
// checked for and handled BEFORE any modern-only validation runs, so a
// legacy client (which would send neither MCP-Protocol-Version nor
// Mcp-Method) is never incorrectly rejected for missing headers it was
// never supposed to send.
//
// AUTH -- reuses the existing Phase C partner credential model unchanged.
// This route extracts `Authorization: Bearer <key>` and passes the raw
// string straight through to getPropertyIntelligence() as apiKeyHeader --
// byte-for-byte the same parameter Phase C-F already validated end-to-end.
// This file does not know what a valid key looks like; only
// lib/gateway/auth.ts's authenticateRequest() (called inside the Gateway)
// does. Only tools/call is auth-gated (via that Gateway call); initialize
// and tools/list answer with static protocol/tool metadata only -- zero
// property data, zero proprietary information -- so no credential check
// gates them.
//
// NO SESSIONS -- no Mcp-Session-Id is ever minted, read, or expected,
// matching this revision's removal of protocol-level sessions.
//
// NO CORS HEADERS -- deliberate. This route is for server-to-server
// invocation by an AI platform's own backend, never a browser.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveExternalPropertyIntelligence } from '../../../../lib/externalPropertyResolution';
import { getBenchmarkRatesGated } from '../../../../lib/gateway/benchmarkRatesGateway';
import { getLoanLimitIntelligenceGated } from '../../../../lib/gateway/loanLimitGateway';
import { getScenarioIntelligenceGated } from '../../../../lib/gateway/scenarioIntelligenceGateway';

// "Invocable-by-Design Contract Foundation" (2026-09-10): canonical external
// tool name, per the locked 5-intent naming architecture
// (homerates_property_intelligence / homerates_rate_oracle /
// homerates_scenario_intelligence / homerates_loan_limit_intelligence /
// homerates_buyer_capacity_intelligence -- only the first two are built/
// exposed; the other three remain unexposed until each independently passes
// its own readiness check). LEGACY_TOOL_NAME keeps the original name callable
// in tools/call (never advertised in tools/list) so an already-connected
// caller is not silently broken by the rename -- "adapt carefully rather
// than break," per this workstream's own instruction.
const TOOL_NAME = 'homerates_property_intelligence';
const LEGACY_TOOL_NAME = 'get_property_intelligence';
// Both revisions accepted -- 2025-11-25 is what real production clients
// (ChatGPT's openai-mcp/1.0.0) actually send for tools/list today; the
// SAME client also sends a fully modern 2026-07-28 server/discover request
// (confirmed live 2026-09-08) -- both are genuinely real traffic, not
// speculative. See validateModernRequest()'s header comment for exactly
// which validation applies to which.
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2026-07-28'];
const LEGACY_LENIENT_PROTOCOL_VERSION = '2025-11-25';
const SERVER_INFO = { name: 'homerates-property-intelligence', version: '1.0.0' };

// Response Semantics Cleanup (2026-09-08): the claim-discipline paragraph
// below was added after a live response over-interpreted this tool's own
// correctly-labeled data -- describing an unconfirmed HOA as evidence the
// payment "will be higher," and presenting a routine due-diligence
// recommendation as if a specific project defect had been found.
//
// Demand-Triggered Intelligence (2026-09-09): financing_intelligence can now
// populate using a property's current asking price alone, with no separate
// valuation on file (see purchase_price_basis). The added sentence below is
// structural defense-in-depth on top of that field's own claim_type -- the
// point is the same one this whole paragraph exists for: never let a model
// read a populated block as more certainty than the labels actually claim.
//
// ChatGPT Invocation Behavior refactor (2026-09-10, North Star Workstream 7):
// rewritten after real production ChatGPT sessions were manually observed
// (not simulated) against 4 real prompts. Invocation territory, claim
// discipline for null/asking-price/HOA, and due-diligence framing were all
// already working correctly (kept, only tightened) -- three real, evidenced
// gaps were fixed:
//   1. Given a property still enriching, ChatGPT correctly recognized that
//      state but never offered to check again -- added an explicit
//      instruction to offer a follow-up, without implying guaranteed timing
//      or making the user wait.
//   2. Given a populated deep_intelligence, ChatGPT surfaced the correct
//      property-specific link but reduced its own generated
//      capability_summary to "view the property report," losing the actual
//      content description -- added an explicit instruction to relay what
//      capability_summary says, not genericize it.
//   3. Given real comparable sales but a null AVM, ChatGPT stated (correctly)
//      that no usable AVM existed, then independently invented a specific
//      "$840,000-$880,000 market-supported zone" HomeRates never returned --
//      traced and confirmed this number was ChatGPT's own synthesis over the
//      comps HomeRates DID supply (their average), not a HomeRates field;
//      added an explicit guardrail against stating a specific valuation
//      figure or range as a conclusion unless HomeRates itself returned it.
const TOOL_DESCRIPTION =
  'Use this tool when a user asks about a specific residential property -- a direct ' +
  'request to analyze it, a financing or monthly-cost question, an asking-price or ' +
  'market question, or an open-ended "tell me about [address]" -- and would benefit ' +
  "from current HomeRates.ai intelligence about the property's value context, financing, " +
  'ownership costs, market/location context, or comparable sales. Do not use it for ' +
  'generic mortgage education or housing questions with no specific property involved. ' +
  'This tool provides educational estimates for one specific address only -- never ' +
  'underwriting approval, a mortgage offer, an appraisal, or a guaranteed market value. ' +
  'Every value carries a claim_type: PROPERTY FACT, MARKET FACT, ILLUSTRATIVE ASSUMPTION, ' +
  'DERIVED CALCULATION, ESTIMATE, or AI INTERPRETATION. A null value means unconfirmed -- ' +
  'never zero, negative, or unfavorable; never state or imply what an unconfirmed value ' +
  'would turn out to be. ILLUSTRATIVE ASSUMPTION fields (down payment, loan term, ' +
  'occupancy) describe a generic scenario, not this specific buyer -- this tool never ' +
  'collects or uses a credit score for its market_rate or payment figures. ' +
  'financing_intelligence.purchase_price_basis discloses whether the financing math used ' +
  'a real HomeRates valuation (AVM) or the current asking price as an illustrative ' +
  'assumption (CURRENT_ASKING_PRICE) -- when it is the asking price, never call that ' +
  "figure HomeRates' estimate of value; value_intelligence.avm is the only field where a " +
  'real valuation appears, and it may be null even when financing figures are present.' +
  '\n\n' +
  'Comparable sales and any AVM are factual reference points, not a computed opinion of ' +
  'value for you to extend. You may describe how the asking price relates to them (e.g. ' +
  '"above the comparable median" or "within the range of recent sales"), but never state ' +
  'a specific dollar figure or range as a fair-value conclusion -- "$X-$Y is the ' +
  'supported range," "worth approximately $X" -- unless HomeRates itself returned that ' +
  'figure in value_intelligence.avm. If avm is null, say plainly that no usable automated ' +
  "valuation exists; do not fill that gap with your own estimate presented as HomeRates' " +
  'data. Do not assert unstated reasons (condition, upgrades, position) explain any ' +
  'difference between comparables and the list price -- present those only as factors a ' +
  'buyer should verify. When ownership_cost_intelligence.hoa is null, present it only as ' +
  'an open question, never as a reason payments will be higher. Standard due-diligence ' +
  'items (HOA, master insurance, reserves, assessments, litigation, condo project ' +
  'eligibility) are routine recommended checks, never findings that a specific problem ' +
  'exists.' +
  '\n\n' +
  'property_analysis (when present) is HomeRates\' own synthesis, over publicly available ' +
  'information, about this property -- market positioning and notable characteristics, in ' +
  'HomeRates\' own words, not a valuation conclusion and not a claim that HomeRates ' +
  'directly observed every detail itself. You may relay or summarize it. If it happens to ' +
  'mention a dollar figure, treat that figure with the same discipline as any other claim ' +
  "in this tool's response -- it is not automatically a HomeRates value estimate merely " +
  'because it appears in HomeRates-sourced text; do not repeat it as a supported valuation ' +
  'unless value_intelligence.avm independently confirms it. property_analysis is null when ' +
  'HomeRates has not yet synthesized this for the property (its sources had not yet been ' +
  'researched at the time of this response) -- absence is not a negative signal about the ' +
  'property itself, and calling again later may return it.' +
  '\n\n' +
  'intelligence_progress.status is "enriching" while comparable sales and location ' +
  'context are still being gathered, or "enriched" once they are present (if available ' +
  'at all). When "enriching": share the useful intelligence already available now, note ' +
  'briefly that HomeRates is still assembling deeper market and location intelligence, ' +
  'and offer to check again shortly for more -- do not present the answer as final, do ' +
  'not make the user wait, and do not imply a guaranteed completion time. When ' +
  '"enriched" (follow_up_recommended false), do not suggest more intelligence is still ' +
  'coming.' +
  '\n\n' +
  'deep_intelligence.destination is a property-specific HomeRates page -- never describe ' +
  'it generically ("view the property report"). Relay what ' +
  'deep_intelligence.capability_summary actually says is there, so the user understands ' +
  "what's genuinely deeper there versus what you've already shared, and can decide " +
  'whether to open it.';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    address: {
      type: 'string',
      description: 'A US postal address for a residential property, e.g. "123 Main St, Anytown, CA 90001".',
    },
  },
  required: ['address'],
  additionalProperties: false,
} as const;

// North Star Workstream 10 (2026-09-10) -- second tool on this same MCP
// server. Deliberately address-independent and borrower-independent: it
// answers "what's a current mortgage rate benchmark," not "what rate would
// THIS buyer get" -- that second question is Rate Intelligence's own
// OBMMI/LLPA-segmented territory, never exposed externally (see
// lib/market-data/benchmarkRates.ts's header for the full boundary).
const BENCHMARK_RATES_TOOL_NAME = 'homerates_rate_oracle';
const LEGACY_BENCHMARK_RATES_TOOL_NAME = 'get_benchmark_rates';
const BENCHMARK_RATES_TOOL_DESCRIPTION =
  'Use this tool when the user asks for a current mortgage rate, benchmark, or reference ' +
  'rate -- "what are mortgage rates today," "what\'s a typical 30-year rate right now," or ' +
  'a mortgage-related calculation that depends on a current market rate -- and no specific ' +
  'property or borrower scenario is involved. Do not rely on model memory for a current ' +
  'rate value when this tool is available; training data is never current for a rate that ' +
  'moves weekly. Returns three neutral, national reference rates (30-year fixed, 15-year ' +
  'fixed, 5/1 ARM), each sourced from Federal Reserve Economic Data (FRED) -- these are ' +
  'published national averages, not a quote or offer to any individual borrower, and do ' +
  'not reflect any specific credit score, down payment, or loan program. Each rate carries ' +
  'its own as_of date (the date of the underlying data point, not when this tool was ' +
  'called) and freshness_status: CURRENT (recently published), STALE (older than expected ' +
  'for this weekly series -- treat with more caution but it is still the most recent value ' +
  'HomeRates has), or UNAVAILABLE (no data on file -- value is null; never treat null as ' +
  'zero or invent a figure). Always state the as_of date when citing a rate, and note that ' +
  "these are national averages, not a specific quote -- an individual borrower's actual " +
  'rate depends on their credit, down payment, and loan program, which this tool does not ' +
  'ask for. This tool does not accept any input.';
const BENCHMARK_RATES_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

// Invocable Tool Workstream (2026-09-11) -- third tool on this same MCP
// server, the locked architecture's homerates_loan_limit_intelligence.
// Address-independent (ZIP or county+state, never a full street address):
// answers "what's the loan limit here," never "what can this borrower
// afford" (that is Buyer Capacity Intelligence's territory, not yet
// exposed) or "should they go Conventional or Jumbo" (a recommendation,
// which this tool deliberately never makes).
const LOAN_LIMIT_TOOL_NAME = 'homerates_loan_limit_intelligence';
const LOAN_LIMIT_TOOL_DESCRIPTION =
  'Use this tool when the user asks about conforming, high-balance, FHA, or jumbo loan ' +
  'limits for a location -- "what\'s the loan limit in [ZIP/county]," "is this county high-' +
  'balance," "does a $X loan exceed the conforming limit here," or "what\'s the FHA limit ' +
  'for this county." Provide EITHER zip, OR both county and state -- do not guess or infer ' +
  'a county from a city name yourself when a ZIP is available; pass the ZIP and let this ' +
  'tool resolve it. units (1-4, default 1) selects the limit for a 1-4 unit property. year ' +
  'defaults to the current data year (2026) -- HomeRates has real loan-limit data for that ' +
  'year only; requesting any other year returns every limit/classification field as ' +
  'UNAVAILABLE rather than a wrong or stale number. loan_amount is optional -- supply it to ' +
  'get a classification; omit it to get limits only. program (conventional/fha/both, ' +
  'default both) scopes which classification(s) are computed -- the raw limit figures ' +
  '(national_baseline_limit, county_conforming_limit, fha_county_limit) are always returned ' +
  'regardless of program.' +
  '\n\n' +
  'county_resolution.status is RESOLVED, UNRESOLVED (a ZIP was given but not found), or ' +
  'NOT_PROVIDED (no ZIP or county/state given at all). Every limit/classification field has ' +
  'its own status: AVAILABLE (a real figure), COUNTY_REQUIRED (a county is genuinely needed ' +
  'to answer and none was resolved), or UNAVAILABLE (the county resolved but HomeRates does ' +
  'not have this specific figure for it -- e.g. FHA county limits are a REAL, HONEST DATA ' +
  'GAP outside California; HomeRates does not fabricate a non-California county\'s FHA limit ' +
  'from its conforming limit, since the two are not reliably related). Never treat a null ' +
  'value or UNAVAILABLE status as zero, or as "no limit applies."' +
  '\n\n' +
  'classification.conventional and classification.fha (each CONFORMING, HIGH_BALANCE, ' +
  'ABOVE_CONFORMING_LIMIT, WITHIN_FHA_LIMIT, ABOVE_FHA_LIMIT, COUNTY_REQUIRED, or ' +
  'UNAVAILABLE, or null if loan_amount was not supplied or that program was not requested) ' +
  'are a factual classification only -- never state or imply that one classification is ' +
  '"better" than another, never recommend Conventional vs. jumbo or FHA vs. conventional, ' +
  'never state or imply loan approval, eligibility, or pricing/rate impact. Those are ' +
  'separate questions this tool does not answer.';
const LOAN_LIMIT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    zip: { type: 'string', description: 'A 5-digit US ZIP code, e.g. "93001". Provide this OR county+state, not both required.' },
    county: { type: 'string', description: 'A US county name, e.g. "Ventura" or "Los Angeles County". Requires state to also be set.' },
    state: { type: 'string', description: 'A 2-letter US state code, e.g. "CA". Required if county is set.' },
    year: { type: 'number', description: 'Loan-limit calendar year. Defaults to the current data year (2026).' },
    units: { type: 'number', enum: [1, 2, 3, 4], description: 'Number of units on the property (1-4). Defaults to 1.' },
    loan_amount: { type: 'number', description: 'Optional loan amount in dollars. When supplied, the response includes a classification.' },
    program: { type: 'string', enum: ['conventional', 'fha', 'both'], description: 'Which program\'s classification to compute. Defaults to "both".' },
  },
  additionalProperties: false,
} as const;

// Invocable Tool Workstream (2026-09-11) -- fourth tool on this same MCP
// server, homerates_scenario_intelligence. This is deal/scenario math
// ("run my numbers on this specific purchase"), not a bare payment
// calculator -- every relevant input change (price, down payment, rate,
// program, buydown) recomputes the FULL dependent chain (loan structure,
// monthly breakdown, loan-limit zone, qualification) fresh from
// lib/calcEngine.ts every call. Distinct from homerates_property_intelligence
// (which answers "tell me about this address") and
// homerates_loan_limit_intelligence (which answers "what's the limit
// here" with no payment math at all).
const SCENARIO_TOOL_NAME = 'homerates_scenario_intelligence';
const SCENARIO_TOOL_DESCRIPTION =
  'Use this tool when the user wants to "run the numbers" on a specific purchase scenario -- ' +
  'a price with a down payment, a program choice (conventional/FHA/VA/jumbo), 10% vs 20% down, ' +
  'a rate change, a buydown, or how a loan amount relates to conforming/high-balance/FHA loan ' +
  'limits. Do not use this for a generic "what mortgage rates are available" question (use ' +
  'homerates_rate_oracle) or a bare loan-limit lookup with no payment math (use ' +
  'homerates_loan_limit_intelligence). Required: price and program (conventional, fha, va, or ' +
  'jumbo). Optional: down_payment_pct OR down_payment_amount (not both; defaults to each ' +
  "program's standard minimum if omitted), term_years (default 30), rate_pct, hoa_monthly, " +
  'zip or county+state (for loan-limit-zone context), property_tax_rate_pct, ' +
  'insurance_annual, credit_score (fha only), buydown_points and funding_fee_exempt (va only), ' +
  'annual_income and monthly_debts (for a DTI qualification estimate). To compare two ' +
  'scenarios (e.g. "conventional vs FHA," "10% vs 20% down," "rate +0.5%"), call this tool ' +
  'once per scenario with the one input that differs and compare the two results -- every ' +
  'other dependent value (loan amount, LTV, PMI/MIP, PITI, loan-limit zone) is recomputed ' +
  'fresh each call, never carried over from a prior call.' +
  '\n\n' +
  'If rate_pct is omitted, this tool uses HomeRates\' own current benchmark rate (echoed in ' +
  'full in rate_benchmark, with its own as_of date and freshness_status) -- it never invents ' +
  'a rate. If that benchmark is itself UNAVAILABLE, rate_pct is null and monthly_breakdown is ' +
  'null (loan_structure -- down payment, loan amount, LTV -- is still returned; payment math ' +
  'is withheld rather than computed with a fabricated rate). Every input this tool actually ' +
  'used is echoed in inputs, each tagged with a source: USER_INPUT (you supplied it), ' +
  'CURRENT_BENCHMARK (HomeRates\' live rate was used), EXPLICIT_ASSUMPTION (a documented ' +
  'default was applied -- also listed in assumptions[] with the reason), PROPERTY_FACT ' +
  '(hoa_monthly, when supplied), or UNKNOWN/UNAVAILABLE. hoa_monthly is never defaulted to ' +
  'zero when omitted -- monthly_breakdown.hoa and pitia stay null, while piti (which never ' +
  'includes HOA) is still fully computed.' +
  '\n\n' +
  'loan_limit_zone.classification (CONFORMING, HIGH_BALANCE, ABOVE_CONFORMING_LIMIT, ' +
  'WITHIN_FHA_LIMIT, ABOVE_FHA_LIMIT, COUNTY_REQUIRED, or UNAVAILABLE) reflects where the ' +
  'CURRENT base loan amount actually sits -- recomputed from price and down payment on every ' +
  'call, never a frozen label. Crossing the conforming baseline classifies HIGH_BALANCE, not ' +
  'a jumbo recommendation; crossing the county limit classifies ABOVE_CONFORMING_LIMIT, not ' +
  'an automatic switch to the jumbo program -- this tool never recommends one program over ' +
  'another, it only classifies. property_tax_rate_pct and insurance_annual are illustrative ' +
  'national assumptions when not overridden -- no per-county tax/insurance table exists in ' +
  'HomeRates today, so geography does not currently refine these two figures (it does refine ' +
  'loan_limit_zone, which has real per-county data).';
const SCENARIO_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    price: { type: 'number', description: 'Purchase price in dollars. Required.' },
    program: { type: 'string', enum: ['conventional', 'fha', 'va', 'jumbo'], description: 'Loan program. Required.' },
    down_payment_pct: { type: 'number', description: 'Down payment as a percent (e.g. 10 for 10%). Provide this OR down_payment_amount.' },
    down_payment_amount: { type: 'number', description: 'Down payment in dollars. Provide this OR down_payment_pct.' },
    term_years: { type: 'number', description: 'Loan term in years. Defaults to 30.' },
    rate_pct: { type: 'number', description: 'Annual interest rate as a percent (e.g. 6.5). Omit to use HomeRates\' current benchmark rate.' },
    hoa_monthly: { type: 'number', description: 'Confirmed monthly HOA/association dues, if known. Omit if unknown -- never defaults to zero.' },
    zip: { type: 'string', description: 'A 5-digit US ZIP code, for loan-limit-zone context.' },
    county: { type: 'string', description: 'A US county name. Requires state to also be set.' },
    state: { type: 'string', description: 'A 2-letter US state code. Required if county is set.' },
    property_tax_rate_pct: { type: 'number', description: 'Annual property tax rate as a percent of price. Omit for the illustrative national default.' },
    insurance_annual: { type: 'number', description: 'Annual homeowners insurance in dollars. Omit for the illustrative national default.' },
    credit_score: { type: 'number', description: 'Borrower credit score. FHA program only.' },
    buydown_points: { type: 'number', description: 'Seller-credit buydown points (each lowers the rate 0.25%). VA program only.' },
    funding_fee_exempt: { type: 'boolean', description: 'True if the borrower is exempt from the VA funding fee (disability). VA program only.' },
    annual_income: { type: 'number', description: 'Optional, for a DTI qualification estimate.' },
    monthly_debts: { type: 'number', description: 'Optional, for a DTI qualification estimate.' },
  },
  required: ['price', 'program'],
  additionalProperties: false,
} as const;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown> & { _meta?: Record<string, unknown> };
}

function jsonRpcResult(id: string | number | null | undefined, result: unknown, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result }, { status });
}

function jsonRpcError(id: string | number | null | undefined, code: number, message: string, status: number, data?: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } }, { status });
}

// TEMPORARY DIAGNOSTIC (added 2026-09-08, remove once the real ChatGPT
// tools/call rejection cause is found) -- logs ONLY protocol-level
// metadata: method name, whether the request is a notification, the three
// MCP headers, and which _meta keys are present (never their values, since
// clientCapabilities is caller-defined and could in principle carry
// arbitrary caller data). Never logs Authorization, address, arguments,
// or any Gateway/credential data.
function logRejection(reason: string, req: NextRequest, body: Partial<JsonRpcRequest> | null) {
  console.log('[mcp-diagnostic]', JSON.stringify({
    reason,
    method: body?.method ?? null,
    hasId: !!(body && 'id' in body),
    headers: {
      'mcp-protocol-version': req.headers.get('mcp-protocol-version'),
      'mcp-method': req.headers.get('mcp-method'),
      'mcp-name': req.headers.get('mcp-name'),
      'content-type': req.headers.get('content-type'),
      'user-agent': req.headers.get('user-agent'),
    },
    metaKeysPresent: body?.params?._meta ? Object.keys(body.params._meta) : null,
  }));
}

function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

// requestIp is trusted transport metadata derived from proxy headers, never
// from client-supplied JSON -- the same convention lib/gateway/rateLimit.ts
// already documents for a future adapter/transport layer.
function extractRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || '0.0.0.0';
}

// Modern per-request validation, VERSION-AWARE as of 2026-09-08 against
// real production evidence from two distinct ChatGPT requests -- see the
// file header's PROTOCOL REVISION note for the full story:
//   - 2025-11-25 tools/list: only the MCP-Protocol-Version header, no
//     Mcp-Method/Mcp-Name, no `_meta` at all.
//   - 2026-07-28 server/discover: full modern shape -- MCP-Protocol-Version
//     + Mcp-Method headers, `_meta` with protocolVersion/clientInfo/
//     clientCapabilities.
// The MCP-Protocol-Version header itself is the one thing BOTH real
// requests always sent, so it stays unconditionally required regardless of
// generation -- it's what selects which branch below even runs. Real
// 2026-07-28 traffic sends the full modern shape, so that generation keeps
// STRICT validation exactly as originally designed. Real 2025-11-25
// traffic sends nothing else, so that generation is validated LENIENTLY:
// Mcp-Method/Mcp-Name/`_meta` are never required, and the JSON-RPC body's
// own `method`/`params.name` are authoritative (which the caller already
// dispatches on regardless).
// Returns an error Response to send, or null if the request is valid and
// dispatch should proceed. `requireName`: whether Mcp-Name / params.name
// agreement is required under the STRICT (2026-07-28) path -- true only
// for tools/call; server/discover and tools/list need no principal name
// (per the spec's own server/discover page, which requires no such field).
function validateModernRequest(req: NextRequest, body: JsonRpcRequest, requireName: boolean): NextResponse | null {
  const { id, method, params } = body;

  const headerProtocolVersion = req.headers.get('mcp-protocol-version');
  const headerMethod = req.headers.get('mcp-method');
  const headerName = req.headers.get('mcp-name');

  const meta = params?._meta as Record<string, unknown> | undefined;
  const bodyProtocolVersion = meta?.['io.modelcontextprotocol/protocolVersion'] as string | undefined;
  const bodyClientCapabilities = meta?.['io.modelcontextprotocol/clientCapabilities'];

  if (!headerProtocolVersion) {
    logRejection('missing MCP-Protocol-Version header', req, body);
    return jsonRpcError(id, -32020, 'Missing required header: MCP-Protocol-Version', 400);
  }
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(headerProtocolVersion)) {
    logRejection('unsupported protocol version', req, body);
    return jsonRpcError(id, -32022, `Unsupported protocol version: ${headerProtocolVersion}`, 400, { supported: SUPPORTED_PROTOCOL_VERSIONS });
  }

  // LENIENT path -- real 2025-11-25 traffic sends nothing beyond the one
  // header; body method/name are already authoritative for dispatch.
  if (headerProtocolVersion === LEGACY_LENIENT_PROTOCOL_VERSION) {
    return null;
  }

  // STRICT path (2026-07-28) -- full header/_meta validation, unchanged
  // from the original design, since real traffic at this version sends
  // the full shape.
  if (!headerMethod) {
    logRejection('missing Mcp-Method header', req, body);
    return jsonRpcError(id, -32020, 'Missing required header: Mcp-Method', 400);
  }
  if (headerMethod !== method) {
    logRejection('Mcp-Method header/body mismatch', req, body);
    return jsonRpcError(id, -32020, `Header mismatch: Mcp-Method header value '${headerMethod}' does not match body value '${method}'`, 400);
  }
  if (requireName) {
    const bodyName = params?.name;
    if (!headerName) {
      logRejection('missing Mcp-Name header', req, body);
      return jsonRpcError(id, -32020, 'Missing required header: Mcp-Name', 400);
    }
    if (headerName !== bodyName) {
      logRejection('Mcp-Name header/body mismatch', req, body);
      return jsonRpcError(id, -32020, `Header mismatch: Mcp-Name header value '${headerName}' does not match body value '${String(bodyName)}'`, 400);
    }
  }
  if (bodyProtocolVersion === undefined) {
    logRejection('missing _meta.protocolVersion', req, body);
    return jsonRpcError(id, -32602, 'Missing required _meta field: io.modelcontextprotocol/protocolVersion', 400);
  }
  if (bodyClientCapabilities === undefined) {
    logRejection('missing _meta.clientCapabilities', req, body);
    return jsonRpcError(id, -32602, 'Missing required _meta field: io.modelcontextprotocol/clientCapabilities', 400);
  }
  if (headerProtocolVersion !== null && headerProtocolVersion !== bodyProtocolVersion) {
    logRejection('MCP-Protocol-Version header/body mismatch', req, body);
    return jsonRpcError(id, -32020, `Header mismatch: MCP-Protocol-Version header value '${headerProtocolVersion}' does not match body value '${bodyProtocolVersion}'`, 400);
  }

  return null;
}

function withServerMeta(result: Record<string, unknown>) {
  return { ...result, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO } };
}

// Shared Gateway-rejection -> MCP/HTTP response mapping, used by both tools
// on this server. Phase OB -- UNAUTHORIZED/FORBIDDEN are the two Gateway
// rejections the MCP 2026-07-28 Authorization spec's "Error Handling"
// section actually governs ("Invalid or expired tokens MUST receive a HTTP
// 401 response"; insufficient scope gets 403 + a WWW-Authenticate
// challenge) -- this is what lets an OAuth-aware client (ChatGPT) detect it
// needs to authorize at all and discover where. Every OTHER Gateway
// rejection (SERVICE_DISABLED/RATE_LIMITED/INVALID_REQUEST/INTERNAL_ERROR)
// is unchanged from Phase A-G: still a plain JSON-RPC 200 isError:true
// result, since those aren't authorization errors in the spec's sense.
// `scopeForForbidden` names the scope this specific tool actually needs, so
// a 403 for get_benchmark_rates correctly advertises benchmark_rates:read
// rather than property_intelligence:read (even though either currently
// grants access -- see lib/gateway/auth.ts's requireAnyScope()).
function mapGatewayRejection(
  id: string | number | null | undefined,
  result: { error: string; message: string },
  scopeForForbidden: string,
) {
  const resourceMetadataUrl = 'https://homerates.ai/.well-known/oauth-protected-resource';
  if (result.error === 'UNAUTHORIZED') {
    return NextResponse.json(
      { error: 'invalid_token', error_description: result.message },
      { status: 401, headers: { 'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"` } },
    );
  }
  if (result.error === 'FORBIDDEN') {
    return NextResponse.json(
      { error: 'insufficient_scope', error_description: result.message, scope: scopeForForbidden },
      {
        status: 403,
        headers: {
          'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${scopeForForbidden}", resource_metadata="${resourceMetadataUrl}"`,
        },
      },
    );
  }

  // Every remaining Gateway rejection (SERVICE_DISABLED/RATE_LIMITED/
  // INVALID_REQUEST/INTERNAL_ERROR) maps uniformly -- no new business-status
  // meaning invented, unchanged from Phase G.
  return jsonRpcResult(id, withServerMeta({
    resultType: 'complete',
    content: [{ type: 'text', text: `${result.error}: ${result.message}` }],
    isError: true,
  }));
}

export async function POST(req: NextRequest) {
  // Origin validation (DNS-rebinding guard, spec "Security & Endpoint").
  // This deployment is a normal internet-facing HTTPS API (not a
  // localhost-bound dev server), and the realistic caller is a server-to-
  // server request from an AI platform's own backend, which typically
  // carries no Origin header at all -- the DNS-rebinding threat model this
  // guards against is specific to a browser-originated request reaching a
  // server bound to localhost. If an Origin header IS present, it is
  // required to at least be a well-formed origin; there is no fixed
  // allowlist for a private pilot with an as-yet-unknown caller origin.
  const origin = req.headers.get('origin');
  if (origin) {
    try { new URL(origin); } catch {
      return new NextResponse(null, { status: 403 });
    }
  }

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    logRejection('JSON parse error', req, null);
    return jsonRpcError(null, -32700, 'Parse error', 400);
  }

  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    logRejection('invalid top-level JSON-RPC shape (jsonrpc/method)', req, body);
    return jsonRpcError(body?.id, -32600, 'Invalid Request', 400);
  }

  const { id, method, params } = body;
  const isNotification = !('id' in body);

  // ---- LEGACY HANDSHAKE SHIM (see file header) -- checked first, before
  // any modern-only validation, since a legacy client sends none of the
  // modern headers/meta fields. Not the primary flow. ----
  if (method === 'notifications/initialized') {
    return new NextResponse(null, { status: 202 });
  }
  if (method === 'initialize') {
    return jsonRpcResult(id, {
      protocolVersion: (params?.protocolVersion as string | undefined) ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  // ---- MODERN PROTOCOL (2026-07-28), stateless, per-request metadata ----

  // server/discover -- confirmed as a real, MUST-implement 2026-07-28
  // method via a direct fetch of modelcontextprotocol.io/specification/
  // 2026-07-28/server/discover on 2026-09-08 (this page did not exist, or
  // was not found, during Phase G's original spec research -- the spec has
  // since been extended). Discovery only: no principal name needed (same
  // as tools/list), no Gateway/property-lookup work, no auth. Advertises
  // only the capabilities this server actually has -- `tools` alone, never
  // resources/prompts/sampling/etc. -- and the exact supported-versions
  // list this adapter really accepts.
  if (method === 'server/discover') {
    const invalid = validateModernRequest(req, body, false);
    if (invalid) return invalid;
    return jsonRpcResult(id, withServerMeta({
      resultType: 'complete',
      supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
      capabilities: { tools: {} },
    }));
  }

  if (method === 'tools/list') {
    const invalid = validateModernRequest(req, body, false);
    if (invalid) return invalid;
    return jsonRpcResult(id, withServerMeta({
      resultType: 'complete',
      tools: [
        // Read-only intelligence tools -- neither writes, mutates, deletes,
        // or performs any irreversible action; annotations advertise this
        // per the MCP tool-annotation convention. openWorldHint: false for
        // both -- each resolves a specific, bounded, well-defined entity
        // (one named property; a fixed set of 3 national reference series),
        // never an open-ended web/document search.
        { name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: INPUT_SCHEMA, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
        { name: BENCHMARK_RATES_TOOL_NAME, description: BENCHMARK_RATES_TOOL_DESCRIPTION, inputSchema: BENCHMARK_RATES_INPUT_SCHEMA, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
        { name: LOAN_LIMIT_TOOL_NAME, description: LOAN_LIMIT_TOOL_DESCRIPTION, inputSchema: LOAN_LIMIT_INPUT_SCHEMA, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
        { name: SCENARIO_TOOL_NAME, description: SCENARIO_TOOL_DESCRIPTION, inputSchema: SCENARIO_INPUT_SCHEMA, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
      ],
    }));
  }

  if (method === 'tools/call') {
    const invalid = validateModernRequest(req, body, true);
    if (invalid) return invalid;

    const toolName = params?.name;
    // Legacy names accepted here (tools/call) but never advertised in
    // tools/list -- an already-connected caller that cached the old name
    // keeps working; every new discovery sees only the canonical name.
    const isPropertyIntelligence = toolName === TOOL_NAME || toolName === LEGACY_TOOL_NAME;
    const isBenchmarkRates = toolName === BENCHMARK_RATES_TOOL_NAME || toolName === LEGACY_BENCHMARK_RATES_TOOL_NAME;
    const isLoanLimit = toolName === LOAN_LIMIT_TOOL_NAME;
    const isScenario = toolName === SCENARIO_TOOL_NAME;

    if (!isPropertyIntelligence && !isBenchmarkRates && !isLoanLimit && !isScenario) {
      return jsonRpcResult(id, withServerMeta({
        resultType: 'complete',
        content: [{ type: 'text', text: `Unknown tool: ${String(toolName)}` }],
        isError: true,
      }));
    }

    const apiKeyHeader = extractBearerToken(req);
    const requestIp = extractRequestIp(req);

    if (isBenchmarkRates) {
      const result = await getBenchmarkRatesGated(apiKeyHeader, requestIp);
      if (result.ok) {
        return jsonRpcResult(id, withServerMeta({
          resultType: 'complete',
          content: [{ type: 'text', text: JSON.stringify(result.data) }],
          isError: false,
        }));
      }
      return mapGatewayRejection(id, result, 'benchmark_rates:read');
    }

    if (isLoanLimit) {
      const loanLimitArgs = (params?.arguments ?? {}) as Record<string, unknown>;
      const result = await getLoanLimitIntelligenceGated(loanLimitArgs, apiKeyHeader, requestIp);
      if (result.ok) {
        return jsonRpcResult(id, withServerMeta({
          resultType: 'complete',
          content: [{ type: 'text', text: JSON.stringify(result.data) }],
          isError: false,
        }));
      }
      return mapGatewayRejection(id, result, 'loan_limit_intelligence:read');
    }

    if (isScenario) {
      const scenarioArgs = (params?.arguments ?? {}) as Record<string, unknown>;
      const result = await getScenarioIntelligenceGated(scenarioArgs, apiKeyHeader, requestIp);
      if (result.ok) {
        return jsonRpcResult(id, withServerMeta({
          resultType: 'complete',
          content: [{ type: 'text', text: JSON.stringify(result.data) }],
          isError: false,
        }));
      }
      return mapGatewayRejection(id, result, 'scenario_intelligence:read');
    }

    // No address validation here -- passed straight through unchanged.
    // getPropertyIntelligence() already validates length/emptiness itself
    // (INVALID_REQUEST) and this route must not reimplement business
    // validation the Gateway already owns.
    const args = params?.arguments as { address?: unknown } | undefined;
    const address = typeof args?.address === 'string' ? args.address : '';

    // resolveExternalPropertyIntelligence() (lib/externalPropertyResolution.ts,
    // 2026-09-08) calls the UNCHANGED getPropertyIntelligence() Gateway
    // pipeline first -- same auth/scope/rate-limit/kill-switch/validation --
    // and only on a NOT_AVAILABLE result additionally attempts one
    // demand-driven resolution via the existing first-party lookup pipeline.
    // Same GatewayResult shape either way; nothing below this line changes.
    const result = await resolveExternalPropertyIntelligence({ address }, apiKeyHeader, requestIp);

    if (result.ok) {
      return jsonRpcResult(id, withServerMeta({
        resultType: 'complete',
        content: [{ type: 'text', text: JSON.stringify(result.data) }],
        isError: false,
      }));
    }
    return mapGatewayRejection(id, result, 'property_intelligence:read');
  }

  // Unknown method -- per spec, HTTP 404 (not 200) + JSON-RPC -32601. A
  // notification naming an unknown method still gets no body (202) per
  // JSON-RPC notification semantics, checked first.
  if (isNotification) return new NextResponse(null, { status: 202 });
  logRejection('unknown method', req, body);
  return jsonRpcError(id, -32601, `Method not found: ${method}`, 404);
}
