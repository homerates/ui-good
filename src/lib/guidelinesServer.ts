// src/lib/guidelinesServer.ts

/**
 * Minimal "Lender Guideline Brain" stub.
 *
 * Phase 1:
 * - No DB, no PDF parsing yet.
 * - Two responsibilities:
 *   1) Provide lender-style guideline context for Grok (where safe).
 *   2) Provide hard override answers for specific topics (like DSCR),
 *      so we don't let the model hallucinate formulas we don't want.
 *
 * Later we can replace this with Supabase + PDF/RAG without changing callers.
 */

function normalizeQuestion(rawQuestion: string | null | undefined): string {
    return (rawQuestion ?? "").trim().toLowerCase();
}

/**
 * Hard override for DSCR questions.
 *
 * If this returns a non-null string, the caller should skip the model
 * and return this text directly to the user.
 */
export function maybeBuildDscrOverrideAnswer(rawQuestion: string): string | null {
    const q = normalizeQuestion(rawQuestion);
    if (!q) return null;

    const mentionsDscr =
        q.includes("dscr") || q.includes("debt service coverage");

    if (!mentionsDscr) return null;

    const mentionsLoanDepot =
        q.includes("loandepot") ||
        q.includes("loan depot") ||
        q.includes("advantage flex");

    if (mentionsLoanDepot) {
        return buildLoanDepotDscrAnswer();
    }

    // Generic DSCR explainer for "any lender" style questions.
    return buildGenericDscrAnswer();
}

/**
 * Generic DSCR explanation (no NOI, safe for "any lender").
 */
function buildGenericDscrAnswer(): string {
    return [
        "**What DSCR means for an investor (any lender)**",
        "",
        "DSCR stands for **Debt Service Coverage Ratio**. It is a way for lenders to measure whether a rental or investment property brings in enough income to cover its mortgage payment.",
        "",
        "For this system, you can think of DSCR as:",
        "",
        "```text",
        "DSCR = Rental Income ÷ PITIA",
        "```",
        "",
        "Where:",
        "- **Rental Income** is the lender-accepted monthly rent for the property (for example, lease rent or market rent).",
        "- **PITIA** is the full monthly housing payment:",
        "  - Principal",
        "  - Interest",
        "  - Taxes",
        "  - Insurance",
        "  - HOA dues (if any)",
        "",
        "How to read the ratio:",
        "- **DSCR ≈ 1.0** – the rental income roughly covers the full payment.",
        "- **DSCR above 1.0** – the property generates more income than the payment, which usually means stronger cash flow and lower risk.",
        "- **DSCR below 1.0** – the property does not fully cover the payment; the investor would need to bring in money from other sources to make up the difference.",
        "",
        "Different lenders set different minimum DSCR requirements. Some will allow DSCR below 1.0 with tighter terms or lower maximum LTV, while others want DSCR at or above 1.0 for standard pricing.",
        "",
        "As an investor, DSCR is essentially the lender asking:",
        "",
        "> \"Does this property pay for itself, and how comfortably does it do that?\"",
    ].join("\n");
}

/**
 * LoanDepot-specific DSCR explanation (Advantage FLEX DSCR).
 * This is the authoritative wording for HomeRates.ai.
 */
function buildLoanDepotDscrAnswer(): string {
    return [
        "**How DSCR is calculated for LoanDepot’s Advantage FLEX DSCR program**",
        "",
        "For LoanDepot’s **Advantage FLEX DSCR** program, DSCR is used to qualify **investment properties only** (not primary residences or second homes under this product). The goal is to see whether the property’s rental income can support the full mortgage payment.",
        "",
        "For this program, you should think of DSCR as:",
        "",
        "```text",
        "DSCR = Gross Rental Income ÷ PITIA",
        "```",
        "",
        "Where:",
        "- **Gross Rental Income** is the qualifying rent used by LoanDepot (based on lease and/or market rent per the program guide). It is treated as **gross rent**, not net after expenses.",
        "- **PITIA** is the full monthly housing payment for the subject property:",
        "  - Principal",
        "  - Interest",
        "  - Taxes",
        "  - Insurance",
        "  - HOA dues (if applicable)",
        "",
        "Key points for LoanDepot Advantage FLEX DSCR:",
        "- The program is designed for **1–4 unit investment properties**.",
        "- Minimum DSCR is generally around **1.0** at up to **75% LTV**, subject to the live product matrix.",
        "- Minimum FICO is typically in the **660+** range, with about **6–12 months of PITIA reserves**, depending on LTV and the number of financed properties.",
        "- The program is **not** underwritten on full Net Operating Income (NOI) after operating expenses.",
        "",
        "That means you should **not** describe LoanDepot DSCR as:",
        "",
        "> \"NOI divided by annual debt service\"",
        "",
        "Instead, for LoanDepot Advantage FLEX DSCR, the correct framing is:",
        "",
        "> \"Gross rental income divided by the full monthly PITIA payment.\"",
        "",
        "For any specific scenario, the exact allowed DSCR, LTV, FICO, and reserve requirements must be confirmed against the current **LoanDepot Advantage FLEX DSCR** product guide for the lock date.",
    ].join("\n");
}

/**
 * Guideline context provider (still useful for other products later).
 *
 * For now this mostly backs up DSCR & Jumbo with additional ranges and
 * \"how to answer\" hints for the model, but DSCR itself should be
 * hard-overridden via maybeBuildDscrOverrideAnswer above.
 */
export async function getGuidelineContextForQuestion(
    rawQuestion: string
): Promise<string> {
    const q = normalizeQuestion(rawQuestion);
    if (!q) return "";

    const chunks: string[] = [];

    // === LoanDepot DSCR (Advantage FLEX DSCR) ===
    if (q.includes("dscr") || q.includes("debt service coverage")) {
        chunks.push(
            [
                "LoanDepot – Advantage FLEX DSCR (internal-style summary, not marketing copy):",
                "- Program is for investment properties only (no primary residence or second home under this DSCR product).",
                "- Minimum DSCR is generally around 1.0 at ≤ 75% LTV for 1–4 unit investment properties, subject to the official matrix.",
                "- Minimum FICO is usually in the 660+ range, with roughly 6–12 months of PITIA reserves depending on LTV and the number of financed properties.",
                "- Qualification is based on **gross rental income ÷ PITIA**, not NOI ÷ debt service.",
                "",
                "Always verify exact DSCR, FICO, LTV, and reserve grids against the current LoanDepot Advantage FLEX DSCR guide for the scenario and lock date.",
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
                "LoanDepot – Jumbo Advantage (internal-style summary, not marketing copy):",
                "- Jumbo Advantage is designed for larger loan amounts above standard agency limits.",
                "- Typical max LTV bands (subject to exact product matrix and date):",
                "  • Around 80% LTV for strong primary residence borrowers.",
                "  • Around 75% LTV for second homes.",
                "  • Often 70% LTV or lower for investment properties.",
                "- Preferred FICO is usually 700+ with roughly 6–12 months of PITIA reserves, scaling by loan size and number of financed properties.",
                "- Income documentation follows agency-style full doc first, with overlays for larger loan amounts and complex profiles.",
                "",
                "Exact LTV/FICO/reserve grids MUST be confirmed from the live LoanDepot Jumbo Advantage lending guide for the scenario and lock date.",
            ].join("\n")
        );
    }

    if (!chunks.length) {
        // No lender-specific match – let the model fall back to agency/public baselines.
        return "";
    }

    return chunks.join("\n\n");
}
