/* app/api/calc/payment/route.ts */
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: string | null) => (v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function GET(req: Request) {
  const now = new Date().toISOString();
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;

  const price = num(url.searchParams.get("purchasePrice")) ?? num(url.searchParams.get("price"));
  const downPct = num(url.searchParams.get("downPercent"));
  const loanQ = num(url.searchParams.get("loan")) ?? num(url.searchParams.get("loanAmount"));
  const rate = num(url.searchParams.get("rate")) ?? num(url.searchParams.get("ratePct"));
  const termY = num(url.searchParams.get("term")) ?? num(url.searchParams.get("termYears")) ?? 30;
  const termM = num(url.searchParams.get("termMonths")) ?? (termY! * 12);
  const zip = url.searchParams.get("zip") || url.searchParams.get("postal") || undefined;
  const ins = num(url.searchParams.get("ins")) ?? num(url.searchParams.get("monthlyIns")) ?? 0;
  const hoa = num(url.searchParams.get("hoa")) ?? num(url.searchParams.get("monthlyHOA")) ?? 0;
  const miPct = num(url.searchParams.get("miPctAnnual"));
  const taxBase = (url.searchParams.get("taxBase") as "loan" | "price" | null) ?? null;

  let loan = loanQ;
  if (loan == null && price != null && downPct != null) loan = r2(price * (1 - downPct / 100));

  const missing: string[] = [];
  if (loan == null) missing.push("loan (or price + downPercent)");
  if (rate == null) missing.push("rate");
  if (termM == null) missing.push("term or termMonths");
  if (missing.length) {
    return NextResponse.json({ error: `Missing required parameter(s): ${missing.join(", ")}` }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  // Knowledge (for label only; PITI will compute its own tax again)
  let taxRate = 0.012, taxSource = "fallback:default", county: string | null = null, loanLimits: any = null;
  try {
    const kURL = new URL("/api/knowledge", origin);
    if (zip) kURL.searchParams.set("zip", zip);
    const kRes = await fetch(kURL.toString(), { cache: "no-store" });
    if (kRes.ok) {
      const k = await kRes.json();
      const r = Number(k?.taxes?.rate);
      if (Number.isFinite(r) && r > 0) { taxRate = r; taxSource = k?.taxes?.source || "knowledge:zipLookup"; }
      county = k?.county ?? null;
      loanLimits = k?.loanLimits ?? null;
    }
  } catch { }

  // Delegate to PITI (same origin)
  const pitiURL = new URL("/api/piti", origin);
  pitiURL.searchParams.set("loan", String(loan));
  pitiURL.searchParams.set("rate", String(rate));
  pitiURL.searchParams.set("termMonths", String(termM));
  if (zip) pitiURL.searchParams.set("zip", zip);
  if (price != null) pitiURL.searchParams.set("price", String(price));
  if (taxBase) pitiURL.searchParams.set("taxBase", taxBase);
  if (ins != null) pitiURL.searchParams.set("ins", String(ins));
  if (hoa != null) pitiURL.searchParams.set("hoa", String(hoa));
  if (miPct != null) pitiURL.searchParams.set("miPctAnnual", String(miPct));

  const pitiRes = await fetch(pitiURL.toString(), { cache: "no-store" });
  if (!pitiRes.ok) return NextResponse.json({ error: `PITI error: ${await pitiRes.text()}` }, { status: 502, headers: { "Cache-Control": "no-store" } });
  const piti = await pitiRes.json();

  const b = piti?.breakdown ?? {};
  const total = Number.isFinite(b.monthlyTotalPITI) ? b.monthlyTotalPITI : r2((b.monthlyPI ?? 0) + (b.monthlyTax ?? 0) + (b.monthlyIns ?? ins ?? 0) + (b.monthlyHOA ?? hoa ?? 0) + (b.monthlyMI ?? 0));

  const response = {
    status: "ok",
    path: "calc/payment",
    usedFRED: false,
    at: now,
    inputs: { zip: zip ?? null, county: county ?? undefined, loanAmount: loan, ratePct: rate, termMonths: termM, monthlyIns: ins ?? 0, monthlyHOA: hoa ?? 0 },
    lookups: { taxRate, taxSource, loanLimits: loanLimits ?? undefined },
    breakdown: {
      monthlyPI: b.monthlyPI ?? 0,
      monthlyTax: b.monthlyTax ?? 0,
      monthlyIns: b.monthlyIns ?? (ins ?? 0),
      monthlyHOA: b.monthlyHOA ?? (hoa ?? 0),
      monthlyMI: b.monthlyMI ?? 0,
      monthlyTotalPITI: total,
    },
    sensitivity: piti?.sensitivity ?? undefined,
    answer: piti?.answer ?? `Estimated monthly payment is $${r2(total).toLocaleString()} including principal & interest, taxes, insurance${((b.monthlyHOA ?? hoa ?? 0) > 0) ? ", and HOA" : ""}.`,
  };

  return NextResponse.json(response, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
