// src/lib/composeMarket.ts
import type { FredSnapshot } from "@/lib/fred";

export type Mode = "borrower" | "public";
export type Intent = "purchase" | "refi" | "investor";

export type ComposedAnswer = {
  path: "market";
  usedFRED: boolean;
  fred?: FredSnapshot | null;
  tldr: string[];
  lockBias?: "Mild Lock" | "Neutral" | "Float Watch";
  answer: string;
  borrowerSummary: string | null;
  paymentDelta?: { perQuarterPt: number; loanAmount: number };
  watchNext?: string[];
  confidence?: "low" | "med" | "high";
  asOf?: string | null;
};

export type MarketComposeOptions = {
  defaultLoan?: number;
  loanAmount?: number;              // â† add
  intent?: Intent;                  // â† add
  recentTenYearChange?: number | null;
  volatility?: "low" | "med" | "high";
};

function fmtPct(n: number | null, digits = 2) {
  if (n == null || !isFinite(n)) return "â€”";
  return `${n.toFixed(digits)}%`;
}
function monthlyPmtDeltaPerQuarterPoint(loanAmount: number) {
  return Math.round((0.0025 * loanAmount) / 12);
}
function pickLockBias(
  spread: number | null,
  recent10Y: number | null,
  vol: MarketComposeOptions["volatility"]
): "Mild Lock" | "Neutral" | "Float Watch" {
  let bias: "Mild Lock" | "Neutral" | "Float Watch" = "Neutral";
  if (spread != null) {
    if (spread > 2.0) bias = "Mild Lock";
    if (spread < 1.6) bias = "Float Watch";
  }
  if (recent10Y != null) {
    if (recent10Y >= 0.15 && bias !== "Mild Lock") bias = "Mild Lock";
    if (recent10Y <= -0.15 && bias !== "Float Watch") bias = "Float Watch";
  }
  if (vol === "high" && bias === "Float Watch") bias = "Neutral";
  return bias;
}
function intentLines(intent?: Intent, bias?: "Mild Lock" | "Neutral" | "Float Watch") {
  if (!intent) return [];
  const b = bias ?? "Neutral";
  if (intent === "purchase") {
    return b === "Mild Lock"
      ? ["Buyers: lock if payment sensitivity is high; use credits instead of chasing tiny rate moves."]
      : b === "Float Watch"
      ? ["Buyers: float with alerts; be ready to grab lender credits if pricing improves."]
      : ["Buyers: partial lock can hedge while you shop."];
  }
  if (intent === "refi") {
    return b === "Mild Lock"
      ? ["Refi: lock if breakeven works today; donâ€™t let a good breakeven slip."]
      : b === "Float Watch"
      ? ["Refi: float with a trigger; set a target payment/breakeven and lock on hit."]
      : ["Refi: compare no-cost vs pointsâ€”optimize time-to-breakeven."];
  }
  // investor
  return b === "Mild Lock"
    ? ["Investors: protect DSCR; prioritize stability over marginal rate gains."]
    : b === "Float Watch"
    ? ["Investors: floats okay; improvements can pass through faster to non-owner pricing."]
    : ["Investors: weigh reserves/escrows and prepay penalties alongside rate."];
}

export function composeMarket(
  fred: FredSnapshot | null,
  mode: Mode,
  opts?: MarketComposeOptions
): ComposedAnswer {
  const loan = opts?.loanAmount ?? opts?.defaultLoan ?? 500_000;

  if (!fred || fred.stale || (fred.tenYearYield == null && fred.mort30Avg == null)) {
    return {
      path: "market",
      usedFRED: false,
      fred: fred ?? undefined,
      tldr: [
        "Live feed not available.",
        "Rates generally track the 10-year Treasury.",
        "Spreads reflect risk and liquidity."
      ],
      lockBias: "Neutral",
      answer: [
        mode === "public" ? "Market view (no live feed):" : "Quick read (no live feed):",
        "â€¢ Mortgage rates tend to move with the 10-year over time.",
        "â€¢ Spreads widen/tighten with risk, liquidity, and servicing costs.",
        "â€¢ If timing is tight, consider partial locks to manage downside."
      ].join("\n"),
      borrowerSummary:
        mode === "borrower"
          ? [
              "Consider locking a portion if a negative data surprise would strain payment; otherwise watch CPI/Jobs/Fed.",
              ...intentLines(opts?.intent, "Neutral")
            ].join("\n")
          : null,
      paymentDelta: { perQuarterPt: monthlyPmtDeltaPerQuarterPoint(loan), loanAmount: loan },
      watchNext: ["CPI", "Jobs Report", "FOMC"],
      confidence: "low",
      asOf: fred?.asOf ?? null
    };
  }

  const t = fred.tenYearYield;
  const m = fred.mort30Avg;
  const s = fred.spread;
  const bias = pickLockBias(s ?? null, opts?.recentTenYearChange ?? null, opts?.volatility);

  const tldr = [
    `10Y ${fmtPct(t)} Â· 30Y mtg ${fmtPct(m)} Â· spread ${s != null ? s.toFixed(2) : "â€”"} pts`,
    bias === "Mild Lock"
      ? "Bias: Mild Lock â€” improvement less certain while spreads run wide."
      : bias === "Float Watch"
      ? "Bias: Float Watch â€” spreads tight; data-sensitive market."
      : "Bias: Neutral â€” data-dependent day-to-day.",
    fred.asOf ? `As of ${fred.asOf}` : "Fresh today"
  ];

  const lines: string[] = [];
  lines.push(mode === "public" ? "Market snapshot:" : "Hereâ€™s where things sit today:");
  if (t != null) lines.push(`â€¢ 10-year Treasury: ~${t.toFixed(2)}%`);
  if (m != null) lines.push(`â€¢ 30-year mortgage avg: ~${m.toFixed(2)}%`);
  if (s != null) lines.push(`â€¢ Spread: ~${s.toFixed(2)} pts`);
  if (fred.asOf) lines.push(`â€¢ As of: ${fred.asOf}`);

  let borrowerSummary: string | null = null;
  if (mode === "borrower") {
    const base: string[] = [];
    if (bias === "Mild Lock") {
      base.push(
        "Lock if payment risk is sensitive; improvement may be slower while spreads stay wide.",
        "If floating, set a clear pain threshold for payment and a time limit."
      );
    } else if (bias === "Float Watch") {
      base.push(
        "If timing allows, float with alertsâ€”tighter spreads can pass through improvements faster.",
        "Have a lock trigger tied to CPI/Jobs in case of a surprise."
      );
    } else {
      base.push(
        "Neutral posture: partial locks can hedge while keeping upside.",
        "Focus on total cost (points + payment), not rate alone."
      );
    }
    borrowerSummary = [...base, ...intentLines(opts?.intent, bias)].join("\n");
  }

  return {
    path: "market",
    usedFRED: true,
    fred,
    tldr,
    lockBias: bias,
    answer: lines.join("\n"),
    borrowerSummary,
    paymentDelta: { perQuarterPt: monthlyPmtDeltaPerQuarterPoint(loan), loanAmount: loan },
    watchNext: ["CPI", "Jobs Report", "FOMC"],
    confidence: "med",
    asOf: fred.asOf ?? null
  };
}

