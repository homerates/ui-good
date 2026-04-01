# HomeRates.ai — Technical Overview
**Last updated: April 1, 2026**

---

## 1. Architecture Summary

HomeRates.ai is a Next.js 15 App Router application deployed on Vercel. It combines a local deterministic mortgage calc engine with a large language model (Grok/xAI) for open-ended questions. The routing philosophy is **calc-first**: every question that can be answered mathematically is answered locally — the LLM is only invoked for questions the calc engine cannot handle.

```
User Question
     │
     ▼
app/api/answers/route.ts
     │
     ├── UW bypass guard (isUnderwritingGuidelineQuestion — Grok w/ database)
     │        └── Guard: !isLoanLimitsQuestion → loan limits never UW-routed
     │
     ├── lib/calcDispatcher.ts ──► lib/calcEngine.ts ──► lib/cardBuilders.ts
     │        │
     │        ▼
     │   BuiltCard (slider data, chips, markdown, memoryPayload)
     │
     └── Fallthrough ──► Grok (xAI) for open-ended questions
```

---

## 2. Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.5.7 (App Router + Pages Router hybrid) |
| Language | TypeScript 5 |
| Auth | Clerk |
| Database | Supabase (PostgreSQL, custom domain db.homerates.ai) |
| AI / LLM | Grok (xAI) for open-ended; calc engine for everything else |
| Data | FRED API (live mortgage rates, economic indicators) |
| Property data | Rentcast API (AVM, listings, property details) |
| Web extraction | Tavily API (Realtor.com/Trulia fallback + CMA market data) |
| Email | Resend (digest@homerates.ai — digest + LO notifications) |
| Payments | Stripe (Free/Plus/Pro subscriptions) |
| PDF generation | @react-pdf/renderer 4.3.2 |
| Deployment | Vercel (serverless + cron jobs) |
| React | 18.3.1 |

---

## 3. Calc Engine

### CalcTypes
```typescript
type CalcType =
  | 'conventional' | 'fha' | 'fha_vs_conv'
  | 'refi' | 'refi_20vs30' | 'refi_early_sale'
  | 'extra_payment' | 'one_extra_payment_per_year'
  | 'dscr' | 'va' | 'jumbo'
  | 'affordability' | 'income_check'
  | 'loan_limits'                          // ← CA 2026 explorer (added Mar 27)
  | 'fha_equity_timeline' | 'mip_duration_knowledge'
  | 'lab' | 'uw_starter' | 'about' | 'how_it_works'
  | 'conventional_needs_input' | 'fha_needs_input' | 'refi_needs_input'
  | 'dscr_needs_input' | 'va_needs_input' | 'jumbo_needs_input'
  | 'affordability_needs_input' | 'no_calc_match'
```

### Dispatch order (lib/calcDispatcher.ts)
Guards execute in this order — first match wins:
1. Lab / HowItWorks / UW Starter / About
2. Follow-up guard (context-aware re-run)
3. Refi (highest priority — before affordability/conventional)
4. FHA vs Conventional comparison
5. **FHA** — guard: `isFHAQuestion(q) && !isLoanLimitsQuestion(q)` ← critical
6. DSCR / Investment
7. VA
8. **Loan Limits** — CA 2026 explorer
9. Jumbo
10. Conventional
11. Affordability
12. Fallthrough → Grok

### Key files
- `lib/calcEngine.ts` — pure math functions, no side effects; default closing costs = 1% of balance
- `lib/calcDispatcher.ts` — routes question text to the correct CalcType
- `lib/cardBuilders.ts` — formats CalcEngine output into BuiltCard (markdown, chips, slider seeds)
- `lib/loanLimits2026.ts` — all 58 CA counties, 2026 FHFA + HUD per-county data, ZIP→county map

### Insurance rate default (updated April 2026)
All calc functions default to **0.3%/yr of purchase price** for homeowner's insurance when no explicit value is passed. Constant `INS_RATE_DEFAULT = 0.003` in `calcEngine.ts`. Applies to: `calcConventional`, `calcFHA`, `calcDSCR`, `calcVA`, `calcJumbo`, and the affordability engine. Example: $500k home → $1,500/yr → $125/month.

---

## 4. 2026 Loan Limits

| Type | 1-Unit | Source |
|---|---|---|
| FHFA Conforming (standard) | **$832,750** | FHFA 2026 |
| FHFA High-Balance (CA high-cost) | **$1,249,125** | FHFA 2026 |
| FHA Floor | **$541,287** | HUD No. 25-145 |
| FHA Ceiling | **$1,249,125** | HUD No. 25-145 |

Rate premiums applied in slider:
- Conforming: base FRED rate
- High-balance: base + 0.30%
- Jumbo: base + 0.50%

---

## 5. Interactive Slider Cards (all 5 live)

After every calc answer, the system renders an interactive slider card. All gated on `typingId === null` — hidden during typewriter animation, mount only after text lands.

| Card | Trigger field | Key sliders |
|---|---|---|
| `InteractiveSliderCard` | `m.meta.interactiveSlider` | Price, down %, rate, term, tax/ins |
| `AffordabilitySliderCard` | `m.meta.affordabilitySlider` | Income, debts, savings, down %, rate |
| `DSCRSliderCard` | `m.meta.dscrSlider` | Price, rent, down %, rate, vacancy, mgmt |
| `RefiSliderCard` | `m.meta.refiSlider` | Balance, LTV, current rate, new rate, closing costs, term |
| `LoanLimitsSliderCard` | `m.meta.loanLimitsSlider` | Price, down % — live zone: conforming/HB/jumbo |

### RefiSliderCard details
- `propertyValue` prop drives the LTV slider (always present now):
  - Property lookup: `propertyValue` = listing price
  - Normal refi: `propertyValue` = `Math.round(balance / 0.8)` (80% LTV default)
- No-Cost Refi toggle zeroes closing costs instantly
- Full-width (`width: 100%`) — matches property card width

### LoanLimitsSliderCard details
- All math local — zero API calls on slider move
- Live zone badge: ✅ CONFORMING / ⚡ HIGH BALANCE / 🏛️ JUMBO
- Payment comparison at all 3 zone thresholds
- Built-in county/ZIP adjuster: type any CA ZIP or county → triggers API re-run with `{ loanLimitsCounty }` paramOverride
- 10 quick-select county chips (LA, OC, SD, SF, SJ, Sac, Ventura, Riverside, Alameda, SB)

Each card exposes:
- **Run Adjusted Scenario** → seeds a new question with updated values
- **Save as PDF** → calls `/api/pdf` with current slider state (auth-gated)

---

## 6. Property Intelligence Pipeline

Handles pasting a listing URL or typing a plain street address.

```
Redfin/Zillow/Realtor/Trulia URL  OR  plain address ("3277 Main St…")
       │
       ▼
app/api/property/lookup/route.ts
       │
       ├── URL path:
       │     ├── lib/property/fetch.ts — fetch HTML + Tavily extract (parallel)
       │     │     └── lib/property/parse/redfin.ts / zillow.ts / opengraph.ts
       │     │
       │     ├── If 403/429 (Realtor.com / Trulia blocked):
       │     │     └── parsePropertyFromText(tavilyText) — extracts price, beds,
       │     │           baths, sqft, address from Tavily raw_content as fallback
       │     │
       │     └── PropertyData { price, beds, baths, sqft, listingStatus, ... }
       │
       ├── Address path (Rentcast API):
       │     ├── /v1/properties?address= — beds, baths, sqft, last sale
       │     ├── /v1/avm/value?address= — estimated value + range
       │     └── /v1/listings/sale?status=Active — FOR_SALE vs OFF_MARKET
       │
       └── isOffMarket (SOLD / OFF_MARKET) → Always routes to RefiSliderCard
             balance = estimatedBalance ?? lastSalePrice×0.8
                       ?? estimatedValue×0.8 ?? price×0.8 ?? 600k
```

`listingStatus` values: `'SOLD' | 'PENDING' | 'FOR_SALE' | 'OFF_MARKET' | null`

### Supported sources
| Site | Method | Notes |
|---|---|---|
| Redfin | Direct HTML scrape + Tavily | Full parser; title-tag status detection |
| Zillow | Direct HTML scrape + Tavily | JSON-LD parser |
| Realtor.com | Tavily fallback (403 bypass) | Partial data if Tavily succeeds |
| Trulia | Tavily fallback (403 bypass) | Partial data if Tavily succeeds |
| Plain address | Rentcast API | Full AVM + listing status |

---

## 7. Monthly Homeowner Digest

Automated monthly email sent to borrowers with property intelligence — current AVM value, estimated equity, prevailing rate, and refi window flag.

```
Vercel Cron (1st of each month, 10am UTC)
    │
    ▼
GET /api/digest/cron
    │  loops all borrowers WHERE property_address IS NOT NULL
    │    AND digest_enabled = true AND email IS NOT NULL
    │
    ▼
POST /api/digest/run  (per borrower)
    │
    ├── Rentcast AVM /v1/avm/value?address=
    ├── Upsert homeowner_snapshots (month-over-month delta)
    ├── Compute: value, equity (value - estimated_balance), rate, refi_window
    ├── Send email via Resend (digest@homerates.ai)
    └── Log to digest_sends table
```

### Auth on /api/digest/run
- `x-cron-secret` header (Vercel cron) — matches `CRON_SECRET` env var
- OR valid Clerk session (LO triggering a manual send from borrowers page)
- `preview: true` body param — returns data without sending email

### Borrowers page (`/lo/borrowers`)
LOs manage their borrower list, set property addresses, toggle digest on/off, and trigger manual Send Digest per borrower. Property address is set by the LO — not collected during borrower onboarding.

### LO notification on share
When a borrower shares a chat thread (`/api/share`), the system looks up their LO via `borrowers.external_ref = userId` and sends a Resend notification email: subject `"[Borrower name] just shared a mortgage analysis"` with a link to the thread.

### Key Supabase tables (migration 004)
- `borrowers.property_address` — plain text address set by LO
- `borrowers.digest_enabled` — boolean, default false
- `homeowner_snapshots` — monthly AVM snapshot; GENERATED `refi_window` column
- `digest_sends` — log of each digest email sent

---

## 8. PDF Export

### Route
`pages/api/pdf.ts` — **Pages Router, not App Router.**

This is intentional. Next.js 15 applies the `"react-server"` export condition to all App Router API routes, which strips `React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED` — a dependency of `@react-pdf/reconciler`. Pages Router routes do not receive this condition.

### Auth
`getAuth(req)` from `@clerk/nextjs/server` — requires valid Clerk session. Unauthenticated → 401 → client redirects to `/sign-up`.

### Templates (`lib/pdf/HomePDF.tsx`)

| Export | PDF type |
|---|---|
| `RefiPDF` | Refinance analysis — savings, break-even, interest delta |
| `ConvFhaPDF` | Conventional or FHA — PITI breakdown, LTV, PMI/MIP |
| `AffordabilityPDF` | Max home price, DTI analysis, cash-to-close |
| `DscrPDF` | DSCR calc, cash flow, PITIA breakdown, thresholds |

### react-pdf CSS constraints
- All border styles longhand: `borderWidth`, `borderStyle`, `borderColor`
- No `textTransform: 'uppercase'` — call `.toUpperCase()` on string instead
- No `fontStyle: 'italic'` — use `fontFamily: 'Helvetica-Oblique'`
- No JSX Fragments (`<>`) — wrap in `<View>`
- Conditionals must return `null` not `false` (use ternary, not `&&`)

---

## 9. Typewriter / UX System

```typescript
// 24 characters per tick, 20ms interval ≈ ~1,200 chars/sec
const typeOutAssistant = (id: string, full: string) => {
    setTypingId(id);                           // gate cards + chips
    scrollIntoView(messageElement, 'start');   // anchor viewport
    // ... ticks until full string ...
    setTypingId(null);                         // release all gated elements
}
```

**Sequence:** typing indicator → typingId set → text animates, cards hidden → typingId cleared → slider card fades in, chips appear. Zero layout shift.

---

## 10. FRED Data

Live economic data fetched on every request:
- `mort30Avg` — 30yr fixed rate (primary rate for all calcs)
- `mort15Avg`, `arm5Avg` — comparison rates
- `tenYearYield`, `spread`, `dgs2`, `dgs30`, `t10y2y` — rate context
- `existingHomeSales` — normalized: raw units ÷ 1M when value > 100,000
- `medianHomePrice`, `monthsSupply`, `housingStarts` — market context

---

## 11. Dark Mode

Dual-track dark mode:
- `[data-theme="dark"]` — app toggle (globals.css)
- `@media (prefers-color-scheme: dark)` — OS preference

Both tracks must be maintained in parallel. Legal pages (About/Privacy/Disclosures) use `.legal-page-*` CSS classes with `[data-theme="dark"]` overrides. Clerk modal uses explicit `.cl-card`, `.cl-headerTitle`, `.cl-formFieldInput`, etc. overrides.

---

## 12. Configuration Highlights

### next.config.ts
```typescript
serverExternalPackages: ['@react-pdf/renderer']
```

### Critical routing note
`refiSlider` must be populated in **both** the standard `calcCard` return block and the `refi_advisor_v2` bypass return block in `route.ts` — missing it in either path causes the slider card to not appear.

---

## 13. File Map

```
app/
  api/
    answers/route.ts          — Main API: routing, guards, Grok fallback
    answers/scenario/         — Scenario re-run endpoint
    property/lookup/route.ts  — Property lookup (URL scrape + Rentcast address + Tavily fallback)
    borrowers/route.ts        — GET list + PATCH update (property_address, digest_enabled, email)
    share/route.ts            — Create share link + LO notification email on share
    digest/
      run/route.ts            — POST: Rentcast AVM, snapshot upsert, Resend email, digest_sends log
      cron/route.ts           — GET: Vercel cron handler, loops all eligible borrowers
  components/
    InteractiveSliderCard.tsx
    AffordabilitySliderCard.tsx
    DSCRSliderCard.tsx
    RefiSliderCard.tsx         — LTV slider, closing costs, No-Cost toggle
    LoanLimitsSliderCard.tsx   — CA 2026 zone explorer, ZIP/county adjuster
    PropertyIntelligenceCard.tsx
    PdfDownloadButton.tsx      — Auth-gated, calls /api/pdf
    PageShell.tsx              — Dark wrapper for non-chat pages (ps-root pattern)
    WelcomeScreen.tsx          — Rate ticker, onboarding chips
  lo/
    borrowers/page.tsx         — LO borrower list: address editor, Send Digest button
    dashboard/page.tsx         — LO dashboard
  chat/page.tsx                — Main chat UI, typingId state, message tree

pages/
  api/
    pdf.ts                     — PDF generation (Pages Router — intentional)

lib/
  calcEngine.ts                — Pure math: PITI, DSCR, refi, affordability
                                 INS_RATE_DEFAULT = 0.003 (0.3%/yr — all funcs)
  calcDispatcher.ts            — Routes question text → CalcType
  cardBuilders.ts              — BuiltCard assemblers, chip definitions
  loanLimits2026.ts            — 58 CA counties, 2026 FHFA/HUD data, ZIP map
  property/
    schema.ts                  — PropertyData + ListingStatus types
    detect.ts                  — URL source detection (Zillow/Redfin/Realtor/Trulia)
    parse/redfin.ts            — Redfin HTML parser, detectRedfinStatus()
    parse/zillow.ts            — Zillow JSON-LD parser
    fetch.ts                   — Merges site parser + Tavily data
  digest/
    emailTemplate.ts           — Dark HTML email template (value, equity, rate, refi block)
  pdf/
    HomePDF.tsx                — react-pdf templates (all 4 types)

supabase/migrations/
  004_digest.sql               — property_address, digest_enabled, homeowner_snapshots, digest_sends

vercel.json                    — Cron: 0 10 1 * * → /api/digest/cron
```

---

## 14. Legal / Compliance

- No NMLS license numbers in any user-facing content
- All calc outputs labeled "educational estimate" — not a Loan Estimate or commitment to lend
- Closing costs label: "~1% est. — get lender quotes" (not a fixed fee representation)
- Every PDF includes full RESPA/TILA-style disclosure paragraphs
- Full disclosures: `homerates.ai/disclosures`
- Positioned as an **educational platform**, not a licensed mortgage originator
