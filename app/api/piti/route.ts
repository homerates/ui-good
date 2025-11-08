/* app/api/piti/route.ts */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PitiInputs = {
    loan: number;
    ratePct: number;
    termMonths: number;
    zip?: string;
    price?: number;
    taxBase?: "loan" | "price";
    ins?: number;
    hoa?: number;
    miPctAnnual?: number; // e.g., 0.48 = 0.48%/yr
};

function n(v: string | null, f = 0) {
    const x = Number(v);
    return Number.isFinite(x) ? x : f;
}

function monthlyPI(loan: number, ratePct: number, months: number) {
    if (loan <= 0 || months <= 0) return 0;
    const r = (ratePct / 100) / 12;
    if (r === 0) return loan / months;
    const pow = Math.pow(1 + r, months);
    return loan * (r * pow) / (pow - 1);
}

async function getTax(origin: string, zip?: string) {
    // safe default
    let rate = 0.012;
    let source = "fallback:default";
    if (!zip) return { rate, source };

    try {
        const url = new URL("/api/knowledge", origin);
        url.searchParams.set("zip", zip);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (res.ok) {
            const j = await res.json();
            const r = Number(j?.taxes?.rate);
            if (Number.isFinite(r) && r > 0) {
                rate = r;
                source = j?.taxes?.source || "knowledge:zipLookup";
            }
        }
    } catch {
        // keep defaults
    }
    return { rate, source };
}

function sens(loan: number, base: number, months: number) {
    return {
        up025: monthlyPI(loan, base + 0.25, months),
        down025: monthlyPI(loan, base - 0.25, months),
    };
}

function r2(v: number) {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const origin = `${url.protocol}//${url.host}`;

    // inputs (accept years or months, prefer months)
    const loan = n(url.searchParams.get("loan"));
    const ratePct = n(url.searchParams.get("rate")) || n(url.searchParams.get("ratePct"));
    const termYears = n(url.searchParams.get("term"));
    const termMonths = n(url.searchParams.get("termMonths")) || (termYears * 12);
    const zip = url.searchParams.get("zip") || undefined;
    const price = n(url.searchParams.get("price")) || undefined;
    const taxBaseQ = (url.searchParams.get("taxBase") as PitiInputs["taxBase"]) || "loan";
    const ins = n(url.searchParams.get("ins"));
    const hoa = n(url.searchParams.get("hoa"));
    const miPctAnnual = n(url.searchParams.get("miPctAnnual"));

    const missing: string[] = [];
    if (!loan) missing.push("loan");
    if (!ratePct) missing.push("rate");
    if (!termMonths) missing.push("term or termMonths");
    if (missing.length) {
        return NextResponse.json({ error: `Missing: ${missing.join(", ")}` }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { rate: taxRate, source: taxSource } = await getTax(origin, zip);

    const taxBase = (taxBaseQ === "price" && price) ? "price" : "loan";
    const baseForTax = taxBase === "price" ? (price as number) : loan;

    const pi = monthlyPI(loan, ratePct, termMonths);
    const monthlyTax = baseForTax > 0 ? (baseForTax * taxRate) / 12 : 0;
    const monthlyIns = ins || 0;
    const monthlyHOA = hoa || 0;
    const monthlyMI = miPctAnnual ? (loan * (miPctAnnual / 100)) / 12 : 0;

    const total = pi + monthlyTax + monthlyIns + monthlyHOA + monthlyMI;
    const s = sens(loan, ratePct, termMonths);

    const payload = {
        inputs: { loan, ratePct, termMonths, zip: zip || null, price: price ?? null, taxBase, miPctAnnual: miPctAnnual || 0, ins: monthlyIns, hoa: monthlyHOA },
        tax: { annualRate: taxRate, source: taxSource, baseUsed: taxBase },
        breakdown: {
            monthlyPI: r2(pi),
            monthlyTax: r2(monthlyTax),
            monthlyIns: r2(monthlyIns),
            monthlyHOA: r2(monthlyHOA),
            monthlyMI: r2(monthlyMI),
            monthlyTotalPITI: r2(total),
        },
        sensitivity: { up025: r2(s.up025), down025: r2(s.down025) },
        answer: `Estimated monthly payment is $${r2(total).toLocaleString()} including principal & interest, taxes, insurance${monthlyHOA ? ", and HOA" : ""}.`,
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
