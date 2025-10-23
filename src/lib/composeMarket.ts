// /lib/composeMarket.ts
export type FredSnapshot = {
  tenYearYield: number;        // e.g., 4.02
  mort30Avg: number;           // e.g., 6.27
  spread: number;              // mort30Avg - tenYearYield
  asOf: string;                // YYYY-MM-DD
  prevTenYearYield?: number;   // optional previous values for deltas (safe if undefined)
  prevMort30Avg?: number;
};

type Tone = "neutral" | "constructive" | "cautious";

const templates = [
  ({t, m, s, tenDelta, mortDelta, asOf, tone}: any) =>
    `Market snapshot (${asOf}): 10Y ${t.toFixed(2)}%, 30Y avg ${m.toFixed(2)}% (spread ${s.toFixed(2)}%). ` +
    `${deltaLine(tenDelta, "10Y")} ${deltaLine(mortDelta, "30Y")}` +
    `\nTake: ${take(tone)}\nNext: Watch CPI/PCE prints and auction demand over the next few sessions.`,
  ({t, m, s, tenDelta, mortDelta, asOf, tone}: any) =>
    `As of ${asOf}, the 10-Year sits at ${t.toFixed(2)}% and the 30-Year mortgage avg at ${m.toFixed(2)}% (spread ${s.toFixed(2)}%). ` +
    `${deltaLine(tenDelta, "10Y")} ${deltaLine(mortDelta, "30Y")}` +
    `\nRead: ${take(tone)}\nNext: Focus on Fed speak and term-premium moves; spreads can flex even if the 10Y drifts sideways.`,
  ({t, m, s, tenDelta, mortDelta, asOf, tone}: any) =>
    `Rates check (${asOf}): 10Y=${t.toFixed(2)}%, 30Y=${m.toFixed(2)}%, spread=${s.toFixed(2)}%. ` +
    `${deltaLine(tenDelta, "10Y")} ${deltaLine(mortDelta, "30Y")}` +
    `\nContext: ${take(tone)}\nNext: Lock/float decisions hinge on data surprises; keep an eye on intraday volatility.`
];

function delta(a?: number) {
  if (a === undefined || isNaN(a)) return null;
  if (Math.abs(a) < 0.01) return "flat";
  return a > 0 ? `up ${a.toFixed(2)} bps` : `down ${Math.abs(a).toFixed(2)} bps`;
}
function deltaLine(d: string | null, label: string) {
  if (!d) return "";
  if (d === "flat") return `${label} ~unchanged.`;
  return `${label} ${d}.`;
}
function mood(tenDeltaBps?: number, mortDeltaBps?: number): Tone {
  const net = (tenDeltaBps ?? 0) + (mortDeltaBps ?? 0);
  if (net > 2) return "cautious";
  if (net < -2) return "constructive";
  return "neutral";
}
function take(tone: Tone) {
  switch (tone) {
    case "constructive":
      return "Slight tailwind developing; lenders may inch better if spreads hold.";
    case "cautious":
      return "Bias to higher rate prints; consider defending locks on rate-sensitive files.";
    default:
      return "Sideways bias; pricing will track headlines and auction results.";
  }
}

function pickIndex(asOf: string) {
  // Small rotation to avoid repetition (deterministic by date)
  const n = templates.length;
  const seed = Number(asOf.replace(/-/g, "").slice(-4)) || 0; // last 4 digits of YYYYMMDD
  return seed % n;
}

export function composeMarket(f: FredSnapshot) {
  const t = f.tenYearYield;
  const m = f.mort30Avg;
  const s = m - t;

  const tenDeltaBps = f.prevTenYearYield !== undefined ? (t - f.prevTenYearYield) * 100 : undefined;
  const mortDeltaBps = f.prevMort30Avg !== undefined ? (m - f.prevMort30Avg) * 100 : undefined;

  const tenDeltaText = delta(tenDeltaBps);
  const mortDeltaText = delta(mortDeltaBps);

  const tone = mood(tenDeltaBps, mortDeltaBps);
  const idx = pickIndex(f.asOf);

  return {
    type: "market" as const,
    asOf: f.asOf,
    tenYearYield: t,
    mort30Avg: m,
    spread: s,
    tone,
    text: templates[idx]({
      t, m, s,
      tenDelta: tenDeltaText,
      mortDelta: mortDeltaText,
      asOf: f.asOf,
      tone
    })
  };
}
