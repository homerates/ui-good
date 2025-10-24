// src/lib/composeMarket.ts
import type { FredSnapshot as FredSnap } from "@/lib/fred";

export type FredSnapshot = FredSnap;

type Tone = "neutral" | "constructive" | "cautious";

type DeltaText = "flat" | `up ${number} bps` | `down ${number} bps` | null;

type MarketPayload = {
  t: number;
  m: number;
  s: number;
  tenD: DeltaText;
  mortD: DeltaText;
  asOf: string;
  tone: Tone;
};

type TemplateFn = (p: MarketPayload) => string;

function deltaBps(curr?: number | null, prev?: number | null): DeltaText {
  if (curr == null || prev == null) return null;
  const bps = (curr - prev) * 100;
  const abs = Math.abs(bps);
  if (abs < 1) return "flat";
  return bps > 0 ? (`up ${Math.round(bps)} bps` as const)
                 : (`down ${Math.round(abs)} bps` as const);
}

function mood(tenD: DeltaText, mortD: DeltaText): Tone {
  const score = (d: DeltaText) => d?.startsWith("up") ? 1 : d?.startsWith("down") ? -1 : 0;
  const net = score(tenD) + score(mortD);
  if (net > 0) return "cautious";
  if (net < 0) return "constructive";
  return "neutral";
}

const templates: TemplateFn[] = [
  ({ t, m, s, tenD, mortD, asOf, tone }) =>
    `Market snapshot (${asOf}): 10Y ${t.toFixed(2)}%, 30Y avg ${m.toFixed(2)}% (spread ${s.toFixed(2)}%). ` +
    `${tenD ? `10Y ${tenD}. ` : ""}${mortD ? `30Y ${mortD}. ` : ""}` +
    `\nTake: ${
      tone === "constructive"
        ? "Slight tailwind; lend could inch better if spreads hold."
        : tone === "cautious"
        ? "Bias higher; protect locks on rate-sensitive files."
        : "Sideways bias; pricing tracks data and auctions."
    }\nNext: Watch CPI/PCE and Treasury auction demand.`,
  ({ t, m, s, tenD, mortD, asOf, tone }) =>
    `As of ${asOf}, 10Y=${t.toFixed(2)}%, 30Y=${m.toFixed(2)}% (spread ${s.toFixed(2)}%). ` +
    `${tenD ? `10Y ${tenD}. ` : ""}${mortD ? `30Y ${mortD}. ` : ""}` +
    `\nContext: ${
      tone === "constructive"
        ? "Momentum modestly friendly."
        : tone === "cautious"
        ? "Pressure building toward higher prints."
        : "Mixed signals; no strong bias."
    }\nNext: Fed speak + term-premium moves can shift spreads independent of 10Y.`,
  ({ t, m, s, tenD, mortD, asOf, tone }) =>
    `Rates check (${asOf}): 10Y=${t.toFixed(2)}%, 30Y=${m.toFixed(2)}%, spread=${s.toFixed(2)}%. ` +
    `${tenD ? `10Y ${tenD}. ` : ""}${mortD ? `30Y ${mortD}. ` : ""}` +
    `\nRead: ${
      tone === "constructive"
        ? "Slight tailwind developing."
        : tone === "cautious"
        ? "Defensive bias; fades can stick."
        : "Range-bound for now."
    }\nNext: Lock/float hinges on data surprises; watch intraday vol.`
];

function pickIndex(asOf: string): number {
  const n = templates.length;
  const seed = Number(asOf.replace(/-/g, "").slice(-4)) || 0;
  return seed % n;
}

export function composeMarket(f: FredSnapshot) {
  const t = f.tenYearYield ?? 0;
  const m = f.mort30Avg ?? 0;
  const s = (f.mort30Avg != null && f.tenYearYield != null) ? f.mort30Avg - f.tenYearYield : 0;

  const tenD = deltaBps(f.tenYearYield, f.prevTenYearYield ?? null);
  const mortD = deltaBps(f.mort30Avg, f.prevMort30Avg ?? null);
  const tone = mood(tenD, mortD);

  const asOf = f.asOf ?? new Date().toISOString().slice(0, 10);
  const idx = pickIndex(asOf);

  const text = templates[idx]({ t, m, s, tenD, mortD, asOf, tone });

  return {
    type: "market" as const,
    asOf,
    tenYearYield: f.tenYearYield,
    mort30Avg: f.mort30Avg,
    spread: f.spread ?? (f.mort30Avg != null && f.tenYearYield != null ? +(s.toFixed(2)) : null),
    tone,
    text,
  };
}
