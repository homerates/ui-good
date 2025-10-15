// src/lib/composeMarket.ts
import type { FredSnapshot } from "@/lib/fred";

export type Mode = "borrower" | "public";

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
  recentTenYearChange?: number | null;  // e.g. +0.18 = +18 bps wk/wk
  volatility?: "low" | "med" | "high";
};

function fmtPct(n: number | null, digits = 2) {
  if (n == null || !isFinite(n)) return "—";
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

export function composeMarket(
  fred: FredSnapshot | null,
  mode: Mode,
  opts?: MarketComposeOptions
): ComposedAnswer {
  const loan = opts?.defaultLoan ?? 500_000;

  if (!fred || fred.stale || (fred.tenYearYield == null && fred.mort30Avg == null)) {
    return {
      path: "market",
      usedFRED: false,
      fred: fred ?? undefined,
      tldr: [
        "Live feed not available.",
        "Rates generally track the 10-year Treasury.",
        "Spreads reflect risk and liquidity.",
      ],
      lockBias: "Neutral",
      answer: [
        mode === "public" ? "Market view (no live feed):" : "Quick read (no live feed):",
        "• Mortgage rates tend to move with the 10-year over time.",
        "• Spreads widen/tighten with risk, liquidity, and servicing costs.",
        "• If timing is tight, consider partial locks to manage downside.",
      ].join("\n"),
      borrowerSummary:
        mode === "borrower"
          ? "Consider locking a portion if a negative data surprise would strain payment; otherwise watch CPI/Jobs/Fed."
          : null,
      paymentDelta: { perQuarterPt: monthlyPmtDeltaPerQuarterPoint(loan), loanAmount: loan },
      watchNext: ["CPI", "Jobs Report", "FOMC"],
      confidence: "low",
      asOf: fred?.asOf ?? null,
    };
  }

  const t = fred.tenYearYield;
  const m = fred.mort30Avg;
  const s = fred.spread;

  const bias = pickLockBias(s ?? null, opts?.recentTenYearChange ?? null, opts?.volatility);

  const tldr = [
    `10Y ${fmtPct(t)} · 30Y mtg ${fmtPct(m)} · spread ${s != null ? s.toFixed(2) : "—"} pts`,
    bias === "Mild Lock"
      ? "Bias: Mild Lock — improvement less certain while spreads run wide."
      : bias === "Float Watch"
      ? "Bias: Float Watch — spreads tight; data-sensitive market."
      : "Bias: Neutral — data-dependent day-to-day.",
    fred.asOf ? `As of ${fred.asOf}` : "Fresh today",
  ];

  const lines: string[] = [];
  lines.push(mode === "public" ? "Market snapshot:" : "Here’s where things sit today:");
  if (t != null) lines.push(`• 10-year Treasury: ~${t.toFixed(2)}%`);
  if (m != null) lines.push(`• 30-year mortgage avg: ~${m.toFixed(2)}%`);
  if (s != null) lines.push(`• Spread: ~${s.toFixed(2)} pts`);
  if (fred.asOf) lines.push(`• As of: ${fred.asOf}`);

  let borrowerSummary: string | null = null;
  if (mode === "borrower") {
    const items: string[] = [];
    if (bias === "Mild Lock") {
      items.push(
        "Lock if payment risk is sensitive; improvement may be slower while spreads stay wide.",
        "If floating, set a clear pain threshold for payment and a time limit."
      );
    } else if (bias === "Float Watch") {
      items.push(
        "If timing allows, float with alerts—tighter spreads can pass through improvements faster.",
        "Have a lock trigger tied to CPI/Jobs in case of a surprise."
      );
    } else {
      items.push(
        "Neutral posture: partial locks can hedge while keeping upside.",
        "Focus on total cost (points + payment), not rate alone."
      );
    }
    borrowerSummary = items.join("\n");
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
    asOf: fred.asOf ?? null,
  };
}
