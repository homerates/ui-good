// ==== REPLACE ENTIRE FILE: app/api/chat/route.ts ====
import { NextRequest, NextResponse } from "next/server";
import { parseQuery_toInputs } from "../calc/lib/parse";

/* ========= Types ========= */
type Inputs = {
    loanAmount?: number;
    price?: number;
    downPercent?: number;
    ratePct?: number;
    termMonths?: number;
    zip?: string;
    monthlyIns?: number;
    monthlyHOA?: number;
};

type CalcProxyResponse = {
    ok: true;
    kind: "calc";
    build: string;
    inputs: Inputs;
    breakdown: {
        monthlyPI: number;
        monthlyTaxes: number;
        monthlyIns: number;
        monthlyHOA: number;
        monthlyMI: number;
        monthlyTotalPITI: number;
    };
    taxSource?: string;
};

type GuideResponse = {
    ok: false;
    kind: "guide";
    needs: string[];
    askPrompt: string;
    suggestions: { label: string; append: string }[];
    examples: string[];
};

type AnswerResponse = {
    ok: true;
    kind: "answer";
    answer: string;
    results?: { title: string; url: string }[];
};

function noStore(): ResponseInit {
    return { headers: { "Cache-Control": "no-store" } };
}

function hasCalcMinimum(i?: Inputs | null): boolean {
    if (!i) return false;
    const hasLoan = i.loanAmount != null && i.ratePct != null && i.termMonths != null;
    const hasPriceDown =
        i.price != null && i.downPercent != null && i.ratePct != null && i.termMonths != null;
    return hasLoan || hasPriceDown;
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();

    // If no query → guide immediately
    if (!q) {
        const guide: GuideResponse = {
            ok: false,
            kind: "guide",
            needs: ["loanAmount OR (price + down%)", "ratePct", "termMonths"],
            askPrompt:
                "To calculate your payment, I need either a loan amount OR a purchase price with down %, plus an interest rate and a loan term.",
            suggestions: [
                { label: "Set loan amount", append: " loan 480k" },
                { label: "Try 6.25%", append: " 6.25%" },
                { label: "Use 30 years", append: " 30 years" },
            ],
            examples: ["loan 400k @ 6.25 30yr", "price 900k down 20% 6.25 30 years 92688"],
        };
        return NextResponse.json(guide, noStore());
    }

    /* ===== CALC-FIRST: parse -> calc or guide ===== */
    let inputs: Inputs | null = null;
    try {
        inputs = parseQuery_toInputs(q);
    } catch {
        inputs = null; // never drop to answers on parse problems
    }

    if (inputs && hasCalcMinimum(inputs)) {
        // Proxy to canonical calc endpoint (keeps math in one place)
        const cUrl = new URL(req.url);
        cUrl.pathname = "/api/calc/answer";
        const proxied = await fetch(`${cUrl.origin}${cUrl.pathname}?q=${encodeURIComponent(q)}`, {
            headers: { "cache-control": "no-store" },
        });
        const json = await proxied.json();
        const payload: CalcProxyResponse = {
            ok: true,
            kind: "calc",
            build: json.build,
            inputs: json.inputs,
            breakdown: json.breakdown,
            taxSource: json.taxSource,
        };
        return NextResponse.json(payload, noStore());
    }

    // Not enough to compute → targeted GUIDE (this short-circuits before answers)
    {
        const needs: string[] = [];
        const suggestions: { label: string; append: string }[] = [];
        const examples: string[] = [];

        const haveLoan = !!inputs?.loanAmount;
        const havePrice = !!inputs?.price;
        const haveDown = !!inputs?.downPercent;
        const haveRate = !!inputs?.ratePct;
        const haveTerm = !!inputs?.termMonths;

        if (!haveLoan && !(havePrice && haveDown)) {
            needs.push("loanAmount OR (price + down%)");
            if (havePrice && !haveDown) {
                suggestions.push({ label: "Add 20% down", append: " 20% down" });
            } else if (!havePrice && haveDown) {
                suggestions.push({ label: "Add a price", append: " price 750k" });
            } else {
                suggestions.push({ label: "Set loan amount", append: " loan 480k" });
                suggestions.push({ label: "Or set price+down", append: " price 900k down 20%" });
            }
        }
        if (!haveRate) {
            needs.push("ratePct");
            suggestions.push({ label: "Try 6.25%", append: " 6.25%" });
        }
        if (!haveTerm) {
            needs.push("termMonths");
            suggestions.push({ label: "Use 30 years", append: " 30 years" });
        }

        if ((inputs?.price || inputs?.loanAmount) && inputs?.zip == null) {
            suggestions.push({ label: "Add ZIP (taxes)", append: " zip 92688" });
        }
        if (inputs?.monthlyIns == null) suggestions.push({ label: "Add insurance", append: " ins 125" });
        if (inputs?.monthlyHOA == null) suggestions.push({ label: "Add HOA", append: " hoa 125" });

        const s = q.toLowerCase();
        const qualifyIntent =
            /\b(qualify|afford|maximum|how much can i|pre[- ]?qual|pre[- ]?approval)\b/.test(s);

        let askPrompt =
            "To calculate your payment, I need either a loan amount OR a purchase price with down %, plus an interest rate and a loan term.";
        if (qualifyIntent) {
            askPrompt =
                "To size your budget, tell me your gross monthly income, monthly debts (cards/auto/loans), down payment amount or %, a ballpark credit score, and target ZIP. I’ll estimate what you can qualify for.";
            examples.push("house budget with $12,000/mo income, $600/mo debts, 740 credit, 20% down, 92688");
        } else {
            examples.push("loan 400k @ 6.25 30yr", "price 900k down 20% 6.25 30 years 92688");
        }

        const guide: GuideResponse = {
            ok: false,
            kind: "guide",
            needs,
            askPrompt,
            suggestions,
            examples,
        };
        return NextResponse.json(guide, noStore());
    }

    /* ===== Answers layer (only if query had zero calc signal AND we didn't early-return above) ===== */
    // This code is intentionally unreachable for calc-like prompts because we already returned calc or guide.
    // Kept here as a final safeguard if you later add other endpoints above.
}
// ==== END FILE ====
