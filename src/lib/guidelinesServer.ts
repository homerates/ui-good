// src/lib/guidelinesServer.ts

/**
 * Minimal "Lender Guideline Brain" stub.
 *
 * Phase 1:
 * - No DB, no PDF parsing yet.
 * - Just returns hard-coded, clearly labeled LoanDepot guideline context
 *   for DSCR / Jumbo style questions so we can see how it behaves in answers.
 *
 * Later we can replace this with Supabase + PDF/RAG without changing callers.
 */

export async function getGuidelineContextForQuestion(
    rawQuestion: string
): Promise<string> {
    if (!rawQuestion) return "";

    const q = rawQuestion.toLowerCase();
    const chunks: string[] = [];

    // Very rough matching for DSCR / investor scenarios
    if (q.includes("dscr") || q.includes("debt service coverage")) {
        chunks.push(
            [
                "LoanDepot – Advantage FLEX DSCR (internal-style summary, not a public ad):",
                "- Designed for investment properties only (no primary / second home).",
                "- Typical minimum DSCR around 1.0 at ≤ 75% LTV for 1–4 unit investment properties.",
                "- Minimum FICO often in the 660+ range, with 6–12 months of PITIA reserves depending on LTV and number of properties.",
                "- Uses property cash flow (rent vs PITIA) instead of personal DTI for qualification.",
                "",
                "Always verify exact DSCR, FICO, LTV, and reserve requirements against the current LoanDepot Advantage FLEX DSCR guide for the scenario date.",
            ].join("\n")
        );
    }

    // Very rough matching for Jumbo / Jumbo Advantage style scenarios
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
                "  • Around 75% for second homes.",
                "  • Often 70% or lower for investment properties.",
                "- Preferred FICO usually 700+, with 6–12 months reserves scaling by loan size and property count.",
                "- Income documentation follows agency-style full doc first, then overlays for large loan amounts and complex profiles.",
                "",
                "Exact LTV/FICO/reserve grids *must* be pulled from the live LoanDepot Jumbo Advantage lending guide for the lock date.",
            ].join("\n")
        );
    }

    if (!chunks.length) {
        // No lender-specific match – let the model fall back to agency/public baselines.
        return "";
    }

    return chunks.join("\n\n");
}
