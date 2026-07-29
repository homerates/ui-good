// src/lib/guidelinesServer.ts
//
// Generic (no-lender-name) DSCR / Jumbo guideline context for the underwriting
// bypass prompt. Previously this returned LoanDepot-branded content (a real
// partner integration for Rate Marketplace, not stray text) — removed from
// this general-chat path per an explicit decision: general chat should never
// surface one lender's specific product terms by default (BRAND.md R1, "no
// lender identity on HomeRates outside anonymized matched-lender surfaces").
// If Rate Marketplace's matched-lender flow needs LoanDepot's real DSCR
// formula again, that's separate, deliberate work scoped to that surface.
//
// DSCR loan programs are non-agency (no Fannie/Freddie/FHA/VA equivalent),
// so there is no single official regulatory source to cite here the way the
// RAG guideline_chunks table can for conforming/government loans — this
// stays a hand-written, deliberately hedged summary of common industry
// convention, not a specific lender's guide.

/**
 * Used by the answers route to inject extra guideline context
 * into the model prompt. This should be SHORT, high-signal text.
 */
export async function getGuidelineContextForQuestion(
    rawQuestion: string
): Promise<string> {
    if (!rawQuestion) return "";

    const q = rawQuestion.toLowerCase();
    const chunks: string[] = [];

    // === DSCR (investor / non-owner-occupied) — generic industry convention ===
    if (q.includes("dscr") || q.includes("debt service coverage")) {
        chunks.push(
            [
                "DSCR (Debt Service Coverage Ratio) investor loans — general industry convention, not one lender's guide:",
                "",
                "- Business-purpose, non-owner-occupied investment properties only. The subject property may not be occupied by the borrower or a family member.",
                "- Borrowers qualify primarily on the property's rental income rather than personal DTI.",
                "- The most common formula for residential (1-4 unit) DSCR investor programs is:",
                "    DSCR = monthly gross rental income ÷ monthly PITIA",
                "- Some lenders instead use a net-operating-income convention (NOI ÷ debt service), more common in commercial lending.",
                "- Rental income is typically the lower of the executed lease or the market rent from an appraisal rent schedule (e.g., Form 1007/1025).",
                "",
                "Exact formula, minimum DSCR ratio, LTV caps, FICO minimums, and reserve requirements vary by lender — DSCR is a non-agency product with no single governing standard body. State this variation explicitly rather than presenting one lender's numbers as universal.",
            ].join("\n")
        );
    }

    // === Jumbo — generic industry convention ===
    if (
        q.includes("jumbo advantage") ||
        q.includes("jumbo loan") ||
        q.includes("jumbo") ||
        q.includes("high balance")
    ) {
        chunks.push(
            [
                "Jumbo loans (above conforming loan limits) — general industry convention, not one lender's guide:",
                "- Typical max LTV bands vary by lender, roughly: ~80% for strong primary-residence borrowers, ~75% for second homes, ~70% or lower for investment properties.",
                "- Preferred credit score is commonly 700+, with several months of PITIA reserves scaling by loan size and number of financed properties.",
                "- Income documentation generally follows agency-style full documentation, with additional overlays for larger loan amounts.",
                "",
                "Exact LTV/credit-score/reserve requirements vary significantly by lender — state this rather than presenting one lender's matrix as universal.",
            ].join("\n")
        );
    }

    if (!chunks.length) {
        // No topic match – let the model fall back to agency/public baselines.
        return "";
    }

    return chunks.join("\n\n");
}

/**
 * No-op — the LoanDepot-specific hard override this used to provide has been
 * removed from the general-chat path (see file header). Kept so the existing
 * import in route.ts doesn't need to change; always returns null, meaning
 * the normal pipeline runs unconditionally.
 */
export async function maybeBuildDscrOverrideAnswer(
    _rawQuestion: string
): Promise<string | null> {
    return null;
}
