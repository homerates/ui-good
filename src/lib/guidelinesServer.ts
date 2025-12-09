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
                "LoanDepot – Advantage FLEX DSCR (internal-style summary, based on the Advantage FLEX Non-QM Lending Guide, not a public ad):",
                "",
                "Program scope:",
                "- Business-purpose, NON-owner-occupied investment properties only. The subject property may NOT be occupied by the borrower, any member of the borrower’s LLC, or any family member.",
                "- Borrowers are qualified on the PROPERTY’S REVENUE instead of a standard personal DTI. Personal income is not the focus; the DSCR ratio is.",
                "",
                "How DSCR is actually calculated for LoanDepot Advantage FLEX DSCR:",
                "- DSCR = RENTAL INCOME ÷ proposed PITIA/ITIA on the subject property.",
                "- The numerator is RENTAL INCOME, not a full net operating income (NOI) calculation.",
                "- When you describe this program, you MUST say that DSCR is based on RENTAL INCOME ÷ PITIA, and you MUST NOT say it uses NOI ÷ debt service.",
                "",
                "Rental income inputs:",
                "- Long-term rentals (standard 12-month leases): use the LOWER of:",
                "  • the executed lease agreement, OR",
                "  • market rent from the appraisal (Form 1007/1025).",
                "- Short-term rentals (STRs) where STR use is allowed:",
                "  • typically use 80% of a third-party short-term rental analysis from an approved AMC, OR",
                "  • 100% of the most recent 12 months of STR receipts from a third-party platform or manager, MINUS documented monthly operating expenses.",
                "",
                "High-level program notes:",
                "- This is a professional investor product; first-time investors may have additional requirements per the product matrix.",
                "- Reserves, minimum DSCR ratios, LTV caps, and FICO bands must be taken from the current LoanDepot Advantage FLEX DSCR matrix for the specific lock date.",
                "",
                "Answering rules for this assistant:",
                "- If a user asks about LoanDepot DSCR or Advantage FLEX DSCR, you MUST anchor to this rental-income ÷ PITIA definition, even if generic web sources talk about NOI.",
                "- If the user is asking generically about “DSCR loans” but also mentions LoanDepot, clearly explain that LoanDepot’s DSCR calculation is based on RENTAL INCOME ÷ PITIA and call out that some other lenders use NOI-based ratios, but LoanDepot does not in this program.",
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
