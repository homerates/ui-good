// src/lib/guidelinesServer.ts

/**
 * Minimal "Lender Guideline Brain" stub.
 *
 * Phase 1:
 * - No DB, no PDF parsing yet.
 * - Returns clearly labeled LoanDepot-style guideline context
 *   for DSCR / Jumbo questions so Grok can anchor on it.
 *
 * Later we can replace this with Supabase + PDF/RAG without changing callers.
 */

/**
 * Used by the answers route to inject extra guideline context
 * into the model prompt. This should be SHORTER, high-signal text.
 */
export async function getGuidelineContextForQuestion(
    rawQuestion: string
): Promise<string> {
    if (!rawQuestion) return "";

    const q = rawQuestion.toLowerCase();
    const chunks: string[] = [];

    // === LoanDepot DSCR (Advantage FLEX DSCR) ===
    if (q.includes("dscr") || q.includes("debt service coverage")) {
        chunks.push(
            [
                "LoanDepot – Advantage FLEX DSCR (internal-style summary, based on the Advantage FLEX Non-QM Lending Guide; not a public ad):",
                "",
                "Program scope:",
                "- Business-purpose, NON-owner-occupied investment properties only.",
                "- The subject property may NOT be occupied by the borrower, any member of the borrower’s LLC, or a family member.",
                "- Borrowers are qualified on the PROPERTY’S REVENUE instead of a standard personal DTI.",
                "",
                "How DSCR is calculated for LoanDepot Advantage FLEX DSCR:",
                "- DSCR = RENTAL INCOME ÷ proposed PITIA/ITIA on the subject property.",
                "- The numerator is RENTAL INCOME, not a full net operating income (NOI) calculation.",
                "- Do NOT describe this program as using NOI ÷ debt service. Use RENTAL INCOME ÷ PITIA instead.",
                "",
                "Rental income inputs (high level):",
                "- Long-term rentals: use the LOWER of the executed lease agreement or market rent from the appraisal (Form 1007/1025).",
                "- Short-term rentals (where allowed): use a combination of STR analysis / documented STR receipts per the current Advantage FLEX DSCR guide.",
                "",
                "High-level program notes:",
                "- Reserves, min DSCR ratios, LTV caps, and FICO bands must come from the current LoanDepot Advantage FLEX DSCR matrix for the lock date.",
                "",
                "Assistant behavior:",
                "- If the question involves LoanDepot DSCR or Advantage FLEX DSCR, ALWAYS use the RENTAL INCOME ÷ PITIA definition.",
                "- You may mention that some OTHER lenders use NOI-based DSCR, but clearly state that LoanDepot’s Advantage FLEX DSCR does NOT use NOI.",
            ].join("\n")
        );
    }

    // === LoanDepot Jumbo / Jumbo Advantage ===
    if (
        q.includes("jumbo advantage") ||
        q.includes("jumbo loan") ||
        q.includes("jumbo") ||
        q.includes("high balance")
    ) {
        chunks.push(
            [
                "LoanDepot – Jumbo Advantage (internal-style summary, not a public ad):",
                "- Typical max LTV bands (subject to exact product matrix and date):",
                "  • Around 80% LTV for strong primary residence borrowers.",
                "  • Around 75% LTV for second homes.",
                "  • Often 70% LTV or lower for investment properties.",
                "- Preferred FICO is usually 700+ with 6–12 months of PITIA reserves, scaling by loan size and number of financed properties.",
                "- Income documentation follows agency-style full doc first, with overlays for larger loan amounts and complex profiles.",
                "",
                "Exact LTV/FICO/reserve grids MUST be confirmed from the live LoanDepot Jumbo Advantage lending guide for the scenario/lock date.",
            ].join("\n")
        );
    }

    if (!chunks.length) {
        // No lender-specific match – let the model fall back to agency/public baselines.
        return "";
    }

    return chunks.join("\n\n");
}

/**
 * Used by the answers route as a hard DSCR override.
 * If the question clearly targets LoanDepot DSCR / Advantage FLEX DSCR,
 * return a ready-made answer snippet that NEVER talks about NOI.
 * Otherwise return null so the normal pipeline runs.
 */
export async function maybeBuildDscrOverrideAnswer(
    rawQuestion: string
): Promise<string | null> {
    if (!rawQuestion) return null;

    const q = rawQuestion.toLowerCase();
    const mentionsDscr =
        q.includes("dscr") || q.includes("debt service coverage");
    const mentionsLoanDepot =
        q.includes("loandepot") ||
        q.includes("loan depot") ||
        q.includes("advantage flex") ||
        q.includes("flex dscr");

    if (!mentionsDscr || !mentionsLoanDepot) {
        return null;
    }

    // This is a LoanDepot DSCR question – return an authoritative explanation.
    return [
        "LoanDepot Advantage FLEX DSCR – How Income Is Calculated",
        "",
        "For LoanDepot’s Advantage FLEX DSCR program, the Debt Service Coverage Ratio (DSCR) is NOT based on net operating income (NOI).",
        "Instead, the lender uses the following definition:",
        "",
        "  DSCR = RENTAL INCOME ÷ proposed PITIA/ITIA",
        "",
        "Key points:",
        "- RENTAL INCOME is used directly in the numerator; operating expenses are not deducted to create a separate NOI figure.",
        "- PITIA/ITIA includes principal, interest, property taxes, insurance, and HOA dues (if applicable) on the subject property.",
        "- Because of this structure, you should never describe LoanDepot’s Advantage FLEX DSCR as “NOI ÷ debt service.” That is a generic industry definition, not how this specific program works.",
        "",
        "Rental income sourcing (high-level summary):",
        "- For long-term rentals, rental income is generally based on the LOWER of:",
        "  • the executed lease agreement, or",
        "  • market rent from the appraisal rent schedule (e.g., Form 1007/1025).",
        "- For short-term rentals (where permitted), the guide allows use of STR analysis or documented receipts per the current Advantage FLEX DSCR requirements.",
        "",
        "Other program characteristics:",
        "- Business-purpose, non-owner-occupied investment properties only.",
        "- The subject property may not be occupied by the borrower, any member of the borrower’s LLC, or a family member.",
        "- Borrowers are qualified primarily on the property’s DSCR rather than a traditional personal DTI calculation.",
        "- Minimum DSCR ratios, LTV caps, FICO minimums, and reserve requirements must be taken from the current LoanDepot Advantage FLEX DSCR matrix for the specific lock date.",
        "",
        "If you compare this to generic DSCR loans from other lenders, be explicit that LoanDepot’s Advantage FLEX DSCR uses RENTAL INCOME ÷ PITIA, not NOI ÷ debt service."
    ].join("\n");
}
