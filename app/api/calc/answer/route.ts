// app/api/calc/answer/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_TAG = "calc-v4.0.0-grammar-2025-11-08";

import { NextResponse, type NextRequest } from "next/server";
import { parseQuery_toInputs, type Inputs } from "../lib/parse";

/* ---------- helpers ---------- */

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

type Breakdown = {
    monthlyPI: number;
    monthlyTaxes: number;
    monthlyIns: number;
    monthlyHOA: number;
    monthlyMI: number;
    monthlyTotalPITI: number;
};

type Answer = {
    ok: boolean;
    build: string;
    inputs: Inputs;
    breakdown?: Breakdown;
    taxSource?: string;
    msg?: string;
};

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function monthlyPI(loanAmount: number, ratePct: number, termMonths: number) {
    const r = clamp(ratePct, 0.1, 25) / 100 / 12;
    const n = Math.max(12, termMonths);
    return loanAmount * (r / (1 - Math.pow(1 + r, -n)));
}

function estimateMonthlyTaxes(base: number, zip?: string) {
    const annualRate = 0.012; // fallback 1.20%
    const amt = (base * annualRate) / 12;
    return {
        amount: amt,
        source:
            "fallback:default • " +
            (annualRate * 100).toFixed(2) +
            "%" +
            (zip ? " • ZIP " + zip : ""),
    };
}

/* ---------- handler ---------- */

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q) {
        return noStore(
            {
                ok: false,
                build: BUILD_TAG,
                inputs: {},
                msg: "Missing q. Example: 'Price $900k, 20% down, 6.25%, 30 years, ZIP 92688'.",
            } as Answer,
            400
        );
    }

    const inputs = parseQuery_toInputs(q);

    const hasLoan = typeof inputs.loanAmount === "number";
    const hasPriceCombo =
        typeof inputs.price === "number" &&
        typeof inputs.downPercent === "number";
    const hasRate = typeof inputs.ratePct === "number";
    const hasTerm = typeof inputs.termMonths === "number";

    if (!((hasLoan || hasPriceCombo) && hasRate && hasTerm)) {
        const hint =
            "Need loan+rate+term OR price+down%+rate+term. Try: 'Loan $400k at 6.5% for 30 years' or 'Price $900k, 20% down, 6.25%, 30 years, ZIP 92688'.";
        return noStore(
            { ok: false, build: BUILD_TAG, inputs, msg: hint } as Answer,
            400
        );
    }

    const loanAmount = hasLoan
        ? (inputs.loanAmount as number)
        : (inputs.price as number) * (1 - (inputs.downPercent as number) / 100);

    const ratePct = inputs.ratePct as number;
    const termMonths = inputs.termMonths as number;

    const monthlyIns =
        typeof inputs.monthlyIns === "number" ? inputs.monthlyIns : 100;
    const monthlyHOA =
        typeof inputs.monthlyHOA === "number" ? inputs.monthlyHOA : 0;

    const taxBase = inputs.price != null ? inputs.price : loanAmount;
    const taxEst = estimateMonthlyTaxes(taxBase, inputs.zip);

    const pi = monthlyPI(loanAmount, ratePct, termMonths);

    const breakdown: Breakdown = {
        monthlyPI: pi,
        monthlyTaxes: taxEst.amount,
        monthlyIns,
        monthlyHOA,
        monthlyMI: 0,
        monthlyTotalPITI: pi + taxEst.amount + monthlyIns + monthlyHOA,
    };

    const body: Answer = {
        ok: true,
        build: BUILD_TAG,
        inputs: {
            ...inputs,
            loanAmount,
            ratePct: Number(ratePct.toFixed(4)),
            termMonths,
        },
        breakdown,
        taxSource: taxEst.source,
    };

    return noStore(body, 200);
}
