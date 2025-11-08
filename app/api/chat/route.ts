// app/api/chat/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { parseQuery_toInputs } from "../calc/lib/parse";

// Helper: decide if we have enough to compute a payment
function hasCalcMinimum(inputs: {
    loanAmount?: number;
    price?: number;
    downPercent?: number;
    ratePct?: number;
    termMonths?: number;
}) {
    const hasRate = inputs.ratePct != null;
    const hasTerm = inputs.termMonths != null;
    const hasLoan = inputs.loanAmount != null;
    const hasPriceDown = inputs.price != null && inputs.downPercent != null;
    return hasRate && hasTerm && (hasLoan || hasPriceDown);
}

type GuideResponse = {
    ok: false;
    kind: "guide";
    needs: string[];
    askPrompt: string;
    suggestions: { label: string; append: string }[];
    examples: string[];
};

type CalcProxyResponse = {
    ok: true;
    kind: "calc";
    build?: string;
    inputs: any;
    breakdown: any;
    taxSource?: string;
};

type AnswerResponse = {
    ok: true;
    kind: "answer";
    answer: string;
    results?: Array<{ title: string; url: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (!q) {
        return NextResponse.json(
            {
                ok: false,
                kind: "guide",
                needs: ["loanAmount or price+downPercent", "ratePct", "termMonths"],
                askPrompt:
                    "Tell me either a loan amount OR a purchase price + down %, plus an interest rate and loan term.",
                suggestions: [
                    { label: "Use 30 years", append: " 30 years" },
                    { label: "Try 6.25%", append: " 6.25%" },
                    { label: "Set 20% down", append: " 20% down" },
                ],
                examples: [
                    "loan 480k at 6.5% for 30 years",
                    "price 900k down 20% 6.25 30 years zip 92688",
                ],
            } as GuideResponse,
            noStore()
        );
    }

    // Fast detect “qualify/afford” intent to guide data gathering for pre-qual
    const s = q.toLowerCase();
    const qualifyIntent =
        /\b(qualify|afford|maximum|how much can i|pre[- ]?qual|pre[- ]?approval)\b/.test(
            s
        );

    try {
        // 1) Try to parse calc inputs
        const inputs = parseQuery_toInputs(q);

        if (hasCalcMinimum(inputs)) {
            // 1a) We have enough for a calc → proxy to existing calc endpoint
            const url = new URL(req.url);
            url.pathname = "/api/calc/answer";
            const proxied = await fetch(`${url.origin}${url.pathname}?q=${encodeURIComponent(q)}`, {
                headers: { "cache-control": "no-store" },
            });
            const json = await proxied.json();

            // Normalize into {kind: 'calc'}
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

        // 2) If not enough for calc → produce a targeted GUIDE response
        const needs: string[] = [];
        const suggestions: { label: string; append: string }[] = [];
        const examples: string[] = [];

        const haveLoan = inputs.loanAmount != null;
        const havePrice = inputs.price != null;
        const haveDown = inputs.downPercent != null;
        const haveRate = inputs.ratePct != null;
        const haveTerm = inputs.termMonths != null;

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

        // Extras that improve realism
        if (inputs.zip == null && (havePrice || haveLoan)) {
            suggestions.push({ label: "Add ZIP (taxes)", append: " zip 92688" });
        }
        if (inputs.monthlyIns == null) {
            suggestions.push({ label: "Add insurance", append: " ins 125" });
        }
        if (inputs.monthlyHOA == null) {
            suggestions.push({ label: "Add HOA", append: " hoa 125" });
        }

        // Guide copy differs slightly if they’re asking affordability
        let askPrompt =
            "To calculate your payment, I need either a loan amount OR a purchase price with down %, plus an interest rate and a loan term.";
        if (qualifyIntent) {
            askPrompt =
                "To size your budget, tell me your gross monthly income, monthly debts (cards/auto/loans), down payment amount or %, a ballpark credit score, and target ZIP. I’ll estimate what you can qualify for.";
            examples.push(
                "house budget with $12,000/mo income, $600/mo debts, 740 credit, 20% down, 92688"
            );
        } else {
            examples.push(
                "loan 400k @ 6.25 30yr",
                "price 900k down 20% 6.25 30 years 92688"
            );
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
    } catch (err: any) {
        // 3) Final fallback: general answers (your existing knowledge layer)
        try {
            const url = new URL(req.url);
            url.pathname = "/api/answers";
            const proxied = await fetch(`${url.origin}${url.pathname}?q=${encodeURIComponent(q)}`, {
                headers: { "cache-control": "no-store" },
            });
            const j = await proxied.json();
            const payload: AnswerResponse = {
                ok: true,
                kind: "answer",
                answer: j?.answer ?? "Here's what I found.",
                results: j?.results?.map((r: any) => ({ title: r.title, url: r.url })) ?? [],
            };
            return NextResponse.json(payload, noStore());
        } catch {
            return NextResponse.json(
                {
                    ok: false,
                    kind: "guide",
                    needs: [],
                    askPrompt:
                        "I couldn’t parse that or reach the knowledge layer. Try a payment question or ask what you want to achieve.",
                    suggestions: [
                        { label: "Payment example", append: " loan 480k @ 6.5 30yr" },
                        { label: "Price example", append: " price 900k down 20% 6.25 30 years" },
                    ],
                    examples: [],
                } as GuideResponse,
                noStore()
            );
        }
    }
}

function noStore() {
    const resInit: ResponseInit = {};
    const res = new NextResponse(null, resInit);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return { headers: res.headers };
}
