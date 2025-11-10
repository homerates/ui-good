// ==== REPLACE ENTIRE FILE: app/api/answers/route.ts ====
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

function noStore(json: unknown, status = 200) {
  const res = NextResponse.json(json, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

type ApiResponse = {
  path: "concept" | "market" | "dynamic" | "error" | "calc";
  usedFRED: boolean;
  message?: string;
  summary?: string;
  tldr?: string[] | string;
  answer?: string;
  borrowerSummary?: string | null;
  fred?: {
    tenYearYield: number | null;
    mort30Avg: number | null;
    spread: number | null;
    asOf?: string | null;
  };
  lockBias?: "Mild Lock" | "Neutral" | "Float Watch";
  paymentDelta?: { perQuarterPt: number; loanAmount: number };
  watchNext?: string[];
  confidence?: "low" | "med" | "high";
  status?: number;
  generatedAt?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const question: string = (body?.question ?? "").toString().trim();

    // Super-light router so UI never breaks
    let resp: ApiResponse;

    // Example concept: FDIC
    if (/^what\s+is\s+fdic\b/i.test(question) || /\bfdic\b/i.test(question)) {
      resp = {
        path: "concept",
        usedFRED: false,
        summary: "FDIC insures eligible bank deposits (generally up to $250,000 per depositor, per insured bank, per ownership category) and supervises certain financial institutions.",
        answer:
          `FDIC = Federal Deposit Insurance Corporation.
• Purpose: Protects depositors if an FDIC-insured bank fails.
• Coverage: Typically up to $250k per depositor, per bank, per ownership category.
• Scope: Checking, savings, CDs, money market deposit accounts (not stocks, bonds, mutual funds, or crypto).
• Funding: Not taxpayer-funded day-to-day; premiums are paid by insured banks.
• Why it matters: Reduces run risk and promotes confidence in the banking system.`,
        confidence: "high",
        generatedAt: new Date().toISOString(),
        status: 200,
      };
      return noStore(resp, 200);
    }

    // Default fallback (keeps UI happy with valid JSON)
    resp = {
      path: "dynamic",
      usedFRED: false,
      summary: "Answer service is up. External research is currently disabled for stability.",
      answer:
        "Got your question. For now, this endpoint returns a stable JSON response while we finalize parsing and external lookups. Ask a concept (e.g., 'What is FHA MIP?') or run a mortgage calc from the calculator.",
      confidence: "med",
      generatedAt: new Date().toISOString(),
      status: 200,
    };

    return noStore(resp, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const resp: ApiResponse = {
      path: "error",
      usedFRED: false,
      message: "answers endpoint failed",
      answer: msg,
      generatedAt: new Date().toISOString(),
      status: 500,
    };
    return noStore(resp, 500);
  }
}
