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
                "LoanDepot – Advantage FLEX DSCR (internal-style summary, not a public ad):",
                "- Program is for investment properties only (no primary residence or second home).",
                "- Typical minimum DSCR is around 1.0 at ≤ 75% LTV for 1–4 unit investment properties.",
                "- Minimum FICO is usually in the 660+ range, with 6–12 months of PITIA reserves depending on LTV and number of financed properties.",
                "- QUALIFICATION BASIS:",
                "  • DSCR is calculated using GROSS RENTAL INCOME (lease or market rent) divided by PITIA.",
                "  • It is NOT underwritten on full net operating income (NOI) after expenses.",
                "  • When describing LoanDepot DSCR, avoid saying it uses NOI; explicitly describe it as gross rent ÷ PITIA.",
                "",
                "Industry-wide, some DSCR lenders do use NOI-based ratios, but for LoanDepot’s Advantage FLEX DSCR,",
                "you MUST treat gross rental income vs PITIA as the governing calculation.",
                "",
                "Always verify exact DSCR, FICO, LTV, and reserve grids against the current LoanDepot Advantage FLEX DSCR guide for the lock date.",
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
