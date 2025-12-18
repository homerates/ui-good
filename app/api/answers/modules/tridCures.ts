// app/api/answers/modules/tridCures.ts
// Deterministic override for TRID "cures" / "cost to cure" (fees disclosure tolerances)
// This prevents the appraisal/repair meaning of "cure" from hijacking TRID questions.

type TridCureOverride = {
    ok: true;
    tag: "trid_cures_v1";
    answerMarkdown: string;
    message: string;
};

function norm(s: string) {
    return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(haystack: string, needles: string[]) {
    return needles.some((n) => haystack.includes(n));
}

export function maybeBuildTridCureOverride(questionRaw: string): TridCureOverride | null {
    const q = norm(questionRaw);
    if (!q) return null;

    // Strong TRID / disclosure signals
    const tridSignals = [
        "trid",
        "tila",
        "respa",
        "loan estimate",
        "closing disclosure",
        "le ",
        " cd",
        "tolerance",
        "10% bucket",
        "zero tolerance",
        "cure",
        "cost to cure",
        "changed circumstance",
        "redisclose",
        "redisclosure",
        "lender credit",
        "fees disclosed",
    ];

    // “Cure” is ambiguous (repairs vs TRID). Require at least one disclosure/tolerance signal
    const disclosureContextSignals = [
        "loan estimate",
        "closing disclosure",
        "le",
        "cd",
        "tolerance",
        "trid",
        "tila",
        "respa",
        "change of circumstance",
        "redisclose",
        "fee",
        "fees",
        "lender credit",
    ];

    const isAboutCure = q.includes("cure");
    const isAboutCostToCure = q.includes("cost to cure");
    const isTridFeeContext =
        hasAny(q, tridSignals) && (hasAny(q, disclosureContextSignals) || isAboutCostToCure);

    if (!isTridFeeContext) return null;

    const message =
        "In TRID, a ‘cure’ is a lender-paid credit that fixes a disclosure tolerance violation (it’s about fees on the LE/CD, not appraisal repairs).";

    const answerMarkdown = `**Cures and Cost to Cure (TRID fees disclosure)**

**Big picture**
Under TRID, certain closing costs must be disclosed on the **Loan Estimate (LE)** and then tracked through to the **Closing Disclosure (CD)** within specific **tolerance limits**.  
If the final charges exceed what TRID allows (and there was no valid Change of Circumstance), the lender must make the borrower whole. That fix is called a **cure**.

**What is a “cure”?**
A **cure** is a **lender credit** given to the borrower when fees end up higher than TRID allows compared to the LE.  
It typically appears on the CD as a **lender credit** and reduces the borrower’s cash to close.

**What is “cost to cure”?**
**Cost to cure** is the **dollar amount the lender must pay** (via credit) to bring the loan back into TRID tolerance compliance.  
It is a **lender expense**, not a borrower fee.

**How cures tie to fee “tolerance buckets”**
1) **Zero tolerance (cannot increase at all)**
- Examples commonly include lender/broker charges and certain transfer taxes.
- If these increase even by $1 beyond what TRID permits, the lender cures the full overage.

2) **10% aggregate tolerance (combined bucket)**
- Certain third-party fees can increase, but the total of that bucket generally cannot exceed a 10% increase.
- If the bucket exceeds the allowed amount, the lender cures the amount over the limit.

3) **No tolerance (can change)**
- Items like prepaids/escrows (taxes, insurance, prepaid interest) can change based on actuals.
- No cure is required unless the increase is due to a lender disclosure error.

**Where the borrower sees it**
Look on the **Closing Disclosure** for a **lender credit** (or a line item offset) that reduces cash to close.

**One-sentence borrower explanation**
“If certain fees come in higher than what was originally disclosed and allowed by law, the lender must credit the difference back to you. That credit is the cure, and the amount is the cost to cure.”

**Disclosure**
Educational only, not financial advice. Fee treatment can vary by transaction details and lender process; actual CD controls.
`;

    return { ok: true, tag: "trid_cures_v1", answerMarkdown, message };
}
