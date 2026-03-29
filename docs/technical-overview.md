# HomeRates.ai — Technical Overview
**Last updated: March 29, 2026**

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
| AI / LLM | Grok (xAI) for open-ended; calc engine for everything else |
| Data | FRED API (live mortgage rates, economic indicators) |
| PDF generation | @react-pdf/renderer 4.3.2 |
| Deployment | Vercel (serverless) |
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

Handles pasting a Redfin URL or asking about a specific address.

```
Redfin URL / address
       │
       ▼
app/api/property/lookup/route.ts
       │
       ├── lib/property/parse/redfin.ts
       │     detectRedfinStatus() — checks <title> first (authoritative),
       │     then JSON-LD offers.availability
       │
       ├── lib/property/fetch.ts — merges Redfin + Tavily data
       │
       └── PropertyData { price, beds, baths, sqft, listingStatus, ... }
              │
              ▼ isOffMarket (SOLD / OFF_MARKET)
              └── Always routes to RefiSliderCard
                    balance = estimatedBalance ?? lastSalePrice×0.8
                              ?? estimatedValue×0.8 ?? price×0.8 ?? 600k
```

`listingStatus` values: `'SOLD' | 'PENDING' | 'FOR_SALE' | null`

---

## 7. PDF Export

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

## 8. Typewriter / UX System

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

## 9. FRED Data

Live economic data fetched on every request:
- `mort30Avg` — 30yr fixed rate (primary rate for all calcs)
- `mort15Avg`, `arm5Avg` — comparison rates
- `tenYearYield`, `spread`, `dgs2`, `dgs30`, `t10y2y` — rate context
- `existingHomeSales` — normalized: raw units ÷ 1M when value > 100,000
- `medianHomePrice`, `monthsSupply`, `housingStarts` — market context

---

## 10. Dark Mode

Dual-track dark mode:
- `[data-theme="dark"]` — app toggle (globals.css)
- `@media (prefers-color-scheme: dark)` — OS preference

Both tracks must be maintained in parallel. Legal pages (About/Privacy/Disclosures) use `.legal-page-*` CSS classes with `[data-theme="dark"]` overrides. Clerk modal uses explicit `.cl-card`, `.cl-headerTitle`, `.cl-formFieldInput`, etc. overrides.

---

## 11. Configuration Highlights

### next.config.ts
```typescript
serverExternalPackages: ['@react-pdf/renderer']
```

### Critical routing note
`refiSlider` must be populated in **both** the standard `calcCard` return block and the `refi_advisor_v2` bypass return block in `route.ts` — missing it in either path causes the slider card to not appear.

---

## 12. File Map

```
app/
  api/
    answers/route.ts          — Main API: routing, guards, Grok fallback
    answers/scenario/         — Scenario re-run endpoint
    property/lookup/route.ts  — Property intelligence (Redfin scrape)
  components/
    InteractiveSliderCard.tsx
    AffordabilitySliderCard.tsx
    DSCRSliderCard.tsx
    RefiSliderCard.tsx         — LTV slider, closing costs, No-Cost toggle
    LoanLimitsSliderCard.tsx   — CA 2026 zone explorer, ZIP/county adjuster
    PropertyIntelligenceCard.tsx
    PdfDownloadButton.tsx      — Auth-gated, calls /api/pdf
    WelcomeScreen.tsx          — Rate ticker, onboarding chips
  page.tsx                     — Main chat UI, typingId state, message tree
  globals.css                  — App-wide styles, dark mode, legal pages

pages/
  api/
    pdf.ts                     — PDF generation (Pages Router — intentional)

lib/
  calcEngine.ts                — Pure math: PITI, DSCR, refi, affordability
  calcDispatcher.ts            — Routes question text → CalcType
  cardBuilders.ts              — BuiltCard assemblers, chip definitions
  loanLimits2026.ts            — 58 CA counties, 2026 FHFA/HUD data, ZIP map
  property/
    schema.ts                  — PropertyData + ListingStatus types
    parse/redfin.ts            — Redfin HTML parser, detectRedfinStatus()
    fetch.ts                   — Merges Redfin + Tavily data
  pdf/
    HomePDF.tsx                — react-pdf templates (all 4 types)
```

---

## 13. Legal / Compliance

- No NMLS license numbers in any user-facing content
- All calc outputs labeled "educational estimate" — not a Loan Estimate or commitment to lend
- Closing costs label: "~1% est. — get lender quotes" (not a fixed fee representation)
- Every PDF includes full RESPA/TILA-style disclosure paragraphs
- Full disclosures: `homerates.ai/disclosures`
- Positioned as an **educational platform**, not a licensed mortgage originator
