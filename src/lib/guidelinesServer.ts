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
 * into the model prompt. This should be SHORT, high-signal text.
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
                "LoanDepot – Advantage FLEX DSCR (internal-style summary; not a public ad):",
                "",
                "1) PROGRAM SCOPE",
                "- Business-purpose, NON-owner-occupied investment properties only.",
                "- The subject property may NOT be occupied by the borrower, any member of the borrower’s LLC, or a family member.",
                "- Borrowers are qualified primarily on the PROPERTY’S REVENUE instead of a traditional personal DTI.",
                "",
                "2) HOW DSCR IS CALCULATED FOR LOANDEPOT ADVANTAGE FLEX DSCR",
                "- LoanDepot’s Advantage FLEX DSCR does NOT use a net operating income (NOI) definition.",
                "- For this program, DSCR is defined as:",
                "    DSCR = RENTAL INCOME ÷ proposed PITIA/ITIA",
                "- RENTAL INCOME is used directly in the numerator; you do NOT subtract operating expenses to create NOI for LoanDepot’s DSCR calculation.",
                "- PITIA/ITIA includes principal, interest, taxes, insurance, and HOA dues (if applicable) on the subject property.",
                "",
                "Very important assistant rule:",
                "- When answering ANY question that involves LoanDepot DSCR or Advantage FLEX DSCR, you MUST:",
                "  • Use RENTAL INCOME ÷ PITIA as the definition of DSCR.",
                "  • NOT say that LoanDepot uses NOI for DSCR.",
                "  • NOT use phrases such as “Net Operating Income,” “NOI ÷ debt service,” or “standard DSCR = NOI / debt service” in the context of LoanDepot DSCR.",
                "",
                "3) RENTAL INCOME SOURCING (HIGH LEVEL)",
                "- Long-term rentals:",
                "  • Use the LOWER of the executed lease agreement OR the market rent from the appraisal rent schedule (e.g., Form 1007/1025).",
                "- Short-term rentals (where permitted):",
                "  • Use STR analysis or documented STR receipts per the current Advantage FLEX DSCR guide.",
                "",
                "4) OTHER PROGRAM CHARACTERISTICS",
                "- Reserves, minimum DSCR ratios, LTV caps, FICO minimums, and any layering by experience must be taken from the current LoanDepot Advantage FLEX DSCR matrix for the specific lock date.",
                "",
                "5) GENERIC VS LOANDEPOT-SPECIFIC DSCR:",
                "- If the user asks about DSCR “for any lender” and does NOT mention LoanDepot, you MAY describe generic industry DSCR as NOI ÷ debt service.",
                "- HOWEVER, if the question mentions LoanDepot, Loan Depot, Advantage FLEX, or you include LoanDepot in your answer:",
                "  • You MUST switch to the LoanDepot-specific definition (RENTAL INCOME ÷ PITIA).",
                "  • You MUST NOT describe LoanDepot’s DSCR program as NOI-based or say “based on standard industry practices” for the formula.",
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
 * Hard DSCR override.
 *
 * If the question clearly targets LoanDepot DSCR / Advantage FLEX DSCR,
 * return an authoritative explanation that NEVER talks about NOI.
 * Otherwise return null so the normal pipeline runs.
 */
export async function maybeBuildDscrOverrideAnswer(
    rawQuestion: string
): Promise<string | null> {
    if (!rawQuestion) return null;

    const q = rawQuestion.toLowerCase();
    const mentionsDscr =
        q.includes("dscr") || q.includes("debt service coverage");

    // be generous: any mention of LoanDepot, loan depot, FLEX DSCR, etc.
    const mentionsLoanDepot =
        q.includes("loandepot") ||
        q.includes("loan depot") ||
        q.includes("advantage flex") ||
        q.includes("flex dscr") ||
        q.includes("ld dscr");

    if (!mentionsDscr || !mentionsLoanDepot) {
        return null;
    }

    // This is a LoanDepot DSCR question – bypass generic DSCR logic entirely.
    return [
        "LoanDepot Advantage FLEX DSCR – How the Ratio Is Calculated",
        "",
        "For LoanDepot’s Advantage FLEX DSCR program, the Debt Service Coverage Ratio (DSCR) is NOT based on net operating income (NOI).",
        "",
        "Instead, the program defines DSCR as:",
        "",
        "  DSCR = RENTAL INCOME ÷ proposed PITIA/ITIA",
        "",
        "Key points specific to LoanDepot:",
        "- RENTAL INCOME is used directly in the numerator; you do NOT subtract operating expenses to create NOI for LoanDepot’s DSCR calculation.",
        "- PITIA/ITIA includes principal, interest, property taxes, homeowner’s insurance, and HOA dues if applicable.",
        "- Because of this structure, you should never describe LoanDepot’s Advantage FLEX DSCR as “NOI ÷ debt service” or say that it follows “standard NOI-based industry practices.”",
        "",
        "Rental income sourcing (high-level summary):",
        "- For long-term rentals, qualifying rental income is generally based on the LOWER of:",
        "  • the executed lease agreement, or",
        "  • the market rent indicated on the appraisal rent schedule (e.g., Form 1007/1025).",
        "- For permitted short-term rental structures, the guide allows use of a short-term rental analysis or documented STR receipts per the current Advantage FLEX DSCR requirements.",
        "",
        "Program scope:",
        "- Business-purpose, non-owner-occupied investment properties only.",
        "- The subject property may not be occupied by the borrower, any member of the borrower’s LLC, or a family member.",
        "- Borrowers are qualified primarily on the property’s DSCR rather than a traditional personal DTI calculation.",
        "",
        "Risk-layering items such as minimum DSCR thresholds, maximum LTV by DSCR band, FICO minimums, and reserve requirements must always be taken from the current LoanDepot Advantage FLEX DSCR matrix for the specific lock date.",
        "",
        "If you compare LoanDepot to generic DSCR lenders, you can note that many other lenders use NOI ÷ debt service as a generic DSCR definition, but LoanDepot’s Advantage FLEX DSCR is explicitly based on RENTAL INCOME ÷ PITIA and does not use NOI in its DSCR formula."
    ].join("\n");
}
