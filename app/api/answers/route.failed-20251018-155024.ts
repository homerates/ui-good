﻿import { NextResponse } from "next/server";

type Mode = "borrower" | "public";
type Intent = "" | "purchase" | "refi" | "investor";
type FredSnap = {
  tenYearYield: number | null;
  mort30Avg: number | null;
  spread: number | null;
  asOf: string | null;         // mortgage series (weekly) anchor date
  tenYearAsOf?: string | null; // actual DGS10 date used (<= mortgage week)
};

function classifyPath(q: string): "concept" | "market" | "dynamic" {
  const s = (q || "").toLowerCase();
  if (/(dti|pmi|fha|points|escrow|llpa|mi|amort|debt|income|ratio)/.test(s)) return "concept";
  if (/(rate|rates|10[- ]?year|treasury|mortgage|spread|lock|float|market)/.test(s)) return "market";
  return "dynamic";
}

function monthlyDeltaPerQuarterPoint(loanAmount: number) {
  return Math.round((loanAmount * 0.0025) / 12);
}

async function fetchFred(seriesId: string, key: string, params: Record<string,string>): Promise<any> {
  const u = new URL("https://api.stlouisfed.org/fred/series/observations");
  u.searchParams.set("series_id", seriesId);
  u.searchParams.set("api_key", key);
  u.searchParams.set("file_type", "json");
  for (const [k,v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

function lastNonNull(observations: Array<{date:string; value:string}> | undefined) {
  if (!Array.isArray(observations)) return null;
  for (let i = observations.length - 1; i >= 0; i--) {
    const v = observations[i].value;
    if (v !== "." && v != null) {
      const num = Number(v);
      if (!Number.isNaN(num)) return { date: observations[i].date, value: num };
    }
  }
  return null;
}

async function getFredAligned(): Promise<FredSnap> {
  const key = process.env.FRED_API_KEY || "";
  if (!key) return { tenYearYield: null, mort30Avg: null, spread: null, asOf: null, tenYearAsOf: null };

  // 1) Anchor on the weekly mortgage series latest real value/date
  const mortJson = await fetchFred("MORTGAGE30US", key, { observation_start: "2020-01-01" });
  const mort = lastNonNull(mortJson?.observations);
  if (!mort) return { tenYearYield: null, mort30Avg: null, spread: null, asOf: null, tenYearAsOf: null };

  // 2) Pull DGS10 up to that same date (same day or earlier)
  const start = new Date(mort.date); start.setDate(start.getDate() - 60);
  const dgsJson = await fetchFred("DGS10", key, {
    observation_start: start.toISOString().slice(0,10),
    observation_end: mort.date
  });
  const dgs = lastNonNull(dgsJson?.observations);
  if (!dgs) return { tenYearYield: null, mort30Avg: +Number(mort.value).toFixed(2), spread: null, asOf: mort.date, tenYearAsOf: null };

  const mortVal = +Number(mort.value).toFixed(2);
  const dgsVal  = +Number(dgs.value).toFixed(2);
  const spread  = +(mortVal - dgsVal).toFixed(2);

  return { tenYearYield: dgsVal, mort30Avg: mortVal, spread, asOf: mort.date, tenYearAsOf: dgs.date };
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

    let usedFRED = false;
    let fred: FredSnap = { tenYearYield: null, mort30Avg: null, spread: null, asOf: null, tenYearAsOf: null };
    const tldr: string[] = [];
    const bullets: string[] = [];
    const nexts: string[] = [];
    const lockBias: "Mild Lock" | "Neutral" | "Float Watch" = path === "market" ? "Mild Lock" : "Neutral";
    const confidence: "low" | "med" | "high" = "med";

    if (path === "concept") {
      tldr.push("Plain-English explainer + quick math", "Next steps tailored to your intent");
      bullets.push("Key idea in 15 seconds","Rule-of-thumb you can actually use","Caveats lenders care about");
      nexts.push("Give me your price range, down payment, and credit band to tailor numbers.");
      if (intent === "purchase") nexts.push("We can pre-flight DTI with your income + debts.");
      if (intent === "refi") nexts.push("We’ll compare current P&I vs new P&I + costs.");
    } else if (path === "market") {
      fred = await getFredAligned();
      usedFRED = fred.tenYearYield != null && fred.mort30Avg != null;
      if (usedFRED) {
        tldr.push("Live FRED snapshot aligned by date (mortgage week vs 10-year).");
        bullets.push(
          "10-year: " + fred.tenYearYield + "% (as of " + (fred.tenYearAsOf || "n/a") + ")",
          "30-yr avg: " + fred.mort30Avg + "% (week of " + (fred.asOf || "n/a") + ")",
          "Spread: " + fred.spread + " pts"
        );
      } else {
        tldr.push("FRED not available; showing general guidance.");
      }
      nexts.push("Tell me your lock window (e.g., 15-45 days).");
    }

    let paymentDelta: { perQuarterPt: number; loanAmount: number } | undefined;
    if (loanAmount) {
      paymentDelta = { perQuarterPt: monthlyDeltaPerQuarterPoint(loanAmount), loanAmount };
      bullets.push("Every 0.25% ≈ $" + paymentDelta.perQuarterPt + "/mo on $" + loanAmount.toLocaleString());
    }

    const answer = [
      path === "concept"
        ? "Quick take: heres the concept in lender terms you can use today."
        : path === "market"
        ? (usedFRED ? "Quick take: aligned 10-year vs mortgage week for an honest spread." : "Quick take: rates ride the 10-year; spreads and costs do the dancing.")
        : "Quick take: lets scope the question and pick a lane (concept vs market).",
      ...bullets.map((b) => " " + b),
      ...nexts.map((n) => "Next: " + n),
    ].join("\n");

    const meta = {
      path,
      usedFRED,
      tldr,
      lockBias,
      answer,
      borrowerSummary: [
        " Loan purpose: " + (intent || "auto-detect"),
        " Mode: " + mode,
        loanAmount ? " Target loan: $" + loanAmount.toLocaleString() : " Target loan: (optional)",
        " Lock stance: " + lockBias,
        fred.asOf ? " Market as-of (mortgage week): " + fred.asOf : "",
        fred.tenYearAsOf ? " 10-year as-of: " + fred.tenYearAsOf : ""
      ].filter(Boolean).join("\n"),
      fred,
      paymentDelta,
      watchNext: [],
      confidence,
      status: 200
    };

    return NextResponse.json(meta, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ path: "error", usedFRED: false, answer: msg, status: 500 }, { status: 200 });
  }
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { "Allow": "POST" } });
}
