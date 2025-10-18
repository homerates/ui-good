import { NextResponse } from "next/server";

type Mode = "borrower" | "public";
type Intent = "" | "purchase" | "refi" | "investor";

function classifyPath(q: string): "concept" | "market" | "dynamic" {
  const s = q.toLowerCase();
  if (/(dti|pmi|fha|points|escrow|llpa|mi|amort|debt|income|ratio)/.test(s)) return "concept";
  if (/(rate|rates|10[- ]?year|treasury|mortgage|spread|lock|float|market)/.test(s)) return "market";
  return "dynamic";
}

function monthlyDeltaPerQuarterPoint(loanAmount: number) {
  return Math.round((loanAmount * 0.0025) / 12);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question: string = (body.question ?? "").toString();
    const mode: Mode = body.mode === "public" ? "public" : "borrower";
    const intent: Intent = (body.intent ?? "") as Intent;
    const loanAmount: number | undefined =
      typeof body.loanAmount === "number" && body.loanAmount > 0 ? body.loanAmount : undefined;

    const path = classifyPath(question);
    const usedFRED = false;
    const lockBias: "Mild Lock" | "Neutral" | "Float Watch" =
      path === "market" ? "Mild Lock" : "Neutral";
    const confidence: "low" | "med" | "high" = "med";

    const tldr: string[] = [];
    const bullets: string[] = [];
    const nexts: string[] = [];
    let borrowerSummaryLines: string[] = [];

    if (path === "concept") {
      tldr.push("Plain-English explainer + quick math", "Next steps tailored to your intent");
      bullets.push(
        "Key idea in 15 seconds",
        "Rule-of-thumb you can actually use",
        "Caveats lenders care about"
      );
      nexts.push("Give me your price range, down payment, and credit band to tailor numbers.");
      if (intent === "purchase") nexts.push("We can pre-flight DTI with your income + debts.");
      if (intent === "refi") nexts.push("Well compare current P&I vs new P&I + costs.");
    }

    if (path === "market") {
      tldr.push("Rates track the 10-year over time, but spreads shift with risk/cost.");
      bullets.push(
        "Watch the 10-year trend, not just todays print",
        "Lock when timeline is tight; float only with cushion"
      );
      nexts.push("Tell me your lock window (e.g., 1545 days).");
      if (loanAmount) nexts.push("Ill quantify $/mo impact for 0.25% around today.");
    }

    let paymentDelta:
      | { perQuarterPt: number; loanAmount: number }
      | undefined;

    if (loanAmount) {
      paymentDelta = {
        perQuarterPt: monthlyDeltaPerQuarterPoint(loanAmount),
        loanAmount,
      };
      bullets.push(Every 0.25%  Out-Null{paymentDelta.perQuarterPt}/mo on Out-Null{loanAmount.toLocaleString()});
    }

    borrowerSummaryLines = [
      " Loan purpose: " + (intent || "auto-detect"),
      " Mode: " + mode,
      loanAmount ?  Target loan: Out-Null{loanAmount.toLocaleString()} : " Target loan: (optional)",
      " Lock stance: " + lockBias,
    ];

    const answer =
      [
        path === "concept"
          ? "Quick take: heres the concept in lender terms you can use today."
          : path === "market"
          ? "Quick take: rates ride the 10-year; spreads and costs do the dancing."
          : "Quick take: lets scope the question and pick a lane (concept vs market).",
        ...bullets.map((b) =>  ),
        ...nexts.map((n) => Next: ),
      ].join("\n");

    const meta = {
      path,
      usedFRED,
      tldr,
      lockBias,
      answer,
      borrowerSummary: borrowerSummaryLines.join("\n"),
      fred: { tenYearYield: null, mort30Avg: null, spread: null, asOf: null },
      paymentDelta,
      watchNext: [],
      confidence,
      status: 200,
    };

    return NextResponse.json(meta, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { path: "error", usedFRED: false, answer: e?.message || "Unexpected error", status: 500 },
      { status: 200 }
    );
  }
}
