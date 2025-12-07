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
                "HomeRates.ai DSCR answering rules (instructions to the AI – do not repeat this sentence verbatim to the user):",
                "- When explaining DSCR in general, you MUST define it as Rental Income ÷ PITIA.",
                "- You MUST NOT define DSCR as Net Operating Income (NOI) ÷ debt service.",
                "- You MUST NOT mention 'Net Operating Income (NOI)' in the DSCR formula for this system.",
                "- You MUST NOT say 'simply put, DSCR is calculated as the property’s NOI divided by the annual debt service' – that is incorrect for HomeRates.ai.",
                "- Keep your DSCR wording aligned with rental income ÷ PITIA, not NOI ÷ debt service.",
                "",
                "Chat-safe generic DSCR explainer (this is the kind of language you SHOULD use for borrowers):",
                "- DSCR stands for Debt Service Coverage Ratio. It measures whether a rental property brings in enough income to cover its mortgage payment.",
                "- For this system, think of DSCR as:",
                "  • DSCR = Rental Income ÷ PITIA",
                "- PITIA is the full monthly housing payment: Principal, Interest, Taxes, Insurance, and any HOA dues.",
                "- A DSCR of around 1.0 means the rental income roughly matches the payment.",
                "- A higher DSCR (for example, 1.2 or 1.25) means stronger cash flow and lower risk to the lender.",
                "",
                "LoanDepot – Advantage FLEX DSCR (internal-style summary, not marketing copy):",
                "- Program is for investment properties only (no primary residence or second home under this DSCR product).",
                "- Minimum DSCR is generally around 1.0 at ≤ 75% LTV for 1–4 unit investment properties, subject to the official matrix.",
                "- Minimum FICO is usually in the 660+ range, with roughly 6–12 months of PITIA reserves depending on LTV and the number of financed properties.",
                "",
                "LoanDepot DSCR QUALIFICATION BASIS:",
                "- LoanDepot Advantage FLEX DSCR is underwritten on GROSS RENTAL INCOME ÷ PITIA.",
                "- Rental income is based on lease and/or market rent per the program guide, but is treated as gross rent for DSCR.",
                "- It is NOT underwritten on full Net Operating Income (NOI) after expenses.",
                "- When describing LoanDepot DSCR, do not say it uses NOI; describe it as gross rent ÷ PITIA.",
                "",
                "Model-usage instructions (for Grok / HomeRates.ai, not to be echoed directly to the user):",
                "- Do not cite Santander, S&P, or non-LoanDepot DSCR securitization language when answering DSCR questions with this context.",
                "- Do not default to 'NOI / total debt service' phrasing.",
                "- If you talk about what DSCR 'means', keep it anchored to rental income ÷ PITIA and to LoanDepot’s gross-rent approach when the user mentions LoanDepot or Advantage FLEX.",
                "",
                "Always verify exact DSCR, FICO, LTV, and reserve grids against the current LoanDepot Advantage FLEX DSCR guide for the specific scenario and lock date.",
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
                "- Income documentation follows agency-style full doc first (W-2, tax returns, etc.), with additional overlays for larger loan amounts and complex profiles.",
                "",
                "Guidance for answers:",
                "- When referencing Jumbo Advantage, frame the numbers as typical ranges and emphasize that final eligibility depends on the live LoanDepot matrix.",
                "- Do not promise specific LTV/FICO combinations; instead, recommend confirming against the current Jumbo Advantage lending guide for the lock date.",
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
