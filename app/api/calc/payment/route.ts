/* app/api/calc/payments/route.ts
   Smart adapter: keeps your current /api/calc/payments endpoint
   but computes real PITI via /api/piti and /api/knowledge.
*/
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Num = number | null;
const num = (v: string | null): Num => (v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function GET(req: Request) {
  const now = new Date().toISOString();
  const url = new URL(req.url);
  const origin = url.origin; // use the same host (works locally and on Vercel)

  // Accept both legacy and explicit names
  const purchasePrice = num(url.searchParams.get("purchasePrice")) ?? num(url.searchParams.get("price"));
  const downPercent = num(url.searchParams.get("downPercent"));
  const loanFromQ = num(url.searchParams.get("loan")) ?? num(url.searchParams.get("loanAmount"));
  const ratePct = num(url.searchParams.get("rate")) ?? num(url.searchParams.get("ratePct"));
  const termYears = num(url.searchParams.get("term")) ?? num(url.searchParams.get("termYears")) ?? 30;
  const termMonths = num(url.searchParams.get("termMonths")) ?? (termYears! * 12);

  const zip = url.searchParams.get("zip") || url.searchParams.get("postal") || undefined;
  const ins = num(url.searchParams.get("ins")) ?? num(url.searchParams.get("monthlyIns")) ?? 0;
  const hoa = num(url.searchParams.get("hoa")) ?? num(url.searchParams.get("monthlyHOA")) ?? 0;
  const miPctAnnual = num(url.searchParams.get("miPctAnnual"));
  const taxBaseParam = (url.searchParams.get("taxBase") as "loan" | "price" | null) ?? null;

  // Derive loan when price + down% provided
  let loanAmount: number | null = loanFromQ;
  if (loanAmount == null && purchasePrice != null && downPercent != null) {
    loanAmount = round2(purchasePrice * (1 - downPercent / 100));
  }

  // Minimal validation
  const missing: string[] = [];
  if (loanAmount == null) missing.push("loan (or price + downPercent)");
  if (ratePct == null) missing.push("rate");
  if (termMonths == null) missing.push("term or termMonths");
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing required parameter(s): ${missing.join(", ")}` },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // --- Knowledge: tax + context ---
  let taxRate = 0.012;
  let taxSource = "fallback:default";
  let county: string | null = null;
  let loanLimits: any = null;

  try {
    const kURL = new URL("/api/knowledge", origin);
    if (zip) kURL.searchParams.set("zip", zip);
    const kRes = await fetch(kURL.toString(), { cache: "no-store" });
    if (kRes.ok) {
      const k = await kRes.json();
      const r = Number(k?.taxes?.rate);
      if (Number.isFinite(r) && r > 0) {
        taxRate = r;
        taxSource = k?.taxes?.source || "knowledge:zipLookup";
      }
      county = k?.county ?? null;
      loanLimits = k?.loanLimits ?? null;
    }
  } catch {
    // keep fallbacks
  }

  // --- Delegate to PITI ---
  const pitiURL = new URL("/api/piti", origin);
  pitiURL.searchParams.set("loan", String(loanAmount));
  pitiURL.searchParams.set("rate", String(ratePct));
  pitiURL.searchParams.set("termMonths", String(termMonths));
  if (zip) pitiURL.searchParams.set("zip", zip);
  if (purchasePrice != null) pitiURL.searchParams.set("price", String(purchasePrice));
  if (taxBaseParam) pitiURL.searchParams.set("taxBase", taxBaseParam);
  if (ins != null) pitiURL.searchParams.set("ins", String(ins));
  if (hoa != null) pitiURL.searchParams.set("hoa", String(hoa));
  if (miPctAnnual != null) pitiURL.searchParams.set("miPctAnnual", String(miPctAnnual));

  const pitiRes = await fetch(pitiURL.toString(), { cache: "no-store" });
  if (!pitiRes.ok) {
    const e = await pitiRes.text();
    return NextResponse.json(
      { error: `PITI error: ${e}` },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
  const piti = await pitiRes.json();

  // Back-compatible + richer output
  const response = {
    status: "ok",
    path: "calc/payments",
    usedFRED: false,
    at: now,
    inputs: {
      zip: zip ?? null,
      county: county ?? undefined,
      loanAmount: loanAmount,
      ratePct: ratePct,
      termMonths: termMonths,
      monthlyIns: ins ?? 0,
      monthlyHOA: hoa ?? 0,
    },
    lookups: {
      taxRate,
      taxSource,
      loanLimits: loanLimits ?? undefined,
    },
    breakdown: {
      monthlyPI: piti?.breakdown?.monthlyPI ?? 0,
      monthlyTax: piti?.breakdown?.monthlyTax ?? 0,
      monthlyIns: piti?.breakdown?.monthlyIns ?? (ins ?? 0),
      monthlyHOA: piti?.breakdown?.monthlyHOA ?? (hoa ?? 0),
      monthlyMI: piti?.breakdown?.monthlyMI ?? 0,
      monthlyTotalPITI:
        piti?.breakdown?.monthlyTotalPITI ??
        round2(
          (piti?.breakdown?.monthlyPI ?? 0) +
          (piti?.breakdown?.monthlyTax ?? 0) +
          (ins ?? 0) +
          (hoa ?? 0) +
          (piti?.breakdown?.monthlyMI ?? 0)
        ),
    },
    sensitivity: piti?.sensitivity ?? undefined,
    answer: piti?.answer ?? undefined,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
