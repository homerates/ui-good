/* ========== START: scripts/bootstrap-knowledge.mjs ========== */
import fs from "fs";
import path from "path";

const dirs = [
    "types",
    "data/knowledge/taxes",
    "data/knowledge/limits",
    "data/knowledge/products",
    "data/knowledge/regs",
    "lib",
    "app/api/knowledge"
];

const files = [
    // JSON data
    ["data/knowledge/taxes/countyTaxCA.json", JSON.stringify({
        countyTaxRates: [
            { county: "Los Angeles", rate: 0.012 },
            { county: "Orange", rate: 0.011 },
            { county: "San Diego", rate: 0.0115 }
        ],
        zipToCounty: {
            "90011": "Los Angeles",
            "92688": "Orange",
            "92101": "San Diego"
        }
    }, null, 2)],
    ["data/knowledge/limits/loanLimitsCA.json", JSON.stringify({
        conformingLoanLimits: [
            { county: "Los Angeles", oneUnit: 1150000, twoUnit: 1473000, threeUnit: 1780000, fourUnit: 2215000 },
            { county: "Orange", oneUnit: 1150000, twoUnit: 1473000, threeUnit: 1780000, fourUnit: 2215000 },
            { county: "San Diego", oneUnit: 1050000, twoUnit: 1345000, threeUnit: 1625000, fourUnit: 2015000 }
        ]
    }, null, 2)],
    ["data/knowledge/products/registry.json", JSON.stringify({
        registry: [
            {
                id: "DSCR",
                label: "Advantage FLEX DSCR",
                summary: "Investor qualification based on property cash flow. DSCR ≥ 0.75 typical; no personal DTI.",
                notes: [
                    "Use market rent (1007) vs PITIA to derive DSCR.",
                    "LLPA-style pricing moves with DSCR bands and LTV."
                ],
                eligibilityKeys: ["investment property", "rent", "cash flow", "DSCR", "no DTI"]
            },
            {
                id: "ACCESS_ZERO",
                label: "Access Zero (DPA)",
                summary: "Down payment assistance paired with first-mortgage; structured alternative to scattered DPA.",
                notes: [
                    "Income/credit overlays apply; confirm program code and pricing bucket.",
                    "Good for first-time buyers needing funds at close."
                ],
                eligibilityKeys: ["first-time", "down payment assistance", "DPA", "grant", "forgivable"]
            },
            {
                id: "JUMBO_ADV",
                label: "Jumbo Advantage",
                summary: "Jumbo programs incl. full doc, bank statement, asset utilization.",
                notes: [
                    "Mind DTI thresholds and reserve matrices.",
                    "Visa types: purchase/R&T allowed; cash-out limits vary."
                ],
                eligibilityKeys: ["jumbo", "bank statement", "asset utilization", "1099", "self-employed"]
            }
        ]
    }, null, 2)],
    ["data/knowledge/acronyms.json", JSON.stringify({
        acronyms: [
            { key: "P&I", meaning: "Principal & Interest" },
            { key: "PITIA", meaning: "Principal, Interest, Taxes, Insurance, and HOA/Assessments" },
            { key: "DTI", meaning: "Debt-to-Income Ratio", context: "Qualifying ratio based on housing + debts ÷ income" },
            { key: "DSCR", meaning: "Debt Service Coverage Ratio", context: "Investment loans qualified by rents vs PITIA" },
            { key: "UFMIP", meaning: "Upfront Mortgage Insurance Premium", context: "FHA financing" },
            { key: "LLPA", meaning: "Loan-Level Price Adjustment", context: "Risk-based pricing at agencies/jumbo" }
        ]
    }, null, 2)],
    // Docs
    ["data/knowledge/regs/index.md", `# Regulations Index (Stub)
- TILA/RESPA reference points
- CA-specific DFPI notes
- VA gross-up reminder (e.g., 25% common)
(Expand as needed; not surfaced by API unless you choose.)\n`],
    // TS types
    ["types/knowledge.ts", `export type CountyTaxRate = { county: string; rate: number }; // 0.012 = 1.2%
export type ZipCountyMap = Record<string, string>;
export type LoanLimitRow = { county: string; oneUnit: number; twoUnit: number; threeUnit: number; fourUnit: number };
export type ProductId = "DSCR" | "ACCESS_ZERO" | "JUMBO_ADV" | "FHA" | "VA" | "FNMA" | "FHLMC";
export type ProductGuide = {
  id: ProductId;
  label: string;
  summary: string;
  notes?: string[];
  links?: { label: string; url: string }[];
  eligibilityKeys?: string[];
};
export type Acronym = { key: string; meaning: string; context?: string };
`],
    // Loader
    ["lib/knowledge.ts", `import countyData from "@/data/knowledge/taxes/countyTaxCA.json";
import limitsData from "@/data/knowledge/limits/loanLimitsCA.json";
import productData from "@/data/knowledge/products/registry.json";
import acronymsData from "@/data/knowledge/acronyms.json";

export function countyFromZip(zip: string): string | undefined {
  const z = (zip || "").trim();
  return (countyData.zipToCounty as Record<string,string>)[z];
}

export function taxRateForZip(zip: string): number | undefined {
  const county = countyFromZip(zip);
  if (!county) return undefined;
  return (countyData.countyTaxRates as {county:string; rate:number}[])
    .find(r => r.county === county)?.rate;
}

export function loanLimitsForZip(zip: string) {
  const county = countyFromZip(zip);
  if (!county) return undefined;
  return (limitsData.conformingLoanLimits as any[])
    .find(r => r.county.toLowerCase() === county.toLowerCase());
}

export function productById(id: string) {
  return (productData.registry as any[]).find(p => p.id === id);
}

export function listProducts() {
  return productData.registry as any[];
}

export function listAcronyms() {
  return acronymsData.acronyms as any[];
}
`],
    // Read-only API
    ["app/api/knowledge/route.ts", `import { NextResponse } from "next/server";
import { taxRateForZip, loanLimitsForZip, productById, listProducts, listAcronyms } from "@/lib/knowledge";

export const dynamic = "force-static";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip") || undefined;
  const product = searchParams.get("product") || undefined;

  const payload: Record<string, unknown> = {
    status: "ok",
    datasets: ["taxes", "loanLimits", "products", "acronyms"]
  };

  if (zip) {
    payload["zip"] = zip;
    payload["taxRate"] = taxRateForZip(zip) ?? null;
    payload["loanLimits"] = loanLimitsForZip(zip) ?? null;
  }

  if (product) {
    payload["product"] = product;
    payload["productInfo"] = productById(product) ?? null;
  }

  if (!zip && !product) {
    payload["products"] = listProducts();
    payload["acronyms"] = listAcronyms();
  }

  return NextResponse.json(payload, { status: 200 });
}
`]
];

function mkdirp(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function writeFile(p, c) { mkdirp(path.dirname(p)); if (!fs.existsSync(p)) fs.writeFileSync(p, c, "utf8"); }

function main() {
    if (!fs.existsSync("package.json")) {
        console.error("Run from project root (package.json not found)."); process.exit(1);
    }
    dirs.forEach(mkdirp);
    files.forEach(([p, c]) => writeFile(p, c));
    console.log("Knowledge Layer bootstrap complete.");
}
main();
/* ========== END: scripts/bootstrap-knowledge.mjs ========== */
