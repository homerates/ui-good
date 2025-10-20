// app/api/answers/route.ts
import { NextResponse } from "next/server";
import { getFredSnapshot } from "../../../src/lib/fred";

type Mode = "borrower" | "public";
type Intent = "purchase" | "refi" | "investor";

type Body = {
  question?: string;
  mode?: Mode;
  intent?: Intent;
  loanAmount?: number;
};

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseBody(raw: unknown): Body {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Body = {};
  if (typeof r.question === "string") out.question = r.question;
  if (r.mode === "borrower" || r.mode === "public") out.mode = r.mode;
  if (r.intent === "purchase" || r.intent === "refi" || r.intent === "investor") out.intent = r.intent;
  const la = toNum(r.loanAmount);
  if (la && la > 0) out.loanAmount = la;
  return out;
}

function pmt30(L: number, annualRatePct: number): number {
  const r = annualRatePct / 100 / 12;
  const n = 360;
  if (r <= 0) return L / n;
  const x = Math.pow(1 + r, n);
  return L * (r * x) / (x - 1);
}

function paymentDeltaPerQuarterPt(loanAmount: number, baseRatePct: number | null): number {
  if (!loanAmount || loanAmount <= 0 || baseRatePct == null) return 0;
  const a = pmt30(loanAmount, baseRatePct);
  const b = pmt30(loanAmount, baseRatePct + 0.25);
  return Math.round(b - a);
}

function biasTextFromSpread(spread: number | null): string {
  if (spread == null) return "neutral";
  if (spread > 2.25) return "tight-credit / high spread";
  if (spread < 1.75) return "looser-credit / low spread";
  return "neutral";
}

function lockSignal(spread: number | null): "Mild Lock" | "Neutral" | "Float Watch" {
  if (spread == null) return "Neutral";
  if (spread > 2.25) return "Mild Lock";
  if (spread < 1.75) return "Float Watch";
  return "Neutral";
}

function mythFactLines(): string[] {
  return [
    "Myth: When the Fed cuts the fed funds rate, 30-yr mortgage rates drop right away.",
    "Fact: 30-yr mortgage rates track the 10-year Treasury (inflation & growth expectations), not the overnight fed funds rate.",
    "Fact: Mortgage rates often move before the Fed — and can rise on a Fed cut if long-term inflation risk or term premium jumps.",
    "Keep it simple: watch the 10-year yield and the mortgage/10-year spread — that’s your compass."
  ];
}

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = parseBody(await req.json().catch(() => ({})));
  } catch {
    // ignore malformed JSON; fall back to defaults
  }

  // Pull snapshot with guardrails
  const snap = await getFredSnapshot({ timeoutMs: 2000, maxAgeDays: 14 }).catch(() => null);

  const has =
    !!snap &&
    snap.tenYearYield != null &&
    snap.mort30Avg != null &&
    snap.spread != null &&
    !!snap.asOf;

  const fred = has
    ? {
        tenYearYield: snap!.tenYearYield!,
        mort30Avg: snap!.mort30Avg!,
        spread: snap!.spread!,
        asOf: snap!.asOf!,
      }
    : {
        tenYearYield: null,
        mort30Avg: null,
        spread: null,
        asOf: null,
      };

  const bias = biasTextFromSpread(fred.spread);

  const summary =
    fred.asOf && fred.tenYearYield != null && fred.mort30Avg != null && fred.spread != null
      ? `As of ${fred.asOf}: 10Y ${fred.tenYearYield.toFixed(2)}%, 30Y ${fred.mort30Avg.toFixed(
          2
        )}%, spread ${fred.spread.toFixed(2)}%. Bias: ${bias}.`
      : "Market snapshot unavailable — using safe defaults.";

  // Borrower-facing block
  const lockStance = lockSignal(fred.spread);
  const bullets: string[] = [];
  bullets.push(...mythFactLines());

  if (fred.asOf) {
    bullets.push(
      `Today (${fred.asOf}): 10Y ${fred.tenYearYield?.toFixed(2) ?? "—"}% · 30-yr ${fred.mort30Avg?.toFixed(2) ?? "—"}% · spread ${fred.spread?.toFixed(2) ?? "—"}%.`
    );
  }

  bullets.push("Watch next: CPI/PCE prints, jobs reports, and 10-yr Treasury auctions — those move the 10-yr and your rate.");

  let paymentDelta: { perQuarterPt: number; loanAmount: number } | undefined = undefined;
  if (body.loanAmount && fred.mort30Avg != null) {
    const perQuarterPt = paymentDeltaPerQuarterPt(body.loanAmount, fred.mort30Avg);
    paymentDelta = { perQuarterPt, loanAmount: body.loanAmount };
    bullets.push(
      `For ~$${body.loanAmount.toLocaleString()}: about +$${perQuarterPt}/mo for each +0.25% change in rate (30-yr fixed).`
    );
  }

  // Response (keep existing keys; add new ones; include alias lockBias for UI)
  const out = {
    ok: true,
    path: "market" as const,
    usedFRED: has,

    fred,
    bias,
    summary,
    message: summary,

    lockStance,
    lockBias: lockStance, // alias for UI that expects lockBias
    borrowerSummary: bullets.join("\n"),
    ...(paymentDelta ? { paymentDelta } : {}),

    watchNext: {}, // keep shape you already return
    confidence: has ? ("med" as const) : ("low" as const),
    status: 200,
  };

  return NextResponse.json(out, { status: 200 });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, message: "Use POST with JSON to /api/answers" },
    { status: 405 }
  );
}
