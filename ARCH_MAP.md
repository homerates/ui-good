# ARCH_MAP.md — HomeRates.ai Architecture Map
> Read-only analysis. No edits proposed. Unverified paths are labeled.

---

## 1. DECISION SCORE

### What feeds it

| Level | Source | Where computed |
|-------|--------|---------------|
| L1 (Financial, 35%) | Loan type + LTV formula — inline in `app/chat/page.tsx` ~L2480–2528 | `recalcDSL1()` helper, same file |
| L2 (Property, 25%) | List price vs AVM (`d.estimatedValue`) premium — inline in `app/chat/page.tsx` ~L2529–2536 | Inline at DSC construction point |
| L3 (Market, 25%) | Grok 4 deep analysis — async background call to `/api/featured-properties` then Grok | `app/chat/page.tsx` async IIFE ~L2600–2820 |
| L4 (Location, 15%) | Same Grok 4 deep analysis — parsed from same response as L3 | Same IIFE |
| compositeScore | Weighted average of available levels | Computed twice: (a) inline in same IIFE at L2836–2841; (b) client-side in `computeComposite()` in `app/components/DecisionScoreCard.tsx:42–56` as fallback |

### Single aggregation function

**`app/chat/page.tsx` — anonymous async IIFE starting ~L2600.**
This is where L3/L4 arrive from Grok, where the composite is calculated, and where `completeDsc` is assembled at **L2842–2857**:
```
const completeDsc = {
  state, address, propertyState, zip,
  l1Score, l1Summary, l2Score, l2Summary,
  l3Score, l3Summary, l4Score, l4Summary,
  compositeScore, sessionId
}
```

### Single card emission point

**`app/chat/page.tsx` L4451–4460:**
```tsx
{m.meta.decisionScoreCard && (
  <DecisionScoreCard
    data={m.meta.decisionScoreCard}
    scenarioPrice={m.meta.interactiveSlider?.price}
    ...
  />
)}
```
The `DecisionScoreCard` component lives at `app/components/DecisionScoreCard.tsx`.
There is no other emission point for this card.

---

## 2. SCENARIO CARD (InteractiveSliderCard)

### Data contract — every field

Defined at `app/chat/page.tsx:410–420` as `interactiveSlider` on `ApiResponse`:

| Field | Type | Source |
|-------|------|--------|
| `price` | number | `d.price` from property lookup response |
| `downPct` | number | `defaultDown` (20 unless FHA/VA context) |
| `rate` | number | `liveRate` — from `/api/ticker` 30Y FIXED item; falls back to 6.65 |
| `term` | number | Hardcoded 30 |
| `taxRate` | number | `d.taxRateEffective ?? 0.012` |
| `insRate` | number | Hardcoded 0.005 |
| `loanType` | 'conventional'\|'fha'\|'jumbo'\|'va' | Derived from FHA/VA context detection + loan amount vs $832,750 |
| `cmaAddress` | string\|undefined | `d.address` |
| `cmaCity` | string\|undefined | `d.city` |
| `cmaState` | string\|undefined | `d.state` |
| `cmaZip` | string\|undefined | `d.zip` |
| `cmaPrice` | number\|undefined | `d.price` |
| `cmaBeds` | number\|undefined | `d.beds` |
| `cmaBaths` | number\|undefined | `d.baths` |
| `cmaSqft` | number\|undefined | `d.sqft` |
| `cmaTaxAnnual` | number\|undefined | `d.annualTaxes` |
| `cmaTaxRate` | number\|undefined | `d.taxRateEffective` |
| `cmaLiveRate` | number\|undefined | `liveRate` |
| `cmaPhotoUrl` | string\|undefined | `d.photoUrl` |
| `annualIncome` | number\|undefined | Not set at construction — added later by IncomeQualifySliderCard |
| `monthlyDebt` | number\|undefined | Not set at construction — added later by IncomeQualifySliderCard |

**Assembled at `app/chat/page.tsx:2495–2515`** in the FOR-SALE purchase path, inside the `property_lookup` handler.

### ZIP trace — from address resolve to scenario card

```
1. User pastes URL / address
2. app/chat/page.tsx fires POST /api/property/lookup
3. /api/property/lookup → handleAddress() → handleUrl() → parsePropertyFromText()
   Regex: /^(\d[^,]+),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?/i
   ZIP = full[4] ?? null   ← OPTIONAL capture — first failure point
4. mergeGpt4o() fills zip if GPT-4o returned it and base has null
5. Fallback (added Jun 2026): URL slug regex on `url` field
   /redfin\.com\/[A-Z]{2}\/[^/]+\/.+?-(\d{5})(?:\/|$)/i  ← second failure point
   (only works for properties whose URL follows slug-with-ZIP format)
6. Cache path (added Jun 2026): same URL regex applied to cached.url
   ← third failure point: cache was stored before fix, or url field doesn't exist
7. Response returns: { ok: true, data: { ..., zip: "92672" | null } }
8. app/chat/page.tsx:2300 — const d = lookupJson.data
9. interactiveSlider constructed at L2495: cmaZip = d.zip ?? undefined
10. decisionScoreCard constructed at L2548: zip = d.zip ?? undefined
```

**ZIP stops being carried at step 3** when the text scraper's optional capture group misses it AND:
- GPT-4o also doesn't return it (or was null), AND
- The Redfin URL slug doesn't contain the ZIP in the expected pattern, AND
- The cached snapshot predates the URL-slug fallback patches

After step 10, `zip` is in both `interactiveSlider.cmaZip` and `decisionScoreCard.zip`, but if it's `undefined` at step 3 it stays `undefined` everywhere downstream.

---

## 3. RATE INTELLIGENCE ENGINE

### How it attaches

Rate Intelligence is a **completely separate path** from the decision score. It does NOT feed into `completeDsc`, `computeComposite()`, or any part of the L1–L4 scoring pipeline.

**Divergence point: `app/components/DecisionScoreCard.tsx:135–154`**

After the DSC renders (both `complete` and `rateIntelUrl` truthy), an `<a>` link is displayed as the L5 row — it does NOT invoke any scoring function. Clicking it navigates the user out of chat to a separate page.

```
DecisionScoreCard (display)
  └── rateIntelUrl built at DSC:135 from scenarioPrice + data.propertyState + data.zip
  └── L5 row renders as <a href={rateIntelUrl}> — navigation only, no data written back to DSC

/rate-intelligence-engine  (separate page)
  └── RateEngineClient.tsx — standalone form + LLPA engine
  └── After decode: writes { lenderParRate, county } → localStorage hr_rie_result
  └── No callback / no API write back to the session or DSC

Track 5 page
  └── reads hr_rie_result from localStorage on mount (app/track5/page.tsx:280–288)
  └── displayed as L5 card — NOT part of the weighted composite
  └── key is GLOBAL (not scoped by sessionId or address)
```

### Rate Intelligence has its own entirely separate output path:

| Step | File | What happens |
|------|------|-------------|
| User fills form + clicks Decode | `app/rate-intelligence-engine/RateEngineClient.tsx` | Calls `/api/rate-intelligence-engine` |
| Decode result received | `RateEngineClient.tsx:~212` | `localStorage.setItem('hr_rie_result', ...)` |
| Track 5 mounts | `app/track5/page.tsx:280` | `localStorage.getItem('hr_rie_result')` → `setRieResult()` |
| L5 card rendered | `app/track5/page.tsx` | Uses `rieResult.lenderParRate` — display only |

Rate Intelligence output is **never written to Supabase**, **never merged into the session**, and **never affects the composite Decision Index score**. It is a display-only annotation on the Track 5 page, sourced from an unscoped localStorage key.

---

## Known architectural gaps (observed, not speculated)

1. **`sessionId` not threaded to RIE URL.** `rateIntelUrl` (DSC:140–153) builds params from `scenarioPrice`, `propertyState`, `zip` — `sessionId` is never added. So `/rate-intelligence-engine → /track5` arrives with no session context; L1–L4 are always blank on that path.

2. **`hr_rie_result` localStorage is global.** No sessionId, no address, no TTL. Any Track 5 visit shows whatever the last decode produced, for any property.

3. **ZIP is optional at the scraper level.** `parsePropertyFromText()` in `app/api/property/lookup/route.ts:394` — the `(\d{5})?` group. Multiple fallbacks have been added downstream but none are guaranteed: GPT-4o may also miss it; Redfin URL slug may not contain it; cached snapshots may predate the fallback patches.

4. **`completeDsc` built in a single IIFE with no type enforcement.** The object at `app/chat/page.tsx:2842` is constructed inline as `const completeDsc = { ... }` and cast to `DecisionScoreData` only at the Supabase session save call — not at the `setMessages` call at L2864. Type errors here would be silent at runtime. **[Unverified: whether this causes any actual data loss — would need to confirm `DecisionScoreData` type is enforced at all four `setMessages` call sites.]**
