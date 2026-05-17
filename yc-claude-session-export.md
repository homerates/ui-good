# Claude Code Session Export — HomeRates.ai
**Session:** AVM Data Pipeline Debugging + Property Lookup UX Overhaul  
**Date:** May 2026  
**Tool:** Claude Code by Anthropic (claude-sonnet-4-6)  
**Founder:** Rayaan Arif, HomeRates.ai  

---

> **Context for YC reviewers:** Rayaan is a mortgage industry veteran and non-developer founder. He has no formal coding background. Every line of production code in HomeRates was written through AI coding tools. What follows is a real session where he identified a production bug by domain intuition, and Claude Code diagnosed and fixed it across a multi-layered data pipeline.

---

## The Session

---

**RAYAAN:**
This one seems to be stuck on the same value (wrong). My main concern is that our database behaves in a way that may not be the correct way as we build more and more properties and users.

*[Attaches screenshot of a property showing $532k AVM — Redfin shows $888,984]*

---

**CLAUDE CODE:**

Looking at the AVM priority chain in `propertyLookup()`. The issue is in `needsLive` — the gate that controls whether we trigger an expensive Redfin scrape. Right now it only fires when `latest_value` is absent entirely. Once the field is set, it never refreshes. A property checked 6 months ago keeps its stale value forever.

Let me read the analysis route to confirm.

*[Reads `app/api/homeowner/analysis/route.ts`]*

Confirmed. The staleness gate is missing. Adding a 30-day expiry using `prop.updated_at`:

```typescript
const propAgeMs = prop?.updated_at 
  ? Date.now() - new Date(prop.updated_at).getTime() 
  : Infinity;
const needsLive = !rawSalePrice || !prop?.beds || !prop?.sqft 
  || !prop?.latest_value || propAgeMs > SNAPSHOT_TTL_MS;
```

Also reducing FHFA model snapshots from 30-day TTL to 7-day — those are lower-confidence estimates and shouldn't cache as long as Redfin-verified ones.

*[Edits `app/api/homeowner/analysis/route.ts`]*
*[git commit: "fix: refresh stale property AVMs — 30-day needsLive gate + FHFA 7-day snapshot TTL"]*
*[git push → Vercel deploy → ✓ Build passed]*

---

**RAYAAN:**
Now it's worse. Any idea where that number gets pulled from? Redfin has $888,984 but we're showing $226,500.

---

**CLAUDE CODE:**

$226,500 is the 1996 purchase price. That's the `lastSalePrice` leaking in as the AVM. Here's why:

The property last sold in **August 1996**. GPT-4o returns that date as the string `"August 1996"`. JavaScript's `new Date("August 1996")` returns `Invalid Date` in V8 — it doesn't parse month-year strings without a day. So `saleDate` is null.

With no sale date, our FHFA appreciation model can't compute a current value — it returns null. And `dbEst` (the stored `properties.latest_value`) happens to be $226,500, which is exactly the 1996 purchase price. So that's all we have left in the chain.

Two fixes needed:

**1. `parseFlexDate()` — handle "Month YYYY" strings from GPT-4o:**
```typescript
function parseFlexDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  let d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1900) return d;
  const m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    d = new Date(`${m[1]} 1, ${m[2]}`);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1900) return d;
  }
  return null;
}
```

**2. Evict snapshots where AVM ≈ old sale price** — a symptom of failed Redfin Estimate extraction:
```typescript
const avmEqualsOldSalePrice = !hasLoFinancials && !!(
  rawSalePrice && prop?.latest_value && roughSaleMs &&
  Date.now() - roughSaleMs > TWO_YEARS_MS &&
  Math.abs(prop.latest_value - rawSalePrice) / rawSalePrice < 0.02
);
const needsLive = ... || avmEqualsOldSalePrice;
```

**3. Sanity-check `dbEst` before using it:**
```typescript
const dbEstIsOldSalePrice = !!(rawDbEst && salePrice && saleDate &&
  Date.now() - saleDate.getTime() > TWO_YEARS_MS &&
  Math.abs(rawDbEst - salePrice) / salePrice < 0.02);
const dbEst = dbEstIsOldSalePrice ? null : rawDbEst;
```

*[Edits `app/api/homeowner/analysis/route.ts` — 3 surgical changes across ~80 lines]*
*[git commit: "fix: correct AVM when purchase price leaks into latest_value (e.g. 1996 sale)"]*
*[git push → Vercel deploy → ✓ Build passed]*

---

**RAYAAN:**
Something is causing the edits on these numbers to not work. I entered the new numbers and saved but nothing updated and the run went back to blank.

*[Screenshot of loan editor form with empty fields after saving]*

---

**CLAUDE CODE:**

Found two separate bugs in `saveLoanDetails()` in `my-home/page.tsx`:

**Bug 1 — Silent failure:** The function calls `setLoanSaved(true)` and `setEditingLoan(false)` regardless of whether the API call succeeded. If the save fails, the UI closes the editor and clears the form with no error message.

**Bug 2 — Unnecessary re-scrape:** After saving `actual_balance`, `hasLoFinancials` becomes true — but `avmEqualsOldSalePrice` still triggers because it wasn't guarded. This forces a 10+ second Redfin scrape whose result gets immediately discarded. That's why "the run went back to blank" — it was re-running the full analysis with a slow live scrape.

Fixes:

```typescript
// Surface errors instead of silently failing
const saved = await res.json().catch(() => null);
setLoanSaving(false);
if (!res.ok || !saved?.property) {
  alert(saved?.error ?? 'Save failed — please try again.');
  return;
}
setProperties(prev => prev.map(p => 
  p.id === saved.property.id ? saved.property : p
));
setLoanSaved(true);
setEditingLoan(false);
```

```typescript
// Guard avmEqualsOldSalePrice with hasLoFinancials
const avmEqualsOldSalePrice = !hasLoFinancials && !!(...)
```

Also: `actual_value` was missing from the `HomeownerProperty` TypeScript interface, which was silently breaking the override chain when a user entered their own home value.

*[Edits `app/my-home/page.tsx` and `app/api/homeowner/analysis/route.ts`]*
*[git commit: "fix: loan editor save reliability — error surfacing + fast reload after save"]*
*[git push → Vercel deploy → ✓ Build passed]*

---

## What This Session Demonstrates

**4 production bugs fixed in one session:**
1. Stale AVM cached indefinitely — fixed with 30-day staleness gate
2. 1996 sale price leaking as current AVM — fixed with `parseFlexDate()` and `avmEqualsOldSalePrice` eviction
3. Loan editor save silently failing — fixed with proper error surfacing
4. Unnecessary 10-second re-scrape after save — fixed with `hasLoFinancials` guard

**The founder's role:** Rayaan identified all three problems by domain intuition — he knew what the correct AVM should be, he knew the save should work, he knew the reload was too slow. He had zero visibility into the code causing each issue. The diagnostic reasoning, root cause analysis, and multi-file fixes were done entirely through Claude Code.

**Files changed:** `app/api/homeowner/analysis/route.ts`, `app/my-home/page.tsx`  
**Lines modified:** ~120 across 2 files  
**Time to ship all 4 fixes:** ~45 minutes  
**Deploys:** 3 successful Vercel production deploys

---

*Exported from Claude Code — HomeRates.ai production repository*  
*github.com/homerates/ui-good*
