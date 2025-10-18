import { NextResponse } from "next/server";

type Mode = "borrower" | "public";
type Intent = "" | "purchase" | "refi" | "investor";

function classifyPath(q: string): "concept" | "market" | "dynamic" {
  const s = (q || "").toLowerCase();
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
    const tldr: string[] = [];
    const bullets: string[] = [];
    const nexts: string[] = [];

    if (path === "concept") {
      tldr.push("Plain-English explainer + quick math", "Next steps tailored to your intent");
      bullets.push("Key idea in 15 seconds","Rule-of-thumb you can actually use","Caveats lenders care about");
      nexts.push("Tell me price range, down payment, and credit band for tailored numbers.");
      if (intent === "purchase") nexts.push("We can pre-flight DTI with your income + debts.");
      if (intent === "refi") nexts.push("We’ll compare current P&I vs new P&I + costs.");
    } else if (path === "market") {
      tldr.push("Rates track the 10-year over time; spreads move with risk/cost.");
      nexts.push("Tell me your lock window (e.g., 1545 days).");
    }

    const paymentDelta = loanAmount
      ? { perQuarterPt: monthlyDeltaPerQuarterPoint(loanAmount), loanAmount }
      : undefined;

    const answer = [
      path === "concept"
        ? "Quick take: here’s the concept in lender terms you can use today."
        : path === "market"
        ? "Quick take: rates ride the 10-year; spreads and costs do the dancing."
        : "Quick take: lets scope the question and pick a lane (concept vs market).",
      ...bullets.map((b) => " " + b),
      ...nexts.map((n) => "Next: " + n),
    ].join("\n");

    return NextResponse.json({
      path,
      usedFRED: false,
      tldr,
      lockBias: path === "market" ? "Mild Lock" : "Neutral",
      answer,
      borrowerSummary: [
        " Loan purpose: " + (intent || "auto-detect"),
        " Mode: " + mode,
        loanAmount ? " Target loan: $" + loanAmount.toLocaleString() : " Target loan: (optional)",
        " Lock stance: " + (path === "market" ? "Mild Lock" : "Neutral")
      ].join("\n"),
      fred: { tenYearYield: null, mort30Avg: null, spread: null, asOf: null },
      paymentDelta,
      watchNext: [],
      confidence: "med",
      status: 200
    }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ path: "error", usedFRED: false, answer: msg, status: 500 }, { status: 200 });
  }
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { "Allow": "POST" } });
}
