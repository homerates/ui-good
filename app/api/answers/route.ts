// ==== WEB-FIRST + GROK + SUPABASE (UI-SAFE): app/api/answers/route.ts ====
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { calculateMortgage } from "../../../lib/mortgageCalculator";
import {
    getGuidelineContextForQuestion,
    maybeBuildDscrOverrideAnswer,
} from "@/lib/guidelinesServer";
import { generateSourcesBundle } from "../../lib/sources-generator";
import {
    getRecentScenarioHistory,
    buildSystemPromptWithMemory,
    isFollowUpQuestion,
} from "../../../lib/memory";

// ---------- noStore helper ----------
function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

// ---------- Env ----------
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const FRED_API_KEY = process.env.FRED_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const XAI_API_KEY = process.env.XAI_API_KEY || "";
const XAI_MODEL = (process.env.XAI_MODEL || "grok-4").trim();

// Supabase (server-side client; used for memory + user_answers)
const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";

// IMPORTANT: service role only (do NOT fallback to anon)
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || "";


const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        })
        : null;

// ---------- Helper: Get or Create Default Project ----------
async function getOrCreateDefaultProject(supabase: any, userId: string): Promise<string | null> {
    try {
        const { data: existing, error: findErr } = await supabase
            .from('projects')
            .select('id')
            .eq('clerk_user_id', userId)
            .eq('name', 'Unsorted')
            .maybeSingle();

        if (findErr) {
            console.warn('[Default Project] Error finding existing:', findErr.message);
        }

        if (existing?.id) {
            return String(existing.id);
        }

        const { data: created, error: createErr } = await supabase
            .from('projects')
            .insert({
                clerk_user_id: userId,
                name: 'Unsorted'
            })
            .select('id')
            .single();

        if (createErr) {
            console.warn('[Default Project] Error creating:', createErr.message);
            return null;
        }

        console.log('[Default Project] Created "Unsorted" project for user:', userId);
        return created?.id ? String(created.id) : null;

    } catch (err: any) {
        console.error('[Default Project] Unexpected error:', err?.message || err);
        return null;
    }
}

// --- fetch with timeout (hard cap) ---

// --- fetch with timeout (hard cap) ---
async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit,
    timeoutMs: number
) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

/* ===== Types ===== */
type TavilyResult = {
    title: string;
    url: string;
    content?: string;
    snippet?: string;
};
type TavilyMini = { ok: boolean; answer: string | null; results: TavilyResult[] };

function isTavilyResultArray(v: unknown): v is TavilyResult[] {
    return (
        Array.isArray(v) &&
        v.every((r) => {
            if (!r || typeof r !== "object") return false;
            const obj = r as Record<string, unknown>;
            return typeof obj.title === "string" && typeof obj.url === "string";
        })
    );
}

function isTavilyMini(v: unknown): v is TavilyMini {
    if (!v || typeof v !== "object") return false;
    const obj = v as Record<string, unknown>;
    return (
        typeof obj.ok === "boolean" &&
        (obj.answer === null || typeof obj.answer === "string") &&
        isTavilyResultArray(obj.results)
    );
}

/* ===== Helpers ===== */
function firstParagraph(s: string, max = 800) {
    return (s.split(/\n+/)[0]?.trim() ?? "").slice(0, max);
}

function bulletsFrom(text: string, max = 4): string[] {
    const raw = text
        .split(/(?:\n+|(?<=\.)\s+)/)
        .map((t) => t.replace(/^[-•]\s*/, "").trim())
        .filter(Boolean);

    const seen = new Set<string>();
    const out: string[] = [];

    for (const line of raw) {
        const key = line.toLowerCase();
        if (!seen.has(key)) {
            out.push(line);
            seen.add(key);
        }
        if (out.length >= max) break;
    }

    return out;
}

function clampText(s: string, maxChars: number) {
    const x = (s ?? "").trim();
    if (!x) return "";
    if (x.length <= maxChars) return x;
    return x.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function compactWhitespace(s: string) {
    return (s ?? "")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function safeJsonObjectSlice(input: string): string | null {
    const s = String(input || "").trim();
    if (!s) return null;

    // Remove common fences
    let x = s.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

    // Fast path: looks like JSON object
    if (x.startsWith("{") && x.endsWith("}")) return x;

    const first = x.indexOf("{");
    if (first === -1) return null;

    // Balanced brace scan, respecting strings/escapes
    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let i = first; i < x.length; i++) {
        const ch = x[i];

        if (inStr) {
            if (esc) {
                esc = false;
            } else if (ch === "\\") {
                esc = true;
            } else if (ch === '"') {
                inStr = false;
            }
            continue;
        }

        if (ch === '"') {
            inStr = true;
            continue;
        }

        if (ch === "{") depth++;
        if (ch === "}") depth--;

        if (depth === 0) {
            return x.slice(first, i + 1);
        }
    }

    // If we never close, return null to trigger repair
    return null;
}

// ===== MORTGAGE CALCULATOR HELPERS =====
/**
 * Detect if question is about mortgage payment calculations
 */
function isMortgageCalculation(question: string): boolean {
    const hasPaymentKeywords = /payment|monthly|total interest|amortization|P&I|PITI/i.test(question);
    const hasMoneyOrPercent = /\$[\d,]+|down.*payment|\d+%/i.test(question);
    const hasMortgageContext = /home|house|property|loan|mortgage|buying|purchase/i.test(question);

    return hasPaymentKeywords && hasMoneyOrPercent && hasMortgageContext;
}

/**
 * Extract mortgage parameters from question using regex
 */
function extractMortgageParams(question: string, fredMort30Avg?: number): {
    price?: number;
    downPaymentPct?: number;
    rate?: number;
    termYears?: number;
} | null {
    // Extract price: "$850,000" or "$850k" or "850000"
    const priceMatch = question.match(/\$\s*([\d,]+(?:\.\d+)?)\s*k?\b/i);
    if (!priceMatch) return null;

    let price = parseFloat(priceMatch[1].replace(/,/g, ''));

    // Check if it's in thousands (e.g., "850k")
    if (question.match(/\$\s*[\d,]+\s*k\b/i)) {
        price *= 1000;
    }

    // Extract down payment: "10% down" or "20 percent down"
    const downMatch = question.match(/(\d+(?:\.\d+)?)\s*%?\s*down/i);
    const downPaymentPct = downMatch ? parseFloat(downMatch[1]) : 20; // Default 20%

    // Extract interest rate - look for rate mentioned AFTER down payment
    let rateMatch = question.match(/down.*?(\d+(?:\.\d+)?)\s*%/i); // Rate after "down"
    if (!rateMatch) {
        rateMatch = question.match(/(?:rate|interest|at)\s*(\d+(?:\.\d+)?)\s*%/i); // Keywords + rate
    }
    if (!rateMatch) {
        rateMatch = question.match(/(\d+(?:\.\d+)?)\s*%/); // Any percentage
    }
    const rate = rateMatch ? parseFloat(rateMatch[1]) : (fredMort30Avg || 6.0);

    // Extract term: "30 year" or "15-year"
    const termMatch = question.match(/(\d+)[\s-]?year/i);
    const termYears = termMatch ? parseInt(termMatch[1]) : 30; // Default 30 years

    return { price, downPaymentPct, rate, termYears };
}
// ===== END MORTGAGE HELPERS =====

// ===== AFFORDABILITY ADVISOR HELPERS =====

/**
 * Detect if this is an affordability/budget question
 */
function isAffordabilityQuestion(question: string): boolean {
    const text = question.toLowerCase();
    const triggers = [
        /what can i afford/i,
        /how much (home|house|property) can i (afford|buy)/i,
        /first.time buyer/i,
        /(my|our) budget/i,
        /afford.*home/i,
        /buying power/i,
        /qualify.*amount/i,
        /pre.*approval.*range/i,
        /income.*afford/i,
        /afford.*calculator/i
    ];

    return triggers.some(pattern => pattern.test(text));
}

/**
 * Extract affordability parameters from question
 */
function extractAffordabilityParams(question: string): {
    annualIncome?: number;
    savings?: number;
    monthlyDebt?: number;
    hasInfo: boolean;
} {
    const text = question.toLowerCase();

    // Income: "$95k", "95k income", "make $95,000", "120k salary"
    const incomeMatch = text.match(/\$?\s*(\d+)k?\s*(?:income|salary|make|earn|year)/i) ||
        text.match(/(?:income|salary|make|earn)\s*\$?\s*(\d+)k?/i);
    let annualIncome = incomeMatch ? parseFloat(incomeMatch[1]) : undefined;

    if (annualIncome && text.includes('k') && annualIncome < 1000) {
        annualIncome *= 1000;
    }

    // Savings: "$40k saved", "have $40,000", "down payment 50k"
    const savingsMatch = text.match(/\$?\s*(\d+)k?\s*(?:saved|down|savings)/i) ||
        text.match(/(?:have|saved)\s*\$?\s*(\d+)k?/i);
    let savings = savingsMatch ? parseFloat(savingsMatch[1]) : undefined;

    if (savings && text.includes('k') && savings < 1000) {
        savings *= 1000;
    }

    // Debt: "$300 car payment", "$500/month debt"
    const debtMatch = text.match(/\$?\s*(\d+)\s*(?:\/month|month|monthly)?\s*(?:car|debt|loan|payment)/i);
    const monthlyDebt = debtMatch ? parseFloat(debtMatch[1]) : 0;

    const hasInfo = !!(annualIncome && savings);

    return { annualIncome, savings, monthlyDebt, hasInfo };
}

/**
 * Generate 3 affordability scenarios with Fannie Mae DTI guidelines
 */
async function generateAffordabilityScenarios(params: {
    annualIncome: number;
    savings: number;
    monthlyDebt: number;
    currentRate: number;
}) {
    const { annualIncome, savings, monthlyDebt, currentRate } = params;
    const monthlyIncome = annualIncome / 12;

    const scenarios = [
        {
            level: 'Conservative',
            dtiTarget: 0.28,
            downPct: 20,
            icon: '🛡️',
            description: 'Traditional 28% DTI guideline'
        },
        {
            level: 'Comfortable',
            dtiTarget: 0.36,
            downPct: 15,
            icon: '🎯',
            description: 'Fannie Mae conventional max'
        },
        {
            level: 'Aggressive',
            dtiTarget: 0.43,
            downPct: 10,
            icon: '⚡',
            description: 'Fannie Mae absolute max DTI'
        }
    ];

    const results = [];

    for (const scenario of scenarios) {
        const maxHousingPayment = (monthlyIncome * scenario.dtiTarget) - monthlyDebt;
        const maxPI = maxHousingPayment / 1.3;

        const r = (currentRate / 100) / 12;
        const n = 30 * 12;
        const maxLoanAmount = maxPI * (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));

        const maxHomePrice = maxLoanAmount / (1 - scenario.downPct / 100);
        const downPaymentAmount = maxHomePrice * (scenario.downPct / 100);

        const adjustedHomePrice = downPaymentAmount > savings
            ? (savings * 0.95) / (scenario.downPct / 100)
            : maxHomePrice;

        const finalDownPayment = adjustedHomePrice * (scenario.downPct / 100);
        const finalLoanAmount = adjustedHomePrice - finalDownPayment;

        const { calculateMortgage: calcMortgage } = await import('../../../lib/mortgageCalculator');
        const mortgage = calcMortgage({
            price: adjustedHomePrice,
            downPaymentPct: scenario.downPct,
            rate: currentRate,
            termYears: 30
        });

        const monthlyTax = (adjustedHomePrice * 0.011) / 12;
        const monthlyInsurance = adjustedHomePrice * 0.0035 / 12;
        const monthlyPMI = scenario.downPct < 20 ? finalLoanAmount * 0.005 / 12 : 0;
        const totalMonthly = mortgage.monthlyPI + monthlyTax + monthlyInsurance + monthlyPMI;
        const actualDTI = ((totalMonthly + monthlyDebt) / monthlyIncome) * 100;

        results.push({
            level: scenario.level,
            icon: scenario.icon,
            description: scenario.description,
            homePrice: Math.round(adjustedHomePrice),
            downPaymentPct: scenario.downPct,
            downPaymentAmount: Math.round(finalDownPayment),
            loanAmount: Math.round(finalLoanAmount),
            monthlyPI: Math.round(mortgage.monthlyPI),
            monthlyTax: Math.round(monthlyTax),
            monthlyInsurance: Math.round(monthlyInsurance),
            monthlyPMI: Math.round(monthlyPMI),
            totalMonthly: Math.round(totalMonthly),
            totalInterest: Math.round(mortgage.totalInterest),
            dtiRatio: Math.round(actualDTI * 10) / 10,
            rate: currentRate
        });
    }

    return results;
}

/**
 * Generate smart, context-aware follow-up question
 */
function generateAffordabilityFollowUp(
    params: { annualIncome: number; savings: number; monthlyDebt: number },
    scenarios: any[]
): string {
    const [conservative, comfortable, aggressive] = scenarios;

    const conservativeReserves = params.savings - conservative.downPaymentAmount;
    const comfortableReserves = params.savings - comfortable.downPaymentAmount;

    const twoMonthsReserve = conservative.totalMonthly * 2;
    if (conservativeReserves < twoMonthsReserve) {
        const fhaDown = conservative.homePrice * 0.035;
        const fhaReserves = Math.round((params.savings - fhaDown) / 1000);
        return `FHA requires no reserves and you'd keep ~$${fhaReserves}k after closing. Want to see FHA scenarios vs conventional with reserves?`;
    }

    const sixMonthsReserve = conservative.totalMonthly * 6;
    if (conservativeReserves < sixMonthsReserve && comfortable.homePrice > 766000) {
        return `Jumbo loans typically require 6-12 months reserves. You have ${Math.floor(conservativeReserves / conservative.totalMonthly)} months. Want to see conforming loan options or saving strategies?`;
    }

    if (comfortable.downPaymentPct < 20) {
        const twentyPercent = comfortable.homePrice * 0.2;
        const shortfall = Math.round((twentyPercent - params.savings) / 1000);
        if (shortfall > 0 && shortfall < 50) {
            return `You're $${shortfall}k away from 20% down (avoids PMI ~$${comfortable.monthlyPMI}/mo). Want to see savings timeline or explore conventional <20% down with reserve requirements?`;
        }
    }

    if (params.monthlyDebt >= 300) {
        const budgetIncrease = Math.round((params.monthlyDebt * 3.5) / 1000);
        return `Paying off that $${params.monthlyDebt}/month debt could increase your budget by ~$${budgetIncrease}k. Want to see that scenario?`;
    }

    if (conservativeReserves > sixMonthsReserve) {
        return "You have strong reserves! Want to explore specific locations, see how rates affect buying power, or compare conventional vs jumbo programs?";
    }

    return "Want to compare FHA vs conventional reserve requirements, adjust down payment percentages, or explore different locations?";
}

/**
 * Build rich affordability answer with reserve requirements table
 */
function buildAffordabilityMarkdown(
    params: { annualIncome: number; savings: number; monthlyDebt: number },
    scenarios: any[]
): string {
    const [conservative, comfortable, aggressive] = scenarios;

    const conservativeReserves = params.savings - conservative.downPaymentAmount;
    const comfortableReserves = params.savings - comfortable.downPaymentAmount;
    const aggressiveReserves = params.savings - aggressive.downPaymentAmount;

    return `**What You Can Afford - First-Time Buyer Analysis**

Based on **$${(params.annualIncome / 1000).toFixed(0)}k annual income** and **$${(params.savings / 1000).toFixed(0)}k saved**, here are your 3 scenarios:

---

## ${conservative.icon} Conservative ($${(conservative.homePrice / 1000).toFixed(0)}k)

**Fannie Mae Guidelines: 28% DTI (Traditional)**

**Monthly Breakdown:**
- P&I: $${conservative.monthlyPI.toLocaleString()}
- Taxes/Insurance: ~$${(conservative.monthlyTax + conservative.monthlyInsurance).toLocaleString()}
${conservative.monthlyPMI > 0 ? `- PMI: $${conservative.monthlyPMI}\n` : ''}- **Total: $${conservative.totalMonthly.toLocaleString()}/month**

**Details:**
- Down payment: $${(conservative.downPaymentAmount / 1000).toFixed(0)}k (${conservative.downPaymentPct}%)
- Actual DTI: ${conservative.dtiRatio}%
- Reserves after closing: $${(conservativeReserves / 1000).toFixed(1)}k
- Total interest (30yr): $${(conservative.totalInterest / 1000).toFixed(0)}k

✅ **Best for:** Maximum financial safety${conservative.downPaymentPct >= 20 ? ', no PMI' : ''}, strong cushion

---

## ${comfortable.icon} Comfortable ($${(comfortable.homePrice / 1000).toFixed(0)}k) ⭐

**Fannie Mae Guidelines: 36% DTI (Conventional Max)**

**Monthly Breakdown:**
- P&I: $${comfortable.monthlyPI.toLocaleString()}
- Taxes/Insurance: ~$${(comfortable.monthlyTax + comfortable.monthlyInsurance).toLocaleString()}
${comfortable.monthlyPMI > 0 ? `- PMI: $${comfortable.monthlyPMI}\n` : ''}- **Total: $${comfortable.totalMonthly.toLocaleString()}/month**

**Details:**
- Down payment: $${(comfortable.downPaymentAmount / 1000).toFixed(0)}k (${comfortable.downPaymentPct}%)
- Actual DTI: ${comfortable.dtiRatio}%
- Reserves after closing: $${(comfortableReserves / 1000).toFixed(1)}k
- Total interest (30yr): $${(comfortable.totalInterest / 1000).toFixed(0)}k

✅ **Best for:** Sweet spot for most buyers - balance of options and affordability

---

## ${aggressive.icon} Aggressive ($${(aggressive.homePrice / 1000).toFixed(0)}k)

**Fannie Mae Guidelines: 43% DTI (Absolute Max)**

**Monthly Breakdown:**
- P&I: $${aggressive.monthlyPI.toLocaleString()}
- Taxes/Insurance: ~$${(aggressive.monthlyTax + aggressive.monthlyInsurance).toLocaleString()}
${aggressive.monthlyPMI > 0 ? `- PMI: $${aggressive.monthlyPMI}\n` : ''}- **Total: $${aggressive.totalMonthly.toLocaleString()}/month**

**Details:**
- Down payment: $${(aggressive.downPaymentAmount / 1000).toFixed(0)}k (${aggressive.downPaymentPct}%)
- Actual DTI: ${aggressive.dtiRatio}%
- Reserves after closing: $${(aggressiveReserves / 1000).toFixed(1)}k
- Total interest (30yr): $${(aggressive.totalInterest / 1000).toFixed(0)}k

⚠️ **Consider:** Maximum buying power but tightest budget

---

**Reserve Requirements by Program**

Different loan programs require different reserves after closing:

| Program | Minimum Reserves | Conservative | Comfortable |
|---------|------------------|--------------|-------------|
| **FHA (3.5% down)** | Typically none | $${(conservativeReserves / 1000).toFixed(0)}k ✅ | $${(comfortableReserves / 1000).toFixed(0)}k ✅ |
| **Conventional (<20%)** | 2-6 months PITI* | ${conservativeReserves >= (conservative.totalMonthly * 2) ? `$${(conservativeReserves / 1000).toFixed(0)}k ✅` : `⚠️ Need more`} | ${comfortableReserves >= (comfortable.totalMonthly * 2) ? `$${(comfortableReserves / 1000).toFixed(0)}k ✅` : `⚠️ Need more`} |
| **Conventional (20%+)** | 2-12 months PITI* | ${conservativeReserves >= (conservative.totalMonthly * 2) ? `$${(conservativeReserves / 1000).toFixed(0)}k ✅` : `⚠️ Need more`} | ${comfortableReserves >= (comfortable.totalMonthly * 2) ? `$${(comfortableReserves / 1000).toFixed(0)}k ✅` : `⚠️ Need more`} |
| **Jumbo (>$766k)** | 6-12 months PITI* | ${conservativeReserves >= (conservative.totalMonthly * 6) ? `$${(conservativeReserves / 1000).toFixed(0)}k ✅` : `⚠️ Need more`} | ${comfortableReserves >= (comfortable.totalMonthly * 6) ? `$${(comfortableReserves / 1000).toFixed(0)}k ✅` : `⚠️ Need more`} |

*PITI = Principal + Interest + Taxes + Insurance

**Note:** Reserve requirements vary by lender, credit score, and loan-to-value ratio. Higher reserves may be required for investment properties, multi-units, lower credit scores, or high DTI ratios.

---

**DTI Explained:**
- **28% DTI:** Traditional guideline - housing under 28% of gross income
- **36% DTI:** Fannie Mae conventional max - standard for most buyers
- **43% DTI:** Fannie Mae absolute max - some lenders with strong credit

**Key Insights:**

${params.monthlyDebt > 0 ? `- Factored in $${params.monthlyDebt}/month existing debt\n` : ''}- All scenarios use ${conservative.rate}% current rate
- Comfortable (36% DTI) is where most first-time buyers land
${conservativeReserves < (conservative.totalMonthly * 2) ? `- ⚠️ **Reserve Alert:** $${(conservativeReserves / 1000).toFixed(1)}k after closing is below typical 2-month requirement\n  - Consider **FHA** (no reserve requirement) or **save more**\n` : conservativeReserves < (conservative.totalMonthly * 6) ? `- ✅ **Reserves:** $${(conservativeReserves / 1000).toFixed(1)}k meets most conventional requirements\n` : `- ✅ **Strong Reserves:** $${(conservativeReserves / 1000).toFixed(1)}k exceeds most requirements\n`}${comfortable.downPaymentPct < 20 ? `- With 20% down ($${Math.round(comfortable.homePrice * 0.2 / 1000)}k), you'd avoid PMI (saves $${comfortable.monthlyPMI}/month)\n` : ''}
**Next Steps:**
1. **Get pre-approved** with 2-3 lenders (rates and reserve requirements vary)
2. **Ask about reserves** - requirements differ by program and lender
3. **Factor location** - taxes vary widely by area
4. **Consider FHA** if reserves are tight (typically no requirement)`;
}

// ===== END AFFORDABILITY HELPERS =====


type Topic =
    | "pmi"
    | "rates"
    | "fha"
    | "va"
    | "dp"
    | "dpa"
    | "jumbo"
    | "dscr"
    | "general";

function topicFromQuestion(q: string): Topic {
    const s = q.toLowerCase();
    if (/\bpmi\b|mortgage insurance/.test(s)) return "pmi";
    if (/\brates?\b|treasury|mbs|10[-\s]?year|10y\b/.test(s)) return "rates";
    if (/\bfha\b/.test(s)) return "fha";
    if (/\bva\b/.test(s)) return "va";
    if (/\bdown[-\s]?payment|\b% down\b/.test(s)) return "dp";
    if (/\bdpa\b|down payment assistance/.test(s)) return "dpa";
    if (/\bjumbo\b/.test(s)) return "jumbo";
    if (/\bdscr\b/.test(s)) return "dscr";
    return "general";
}

function followUpFor(topic: Topic): string {
    switch (topic) {
        case "pmi":
            return "Want me to estimate PMI based on your down payment and credit tier, or compare lender-paid vs borrower-paid?";
        case "rates":
            return "Are you asking generally, or for your exact scenario (state, loan type, credit range, down payment)?";
        case "fha":
            return "Do you want a 5-year cost comparison of FHA vs. Conventional at your down payment and credit score?";
        case "va":
            return "Should I calculate your VA funding fee for first vs subsequent use across down payment tiers?";
        case "dp":
            return "Want me to show how +5% down changes payment and the breakeven versus buying points?";
        case "dpa":
            return "What county and approximate income range should I use to narrow DPA options?";
        case "jumbo":
            return "What purchase price, down payment, and credit range should I assume for jumbo eligibility and reserves?";
        case "dscr":
            return "What’s the property type, ZIP, and estimated market rent so I can model DSCR and max loan?";
        default:
            return "What state/county and rough credit range should I tailor this to?";
    }
}

/* ===== Web lookup (Tavily proxy route) ===== */
async function askTavily(
    req: NextRequest,
    query: string,
    opts?: { depth?: "basic" | "advanced"; max?: number }
): Promise<TavilyMini> {
    if (!TAVILY_API_KEY) return { ok: false, answer: null, results: [] };

    const url = new URL("/api/tavily", req.url);
    const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            query,
            searchDepth: opts?.depth ?? "basic",
            maxResults: typeof opts?.max === "number" ? opts.max : 5,
        }),
        cache: "no-store",
    });

    let parsed: unknown = null;
    try {
        parsed = await res.json();
    } catch {
        /* ignore */
    }

    if (isTavilyMini(parsed)) return parsed;

    const obj = (parsed ?? {}) as Record<string, unknown>;
    const ok = !!obj.ok;
    const answer = typeof obj.answer === "string" ? (obj.answer as string) : null;
    const results = isTavilyResultArray(obj.results) ? obj.results : [];
    return { ok, answer, results };
}

/* ===== FRED snapshot (for rate questions) ===== */
type FredSnap = {
    tenYearYield: number | null;
    mort30Avg: number | null;
    spread: number | null;
    asOf: string | null;
};

async function getFredSnapshot(): Promise<FredSnap> {
    if (!FRED_API_KEY) {
        return { tenYearYield: null, mort30Avg: null, spread: null, asOf: null };
    }

    const [dgs10, m30] = await Promise.all([
        fetch(
            `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`,
            { cache: "no-store" }
        )
            .then((r) => r.json())
            .catch(() => null),
        fetch(
            `https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`,
            { cache: "no-store" }
        )
            .then((r) => r.json())
            .catch(() => null),
    ]);

    const d = (dgs10?.observations?.[0]?.value ?? null) as string | null;
    const m = (m30?.observations?.[0]?.value ?? null) as string | null;
    const asOf = (m30?.observations?.[0]?.date ??
        dgs10?.observations?.[0]?.date ??
        null) as string | null;

    const tenYearYield = d && d !== "." ? Number(d) : null;
    const mort30Avg = m && m !== "." ? Number(m) : null;
    const spread =
        tenYearYield != null && mort30Avg != null
            ? Number((mort30Avg - tenYearYield).toFixed(2))
            : null;

    return { tenYearYield, mort30Avg, spread, asOf };
}

/* ===== OpenAI summarizer for Tavily text (fallback) ===== */
async function summarizeWithOpenAI(text: string): Promise<string | null> {
    if (!OPENAI_API_KEY || !text) return null;

    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content:
                            "Summarize clearly for a US mortgage audience. Keep it concise. Include 2–4 bullet points.",
                    },
                    { role: "user", content: text },
                ],
                temperature: 0.2,
                max_tokens: 300,
            }),
            cache: "no-store",
        });

        const json = await res.json();
        const out = json?.choices?.[0]?.message?.content;
        return typeof out === "string" ? out : null;
    } catch {
        return null;
    }
}

/* ===== GROK call (single retry repair) ===== */
async function callGrokOnce(prompt: string) {
    const debug: any = {
        requestedModel: XAI_MODEL,
        servedModel: null as string | null,
        promptChars: prompt.length,
        elapsedMs: null as number | null,
        requestId: null as string | null,
        error: null as string | null,
        parseMode: null as string | null,
    };

    const t0 = Date.now();

    try {
        const res = await fetchWithTimeout(
            "https://api.x.ai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${XAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: XAI_MODEL,
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" },
                    temperature: 0.25,
                    max_tokens: 900,
                }),
                cache: "no-store",
            },
            60000
        );

        debug.requestId = res.headers.get("x-request-id") ?? res.headers.get("request-id");

        if (!res.ok) throw new Error(`Grok HTTP ${res.status}`);

        const rawText = await res.text();

        let envelope: any = null;
        try {
            envelope = JSON.parse(rawText);
        } catch {
            debug.error = "Provider envelope JSON parse failed (truncated or non-JSON)";
            return { ok: false as const, grokFinal: null, debug, raw: rawText };
        }

        debug.servedModel = envelope?.model ?? envelope?.choices?.[0]?.model ?? null;

        const content = envelope?.choices?.[0]?.message?.content?.trim();
        if (!content) {
            debug.error = "Empty Grok response";
            return { ok: false as const, grokFinal: null, debug, raw: rawText };
        }

        // Extract JSON object from content safely
        const sliced = safeJsonObjectSlice(content);

        if (!sliced) {
            debug.error = "Could not extract a balanced JSON object from Grok content";
            debug.parseMode = "extract_failed";
            return { ok: false as const, grokFinal: null, debug, raw: content };
        }

        try {
            const parsed = JSON.parse(sliced);
            return { ok: true as const, grokFinal: parsed, debug, raw: content };
        } catch (e: any) {
            debug.error = `JSON.parse failed: ${e?.message || String(e)}`;
            debug.parseMode = "parse_failed";
            return { ok: false as const, grokFinal: null, debug, raw: content };
        }
    } catch (e: any) {
        debug.error = `${e?.name || "Error"}: ${e?.message || String(e)}`;
        return { ok: false as const, grokFinal: null, debug, raw: null };
    } finally {
        debug.elapsedMs = Date.now() - t0;
    }
}

async function callGrokWithRepair(prompt: string) {
    // 1) Try once
    const first = await callGrokOnce(prompt);
    if (first.ok) return { ...first, repaired: false as const };

    // 2) One repair attempt: force minimal JSON only, no markdown fences
    const repairPrompt = compactWhitespace(`
Return ONLY valid JSON (no markdown fences, no extra commentary).
If any string contains quotes, escape them.
Schema:
{
  "answer": "Markdown only. Use: **Summary**, **Key Numbers**, **Comparison Table**, **What This Means For You**.",
  "next_step": "1–2 actions.",
  "follow_up": "One follow-up question.",
  "confidence": "0.00–1.00 numeric score plus short reason."
}

Now answer this prompt faithfully:
${prompt}
`.trim());

    const second = await callGrokOnce(repairPrompt);
    if (second.ok) return { ...second, repaired: true as const };

    return { ...second, repaired: true as const, debugFirst: first.debug };
}

/* ===== Core handler ===== */
async function handle(req: NextRequest, intentParam?: string) {
    type Body = {
        question?: string;
        intent?: string;
        mode?: "borrower" | "public";
        userId?: string;

        // NEW (Option 1): durable chat session keys
        chat_id?: string;
        chatId?: string; // allow camelCase from client
        project_id?: string;
        projectId?: string; // allow camelCase from client

        // Legacy compatibility (we DO NOT trust this when chat_id + project_id are present)
        memory_thread_id?: string;
        memoryThreadId?: string; // allow camelCase from client

        // Legacy compatibility (some clients used thread_id)
        thread_id?: string;
        threadId?: string;
    };


    // --- Timing: start ---
    const t0 = Date.now();
    const mark = (label: string) => {
        console.log(`[ANSWERS TIMER] ${label}:`, Date.now() - t0, "ms");
    };
    mark("start");

    const generatedAt = new Date().toISOString();
    const path = "answers";
    const tag = "answers-fullstack";

    let body: Body = {};
    let userId: string | undefined;

    if (req.method === "POST") {
        try {
            const raw = (await req.json()) as Body;
            body = raw;
        } catch {
            body = {} as Body;
        }
    }

    // Clerk-first user id (reliable). Fallback to body.userId if you still send it sometimes.
    try {
        const a = await auth();
        userId = a?.userId || (body as any)?.userId;
    } catch {
        userId = (body as any)?.userId;
    }
    // HR-MEMORY:THREAD-ID
    // Option 1 (server-authoritative):
    // Resolve memory_thread_id by (clerk_user_id, project_id, chat_id) via public.chat_threads.
    // Fallback to legacy client-provided memory_thread_id only if chat_id/project_id are missing.

    // ===== helpers =====
    function isUuid(v: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    }

    const chatIdRaw =
        (body as any)?.chat_id ||
        (body as any)?.chatId ||
        (body as any)?.thread_id ||
        (body as any)?.threadId ||
        req.headers.get("x-chat-id") ||
        req.nextUrl.searchParams.get("chat_id") ||
        null;

    const projectIdRaw =
        (body as any)?.project_id ||
        (body as any)?.projectId ||
        req.headers.get("x-project-id") ||
        req.nextUrl.searchParams.get("project_id") ||
        null;

    const chatId =
        typeof chatIdRaw === "string" && chatIdRaw.trim().length ? chatIdRaw.trim() : null;

    let projectId =
        typeof projectIdRaw === "string" && isUuid(projectIdRaw) ? projectIdRaw : null;

    // Auto-create "Unsorted" project if no project_id provided
    if (!projectId && userId && supabase) {
        projectId = await getOrCreateDefaultProject(supabase, userId);
        if (projectId) {
            console.log('[Auto Project] Using default "Unsorted" project:', projectId);
        }
    }

    // Legacy: only used when we cannot resolve server-side via chat_threads
    const legacyMemoryThreadIdRaw =
        (body as any)?.memory_thread_id ||
        (body as any)?.memoryThreadId ||
        req.headers.get("x-memory-thread-id") ||
        req.nextUrl.searchParams.get("memory_thread_id") ||
        null;

    let memoryThreadId: string | null =
        typeof legacyMemoryThreadIdRaw === "string" && isUuid(legacyMemoryThreadIdRaw)
            ? legacyMemoryThreadIdRaw
            : null;

    let chatThreadId: string | null = null;

    // ===== Option 1: server-authoritative resolver =====
    if (supabase && userId && projectId && chatId) {
        try {
            // Upsert the chat_threads row using the unique constraint:
            // (clerk_user_id, project_id, chat_id)
            const upsertPayload: any = {
                clerk_user_id: userId,
                project_id: projectId,
                chat_id: chatId,
                // keep legacy thread_id populated for back-compat; default to chatId
                thread_id: typeof (body as any)?.thread_id === "string" && (body as any)?.thread_id.trim()
                    ? String((body as any).thread_id).trim()
                    : chatId,
                updated_at: new Date().toISOString(),
            };

            const { data: threadRow, error: upErr } = await supabase
                .from("chat_threads")
                .upsert(upsertPayload, { onConflict: "clerk_user_id,project_id,chat_id" })
                .select("id, memory_thread_id")
                .single();

            if (upErr) {
                console.warn("ANSWERS: chat_threads upsert error", upErr.message || upErr);
            } else if (threadRow?.id) {
                chatThreadId = String(threadRow.id);
                if (threadRow.memory_thread_id) {
                    memoryThreadId = String(threadRow.memory_thread_id);
                } else {
                    // Create memory_threads row once, then bind it to chat_threads
                    const { data: created, error: mtErr } = await supabase
                        .from("memory_threads")
                        .insert({
                            clerk_user_id: userId,
                            project_id: projectId
                        })
                        .select("id")
                        .single();

                    if (!mtErr && created?.id) {
                        memoryThreadId = String(created.id);

                        const { error: bindErr } = await supabase
                            .from("chat_threads")
                            .update({
                                memory_thread_id: memoryThreadId,
                                updated_at: new Date().toISOString(),
                            })
                            .eq("id", chatThreadId);

                        if (bindErr) {
                            console.warn("ANSWERS: chat_threads bind memory_thread_id failed", bindErr.message || bindErr);
                        }
                    } else if (mtErr) {
                        console.warn("ANSWERS: memory_threads insert error", mtErr.message || mtErr);
                    } else {
                        console.warn("ANSWERS: memory_threads insert returned no id");
                    }
                }
            }
        } catch (e: any) {
            console.warn("ANSWERS: chat_threads resolver failed", e?.message || e);
        }
    }

    // ===== Legacy fallback: create memory_thread_id if none exists =====
    if (!memoryThreadId && supabase && userId) {
        try {
            const { data: created, error } = await supabase
                .from("memory_threads")
                .insert({ clerk_user_id: userId })
                .select("id")
                .single();

            if (!error && created?.id) {
                memoryThreadId = String(created.id);
            } else if (error) {
                console.warn("ANSWERS: memory thread insert error", error.message || error);
            } else {
                console.warn("ANSWERS: memory thread insert returned no id");
            }
        } catch (e: any) {
            console.warn("ANSWERS: memory thread create failed", e?.message || e);
        }
    }

    // HR-MEMORY:LOAD-CONTEXT
    // Load prior Q/A turns for this clerk_user_id + memory_thread_id from user_answers.
    let recallTurnsText = "";

    try {
        if (supabase && userId && memoryThreadId) {
            const { data: turns, error } = await supabase
                .from("user_answers")
                .select("question, answer, created_at")
                .eq("clerk_user_id", userId)
                .eq("memory_thread_id", memoryThreadId)
                .order("created_at", { ascending: false })
                .limit(6);

            if (!error && Array.isArray(turns) && turns.length) {
                const ordered = [...turns].reverse(); // chronological

                recallTurnsText = ordered
                    .map((t: any, idx: number) => {
                        const q = String(t?.question || "").trim();

                        // answer is usually an object (grokFinal). Prefer its "answer" field, else stringify safely.
                        const raw = t?.answer;
                        const a =
                            raw && typeof raw === "object"
                                ? String((raw as any).answer || JSON.stringify(raw))
                                : String(raw || "");

                        const aTrim = a.trim();
                        if (!q && !aTrim) return "";
                        return `Turn ${idx + 1}\nUser: ${q}\nAssistant: ${aTrim}`.trim();
                    })
                    .filter(Boolean)
                    .join("\n\n");
            }
        }
    } catch {
        // swallow — recall must never break answers
    }

    const question = (req.nextUrl.searchParams.get("q") || body.question || "").trim();
    const intent = (intentParam || body.intent || "web").trim() || "web";

    // Always present for UI contract
    let usedFRED = false;
    let usedTavily = false;
    let fred: FredSnap = { tenYearYield: null, mort30Avg: null, spread: null, asOf: null };
    let topSources: Array<{ title: string; url: string }> = [];

    if (!question) {
        const followUp =
            "Ask a specific mortgage question (example: PMI at 5% down, DTI basics, or what drives today’s rates). I’ll include sources when available.";
        return noStore({
            ok: true,
            memory_thread_id: memoryThreadId,
            route: "answers",
            intent,
            path,
            tag,
            generatedAt,
            usedFRED,
            usedTavily: Boolean(TAVILY_API_KEY),
            fred,
            topSources,
            grok: null,
            debug: null,
            message: followUp,
            answerMarkdown: "",
            followUp,
        });
    }

    // Topic for follow-ups and FRED
    const topic = topicFromQuestion(question);

    // MODULE ROUTING
    type ModuleKey =
        | "general"
        | "rate"
        | "refi"
        | "arm"
        | "buydown"
        | "jumbo"
        | "underwriting"
        | "dscr"
        | "qualify"
        | "about";

    let module: ModuleKey = "general";
    const q = question.toLowerCase();

    if (/(current.*rate|today.*rate|30.*year|30 year fixed|arm.*rate)/i.test(q)) {
        module = "rate";
    } else if (
        /(refinance|refi|closing costs?|break[- ]?even|loan balance|remaining.*(year|term|month)|years? left)/i.test(q)
    ) {
        module = "refi";
    } else if (
        /(how much.*qualify|qualify for|how much.*afford|afford.*home|income.*qualify|debt.*ratio|credit score.*qualify|pre.?approve)/i.test(
            q
        )
    ) {
        module = "qualify";
    } else if (/(arm\b|5\/1|7\/1|10\/1|adjustable|fixed vs arm)/i.test(q)) {
        module = "arm";
    } else if (/(points?|buy ?down|discount points?|buydown)/i.test(q)) {
        module = "buydown";
    } else if (/(jumbo|non.?conforming|high.?balance|loan limit)/i.test(q)) {
        module = "jumbo";
    } else if (
        /(underwrit|guideline|du\b|lp\b|manual underwrite|reserve|overlay|lender requirement|lender overlay|compensating factor|residual income)/i.test(
            q
        )
    ) {
        module = "underwriting";
    } else if (
        /(dscr|debt service coverage|rental income|investment property|cash flow|gross rent|pitia)/i.test(q)
    ) {
        module = "dscr";
    } else if (
        /(what is homerates|heard about homerates|tell me about this site|what makes you different|who is the founder|who built homerates|who created homerates|who made homerates|founder of homerates)/i.test(
            q
        )
    ) {
        module = "about";
    }


    // --- Module prompts ---
    const modulePrompts: Record<ModuleKey, string> = {
        general: "",

        rate:
            "You are Rate Oracle — Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Use only today’s daily retail rate trackers (Bankrate, Mortgage News Daily, Forbes or similar).\n" +
            "Never present weekly FRED averages as today’s live quote. Always describe a realistic range (e.g., 6.25–6.45%) and show the spread vs the 10-year Treasury yield.\n" +
            "Parse any user-provided location or credit profile for rate adjustments (e.g., CA jumbo +0.25%).\n" +
            "Respond in 150-250 words max. Concise, numeric focus. End with disclaimer.",

        refi:
            "You are Refi Lab — purely informational mortgage analyst in Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Your only goal is accurate, unbiased knowledge. Never sell, persuade, or hype.\n" +
            "Parse user inputs: existing rate, balance, term, income, debts, credit score, closing costs — use exactly or ask once if missing.\n" +
            "If existing rate < current market (e.g., <5.8% when market 6.3–6.5%), state plainly refinancing unlikely to reduce payment.\n" +
            "Compute precise P&I with amortization formula: M = P [r(1+r)^n / ((1+r)^n -1)] where r=monthly rate, n=months.\n" +
            "Compute breakeven = closing costs ÷ monthly savings. Show 1–3 scenarios/table.\n" +
            "Label made-up numbers as 'Example Scenario'. Remember conversation details. Tone: calm, factual, educational.\n" +
            "Respond in 150-250 words max. End with disclaimer.",

        arm:
            "You are ARM Deathmatch — Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Compare fixed-rate vs ARM over 10-year horizon. Parse user inputs: loan amount, rate, ARM period, hold time.\n" +
            "Sketch four paths: soft landing, base case, sticky inflation, recession.\n" +
            "Highlight payment/interest differences over 10 years and post-fixed period (e.g., after 5/7/10 years).\n" +
            "Flag risks if hold > fixed period. Stay numeric/scenario-based with table.\n" +
            "Respond in 150-250 words max. End with disclaimer.",

        buydown:
            "You are Buydown Lab — Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Parse user inputs: loan amount, rate, points cost — ask once if missing.\n" +
            "Label unavailable as 'Example Scenario' (e.g., $300k loan at 6.50%).\n" +
            "Assume 1 point ≈ 0.25% reduction unless specified.\n" +
            "For 0–3 points, table: points, rate, monthly P&I (amortization formula), points cost $, savings vs 0 points, breakeven month (cost ÷ savings).\n" +
            "State if using real or example numbers. Respond in 150-250 words max. End with disclaimer.",

        jumbo:
            "You are Jumbo Loan Expert — Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Parse user location for limits (e.g., CA high-cost $1,209,750 2025).\n" +
            "Use conforming baselines ($806,500 2025). Jumbo pricing 0.20–0.50% over conforming; stricter: 700+ credit, 20%+ down, 6–12 months reserves.\n" +
            "Focus on structure, eligibility, risk — no sales. Table limits by county if CA. Respond in 150-250 words max. End with disclaimer.",

        underwriting:
            "You are Underwriting Oracle — 2025 guidelines only, Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Parse user scenario: income type, credit events, property type.\n" +
            "Answer using ONLY:\n" +
            " • Fannie Mae Selling Guide (singlefamily.fanniemae.com)\n" +
            " • Freddie Mac Seller/Servicer Guide (freddiemac.com)\n" +
            " • FHA (hud.gov), VA (va.gov / benefits.va.gov), USDA, lender overlays (LoanDepot, UWM, Pennymac, Fairway, Angel Oak, Acra, Citadel, Newrez).\n" +
            "MANDATORY: Cite exact section + URL (e.g., \"Fannie B3-3.2-01 [singlefamily.fanniemae.com/selling-guide]\").\n" +
            "Never 'it depends' without rule/citation. List paths (DU vs manual, FHA vs Conventional) as Path A/B with citations.\n" +
            "Tone: clinical, factual, zero sales — like senior underwriter on decisioning. Respond in 150-250 words max. End with disclaimer.",

        dscr:
            "You are DSCR Lab — 2025 non-QM investor loan expert for residential rentals (1-4 units), Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Parse inputs: gross rent, loan amount, rate, taxes, insurance, HOA — use exactly or ask once.\n" +
            "LoanDepot DSCR RULE (Advantage FLEX DSCR): ALWAYS use 100% GROSS monthly rent.\n" +
            "• DSCR (LoanDepot) = Gross Monthly Rent ÷ PITIA.\n" +
            "• Do NOT apply 75% rent, vacancy factors, NOI, or reserves to the DSCR calculation.\n" +
            "• PITIA = P&I (amort formula) + Taxes + Insurance + HOA.\n" +
            "Key 2025: Min 0.75-1.25 (LoanDepot/Griffin/JMAC <1.0 with reserves); no personal income.\n" +
            "Structure: Definition + Formula + Example ($3k rent / $400k @ FRED rate) + Requirements + Lenders (cite Tavily). Tone: factual, empowering. Respond in 150-250 words max. End with disclaimer.",

        qualify:
            "You are Qualification Lab — fast, accurate, memory-aware, Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Parse conversation: income, debts, credit score, target payment — use ONLY given; ask once if missing.\n" +
            "Label illustrations 'Example Scenario'. Assume 6.25% 30yr fixed unless specified.\n" +
            "Use DTI guides (28/36 front/back, 31/43 FHA) for max PITI. Cite [Zillow] or [Bankrate] for calcs.\n" +
            "Table: max PITI, max loan, max home price (20% down). No fluff, no re-ask. Tone: calm, decisive. Respond in 150-250 words max. End with disclaimer.",

        about:
            "You are the dedicated About HomeRates.ai module — Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Explain HomeRates.ai: zero-sales, real-time mortgage intelligence to fix lending confusion.\n" +
            "Modes:\n" +
            "1) Product: Elevator pitch (2-3 sentences), problem (conflicting quotes/sales), solution (on-demand analysis, no pressure), how it works (Grok 4.1 reasoning, ChatGPT clarity, live data, Supabase memory), philosophy (advice > sales). End with HomeRates.ai next step (e.g., 'Analyze your scenario').\n" +
            "2) Founder: Rayaan Arif (NMLS #366082), serial entrepreneur seeing unchanged borrower pain; built for clarity/collaboration. Next step: 'Test-drive on your scenario'.\n" +
            "Rules: Focus on HomeRates.ai — no generic education. Calm, precise. Follow-ups about product only.\n" +
            "FINAL: Append disclaimer:\n" +
            "DISCLAIMER: Educational only, not financial advice. Eligibility/rates vary by profile/lender. Consult NMLS Loan Consultant.\n" +
            "Respond in 150-250 words max.",
    };


    // DSCR override hook (fast short-circuit if your lender-specific logic can answer)
    try {
        const dscrOverride = await maybeBuildDscrOverrideAnswer(question);
        if (dscrOverride) {
            return noStore({
                ok: true,
                memory_thread_id: memoryThreadId,
                route: "answers",
                intent,
                path,
                tag,
                generatedAt,
                usedFRED: false,
                usedTavily: false,
                fred: { tenYearYield: null, mort30Avg: null, spread: null, asOf: null },
                topSources: [],
                grok: null,
                debug: { bypass: "dscrOverride" },
                message: typeof dscrOverride === "string" ? dscrOverride : "Answered via DSCR override.",
                answerMarkdown: typeof dscrOverride === "string" ? `**Answer**\n${dscrOverride}\n` : `**Answer**\n${JSON.stringify(dscrOverride)}\n`,
                followUp: followUpFor(topic),
            });
        }
    } catch (e) {
        console.warn("DSCR override failed", (e as any)?.message || e);
    }

    // Lender guideline context
    let guidelineContext = "";
    if (module === "underwriting" || module === "jumbo" || module === "qualify") {
        try {
            guidelineContext = await getGuidelineContextForQuestion(question);
        } catch (err: any) {
            console.warn("Guideline context error", err?.message || err);
        }
    }

    // TAVILY QUERY – module-aware
    let tavQuery: string;

    if (module === "underwriting" || module === "qualify") {
        tavQuery = `${question} 2025 conventional mortgage guidelines site:singlefamily.fanniemae.com OR site:fanniemae.com OR site:freddiemac.com OR site:hud.gov OR site:benefits.va.gov OR site:va.gov OR site:cfpb.gov OR site:consumerfinance.gov -yahoo -aol -forum -blog -reddit -studylib -quizlet`;
    } else if (module === "rate") {
        tavQuery = `${question} 2025 mortgage rates site:bankrate.com OR site:mortgagenewsdaily.com OR site:freddiemac.com OR site:nerdwallet.com OR site:forbes.com -yahoo -aol -forum -blog -reddit`;
    } else {
        tavQuery = `${question} 2025 mortgage -yahoo -aol -forum -blog -reddit`;
    }

    let tav = await askTavily(req, tavQuery, {
        depth: module === "underwriting" || module === "qualify" ? "advanced" : "basic",
        max: 6,
    });

    // Fallback relax
    if ((!tav.answer || tav.answer.trim().length < 80) && tav.results.length < 2) {
        const fallbackQuery = `${question} mortgage 2025`;
        tav = await askTavily(req, fallbackQuery, { depth: "advanced", max: 8 });
    }

    mark("after Tavily");

    usedTavily = tav.ok && (tav.answer !== null || tav.results.length > 0);

    // FRED snapshot only when topic indicates rates
    const wantFred = topic === "rates";
    fred = wantFred
        ? await getFredSnapshot()
        : { tenYearYield: null, mort30Avg: null, spread: null, asOf: null };

    usedFRED = wantFred && (fred.tenYearYield !== null || fred.mort30Avg !== null);

    mark("after FRED");

    // Build baseline answer (legacy web stack)
    let base =
        tav.answer ??
        (tav.results.find((r) => typeof r.content === "string")?.content?.trim() ?? "");

    if (!base && tav.results.length > 0) {
        const concat = tav.results
            .map((r) => `${r.title}\n${r.content ?? r.snippet ?? ""}`)
            .join("\n\n")
            .slice(0, 8000);
        const llm = await summarizeWithOpenAI(concat);
        if (llm) base = llm;
    }

    if (!base) {
        base =
            "Here’s a concise baseline: mortgage pricing reflects the 10-year Treasury benchmark plus risk spreads. Spreads widen when volatility or risk aversion picks up and compress when markets stabilize.";
    }

    const intro = firstParagraph(base, 800);
    const bullets = bulletsFrom(base, 4);

    topSources = (tav.results || []).slice(0, 3).map((s) => ({ title: s.title, url: s.url }));
    // --- Source hygiene: US + mortgage-only allowlist (prevents junk like sports rankings) ---
    function isValidMortgageSource(s: { title: string; url: string }): boolean {
        const u = (s.url || "").toLowerCase();
        const t = (s.title || "").toLowerCase();

        const allowedDomains = [
            ".gov",
            "fanniemae.com",
            "freddiemac.com",
            "hud.gov",
            "va.gov",
            "benefits.va.gov",
            "fhfa.gov",
            "bankrate.com",
            "mortgagenewsdaily.com",
            "nerdwallet.com",
            "forbes.com",
            "consumerfinance.gov",
            "cfpb.gov",
            "loandepot.com",
        ];

        const mortgageKeywords = [
            "mortgage",
            "refinance",
            "refi",
            "loan",
            "home loan",
            "interest rate",
            "apr",
            "underwriting",
            "selling guide",
            "seller/servicer",
            "fannie",
            "freddie",
            "fha",
            "hud",
            "va",
            "fhfa",
            "dti",
            "pmi",
            "closing costs",
            "arm",
            "buydown",
            "points",
            "dscr",
            "rental",
            "pitia",
        ];

        const domainOk = allowedDomains.some((d) => u.includes(d));
        const topicOk = mortgageKeywords.some((k) => t.includes(k) || u.includes(k));

        return domainOk && topicOk;
    }

    topSources = topSources.filter(isValidMortgageSource).slice(0, 3);

    const sourcesMd = topSources.map((s) => `- [${s.title}](${s.url})`).join("\n");

    const fredLine = usedFRED
        ? `\n\n**FRED snapshot**: 10y=${fred.tenYearYield ?? "—"}%, 30y mtg avg=${fred.mort30Avg ?? "—"}%, spread=${fred.spread ?? "—"} (${fred.asOf ?? "latest"})`
        : "";

    const legacyAnswerMarkdown = [
        intro,
        bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : "",
        topSources.length ? `\n**Sources**\n${sourcesMd}` : "",
        fredLine,
    ]
        .filter(Boolean)
        .join("\n\n");

    const legacyAnswer = intro || legacyAnswerMarkdown;

    mark("after baseline answer");

    // ===== GROK BRAIN =====
    // HR-MEMORY:LOAD-CONTEXT
    // Load recent Q/A pairs for this memory_thread_id to enable follow-up continuity.
    // This context is injected into the Grok prompt.

    let conversationHistory = "";
    if (userId && supabase) {
        try {
            const { data: history } = await supabase
                // HR-MEMORY:LOAD-CONTEXT:SUPABASE

                .from("user_answers")
                .select("question, answer_summary, answer")
                .eq("clerk_user_id", userId)
                .eq("memory_thread_id", memoryThreadId)
                .or("tool_id.is.null,tool_id.neq.library_route")
                .order("created_at", { ascending: false })
                .limit(3);

            if (history?.length) {
                conversationHistory = history
                    .reverse()
                    .map((entry: any) => {
                        const prev =
                            entry.answer_summary ||
                            (typeof entry.answer === "object" && entry.answer?.answer
                                ? String(entry.answer.answer).slice(0, 200) + "…"
                                : "Previous answer");
                        return `User: ${entry.question}\nAssistant: ${prev}`;
                    })
                    .join("\n\n");
            }
        } catch (err: any) {
            console.warn("ANSWERS: history fetch failed", err?.message || err);
        }
    }

    mark("after history fetch");

    // Compact context blocks hard
    const today = new Date().toISOString().slice(0, 10);

    const fredContext = usedFRED
        ? `FRED (${fred.asOf || today}): 30Y fixed avg=${fred.mort30Avg}%, 10Y=${fred.tenYearYield}%, spread=${fred.spread}%`
        : "FRED data unavailable";

    const tavilyContextRaw =
        Array.isArray(tav.results) && tav.results.length
            ? tav.results
                .slice(0, 4)
                .map((s) => `• ${s.title}: ${(s.snippet || s.content || "").slice(0, 140)}…`)
                .join("\n")
            : "No recent sources";

    const specialistPrefix = clampText(compactWhitespace(modulePrompts[module] ?? ""), 450);
    const guidelineCtxTrim = clampText(compactWhitespace(guidelineContext || ""), 300);
    const tavilyCtxTrim = clampText(compactWhitespace(tavilyContextRaw), 240);
    const conversationTrim = clampText(compactWhitespace(conversationHistory || ""), 320);

    // Refi guardrail: ask for inputs only if missing; otherwise compute locally (no Grok)
    if (module === "refi") {
        // ---- helpers (scoped only to refi, so we don’t impact the rest of the file) ----
        const parseMoney = (s: string) => {
            const cleaned = s.replace(/[, ]/g, "").replace(/\$/g, "");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : null;
        };

        const parsePercent = (s: string) => {
            const cleaned = s.replace(/[% ]/g, "");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : null;
        };

        const parseYearsLeft = (text: string) => {
            const s = text.toLowerCase();

            // Examples:
            // "25 years left"
            // "years left 25"
            // "remaining term 25 years"
            const m1 = s.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:left|remaining)?/i);
            if (m1?.[1]) {
                const y = Number(m1[1]);
                return Number.isFinite(y) ? Math.round(y * 12) : null;
            }

            // Examples:
            // "300 months left"
            // "months remaining 240"
            const m2 = s.match(/(\d+)\s*(?:months?|mos?)\s*(?:left|remaining)?/i);
            if (m2?.[1]) {
                const mo = Number(m2[1]);
                return Number.isFinite(mo) ? Math.round(mo) : null;
            }

            return null;
        };

        const monthlyPI = (principal: number, annualRatePct: number, months: number) => {
            const r = (annualRatePct / 100) / 12;
            if (months <= 0) return null;
            if (r === 0) return principal / months;
            const pow = Math.pow(1 + r, months);
            return principal * (r * pow) / (pow - 1);
        };

        const qText = question;

        // Try to infer the 5 inputs from a single prompt.
        // We accept loose phrasing like:
        // "balance $650,000 at 3.75%, 25 years left, $6,000 costs, new rate 6.25%"
        const balanceMatch = qText.match(/\b(balance|loan balance|principal)\b[^0-9$]*\$?\s*([\d,]+(?:\.\d+)?)/i) ?? qText.match(/\$\s*([\d,]+(?:\.\d+)?)/);
        const currentRateMatch = qText.match(/\b(?:current\s*rate|at)\b[^0-9]*([\d.]+)\s*%/i);
        const newRateMatch =
            qText.match(/\b(?:new\s*rate|to|refi\s*to|considering)\b[^0-9]*([\d.]+)\s*%/i) ??
            (() => {
                // fallback: if two % appear, treat first as current and second as new
                const all = Array.from(qText.matchAll(/([\d.]+)\s*%/g)).map((m) => m[1]);
                return all.length >= 2 ? ({ 1: all[all.length - 1] } as any) : null;
            })();

        const costsMatch =
            qText.match(/\b(?:costs?|closing costs?|fees?)\b[^0-9$]*\$?\s*([\d,]+(?:\.\d+)?)/i) ??
            qText.match(/\b\$?\s*([\d,]+(?:\.\d+)?)\s*(?:costs?|fees?)\b/i);

        const monthsLeft = parseYearsLeft(qText);

        const balance =
            balanceMatch
                ? parseMoney(balanceMatch[2] ?? balanceMatch[1] ?? "")
                : null;

        const currentRate =
            currentRateMatch?.[1] ? parsePercent(currentRateMatch[1]) : null;

        const newRate =
            (newRateMatch as any)?.[1] ? parsePercent((newRateMatch as any)[1]) : null;

        const closingCosts =
            costsMatch?.[1] ? parseMoney(costsMatch[1]) : null;

        const missing: string[] = [];
        if (!balance) missing.push("current loan balance");
        if (!currentRate) missing.push("current interest rate");
        if (!monthsLeft) missing.push("remaining term (years or months left)");
        if (closingCosts === null) missing.push("estimated closing costs (or lender credit)");
        if (!newRate) missing.push("new interest rate you’re considering");

        // If any are missing, keep your existing “ask for 5 inputs” behavior.
        if (missing.length > 0) {
            const followUp =
                "Reply with: current loan balance, current interest rate, remaining term (years or months), estimated closing costs (or lender credit), and the new rate you’re considering.";

            return noStore({
                ok: true,
                memory_thread_id: memoryThreadId,
                route: "answers",
                intent,
                path,
                tag,
                generatedAt,
                usedFRED,
                usedTavily,
                fred,
                topSources,
                grok: null,
                debug: { bypass: "refi_missing_inputs_guardrail", missing },
                message: followUp,
                answerMarkdown:
                    "**Refi Lab needs 5 inputs**\n\n" +
                    "- Current loan balance\n" +
                    "- Current interest rate\n" +
                    "- Remaining term (years or months left)\n" +
                    "- Estimated closing costs (or lender credit)\n" +
                    "- New interest rate you’re considering\n\n" +
                    "Once you send those, I’ll calculate current vs new P&I, monthly savings, breakeven, and payment sensitivity.",
                followUp,
            });
        }

        // Otherwise compute locally (NO Grok).
        const curPI = monthlyPI(balance!, currentRate!, monthsLeft!);
        const newPI = monthlyPI(balance!, newRate!, monthsLeft!);

        // Safety
        if (curPI == null || newPI == null) {
            const followUp =
                "Quick check: confirm your balance, current rate, years/months left, costs/credit, and the new rate you’re considering.";
            return noStore({
                ok: true,
                memory_thread_id: memoryThreadId,
                route: "answers",
                intent,
                path,
                tag,
                generatedAt,
                usedFRED,
                usedTavily,
                fred,
                topSources,
                grok: null,
                debug: { bypass: "refi_calc_failed" },
                message: followUp,
                answerMarkdown: `**Answer**\nI couldn’t safely compute the payment from what I parsed. ${followUp}\n`,
                followUp,
            });
        }

        const monthlyChange = newPI - curPI;
        const monthlySavings = curPI - newPI;
        const breakevenMonths =
            closingCosts! > 0 && monthlySavings > 0 ? (closingCosts! / monthlySavings) : null;

        const fmt = (n: number) =>
            n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const beLine =
            breakevenMonths == null
                ? "Breakeven: not applicable (either costs are $0, or the new payment is not lower)."
                : `Breakeven: ~${Math.ceil(breakevenMonths)} months (~${fmt(Math.ceil(breakevenMonths) / 12)} years)`;

        const followUp =
            "Do you want this as (A) payment-only P&I or (B) full PITI with taxes/insurance/HOA and any PMI?";

        return noStore({
            ok: true,
            memory_thread_id: memoryThreadId,
            route: "answers",
            intent,
            path,
            tag,
            generatedAt,
            usedFRED,
            usedTavily,
            fred,
            topSources,
            grok: null,
            debug: { bypass: "refi_local_math", parsed: { balance, currentRate, monthsLeft, closingCosts, newRate } },
            message: "Refi comparison computed.",
            answerMarkdown:
                `**Answer**\n` +
                `**Summary**\n` +
                `Here’s the payment impact using your provided inputs (principal + interest only).\n\n` +
                `**Key Numbers**\n` +
                `- Current P&I: $${fmt(curPI)}\n` +
                `- New P&I: $${fmt(newPI)}\n` +
                `- Monthly change (new - current): $${fmt(monthlyChange)}\n` +
                `- Closing costs assumed: $${fmt(closingCosts!)}\n` +
                `- ${beLine}\n\n` +
                `**Comparison Table**\n` +
                `| Item | Current | New |\n` +
                `|---|---:|---:|\n` +
                `| Rate | ${fmt(currentRate!)}% | ${fmt(newRate!)}% |\n` +
                `| Term remaining | ${monthsLeft!} months | ${monthsLeft!} months |\n` +
                `| P&I payment | $${fmt(curPI)} | $${fmt(newPI)} |\n\n` +
                `**What This Means For You**\n` +
                `If the new rate is higher, the payment rises and breakeven typically won’t exist unless the refinance accomplishes something else (cash-out, term reset, removing MI, etc.). If you want the full picture, I can add taxes, insurance, HOA, and any MI.\n`,
            followUp,
        });
    }
    // HR-MEMORY:GROK-CALL
    // Inject prior conversation context + current user question into Grok

    // ========== MORTGAGE CALCULATOR PRE-CALCULATION ==========
    let mortgageCalcContext = "";

    if (isMortgageCalculation(question)) {
        const params = extractMortgageParams(question, fred?.mort30Avg ?? undefined);

        if (params && params.price) {
            try {
                console.log('[Mortgage Calc] Detected question, calling calculator with:', params);

                const { calculateMortgage, compareRates } =
                    await import('../../../lib/mortgageCalculator');

                const result = calculateMortgage({
                    price: params.price,
                    downPaymentPct: params.downPaymentPct!,
                    rate: params.rate!,
                    termYears: params.termYears!,
                });

                const scenarios = compareRates(
                    params.price,
                    params.downPaymentPct!,
                    params.termYears!,
                    [params.rate! - 0.25, params.rate!, params.rate! + 0.25]
                );

                mortgageCalcContext = `
MORTGAGE CALCULATION (PRE-CALCULATED - USE THESE EXACT VALUES):

Input Parameters:
- Home Price: $${result.homePrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
- Down Payment: $${result.downPayment.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${result.downPaymentPct}%)
- Loan Amount: $${result.loanAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
- Interest Rate: ${result.rateAnnual}%
- Term: ${result.termYears} years

Calculated Results (100% ACCURATE):
- Monthly P&I Payment: $${result.monthlyPI.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Total Amount Paid: $${result.totalPayments.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
- Total Interest Paid: $${result.totalInterest.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}

Rate Comparison Scenarios:
${scenarios.map(s => '- ' + s.label + ': Monthly P&I = $' + s.monthlyPI.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ', Total Interest = $' + s.totalInterest.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })).join('\n')}

CRITICAL: Use these numbers EXACTLY in your response. Do NOT recalculate.
`;

                console.log('[Mortgage Calc] Pre-calculated:', {
                    monthlyPI: result.monthlyPI,
                    totalInterest: result.totalInterest
                });

            } catch (err: any) {
                console.error('[Mortgage Calc] Error:', err.message);
            }
        }
    }
    // ========== END MORTGAGE CALCULATOR ==========
    // ========== AFFORDABILITY ADVISOR CHECK ==========
    let affordabilityAnswer = null;

    if (isAffordabilityQuestion(question)) {
        console.log('[Affordability] Detected affordability question');

        const affordParams = extractAffordabilityParams(question);

        if (affordParams.hasInfo) {
            // User provided income and savings - generate scenarios
            console.log('[Affordability] Generating scenarios:', affordParams);

            const scenarios = await generateAffordabilityScenarios({
                annualIncome: affordParams.annualIncome!,
                savings: affordParams.savings!,
                monthlyDebt: affordParams.monthlyDebt || 0,
                currentRate: fred?.mort30Avg || 6.01
            });

            const affordabilityMarkdown = buildAffordabilityMarkdown(
                {
                    annualIncome: affordParams.annualIncome!,
                    savings: affordParams.savings!,
                    monthlyDebt: affordParams.monthlyDebt || 0
                },
                scenarios
            );

            // Generate smart follow-up based on their situation
            const smartFollowUp = generateAffordabilityFollowUp(
                {
                    annualIncome: affordParams.annualIncome!,
                    savings: affordParams.savings!,
                    monthlyDebt: affordParams.monthlyDebt || 0
                },
                scenarios
            );

            affordabilityAnswer = {
                answer: affordabilityMarkdown,
                next_step: "Get pre-approved with 2-3 lenders to compare rates and confirm qualification.",
                follow_up: smartFollowUp,  // ← Make sure this line uses smartFollowUp
                confidence: "1.00 (calculated using verified mortgage formulas + Fannie Mae DTI guidelines)"
            };


        } else {
            // User asked about affordability but didn't provide info yet
            console.log('[Affordability] Asking for info');

            affordabilityAnswer = {
                answer: `**Let's figure out what you can afford!**

To give you accurate scenarios, I need:
- **Annual income** (salary/wages before taxes)
- **Savings** (amount available for down payment)

**Optional:**
- Monthly debt payments (car, student loans, credit cards)
- Target location (for tax estimates)

**Example:** "I make $95k/year and have $40k saved"

**Or be more specific:** "I make $120k, have $20k saved, $300/month car payment, looking in Austin"

What's your situation?`,
                next_step: "Share your income and savings so I can show you 3 affordability scenarios (Conservative, Comfortable, Aggressive).",
                follow_up: "What's your annual income and how much do you have saved?",
                confidence: "1.00 (interactive advisor - ready to calculate)"
            };
        }
    }
    // ========== END AFFORDABILITY CHECK ==========

    let grokPrompt = compactWhitespace(
        `
${specialistPrefix}

You are HomeRates.ai. Calm, precise, data-first. Never sell. Never hype.
If lender guideline context is provided, treat it as primary for that lender.

Date: ${today}
${fredContext}

${mortgageCalcContext}

LENDER GUIDELINE CONTEXT:
${guidelineCtxTrim || "None"}

Latest signals:
${tavilyCtxTrim || "None"}

Conversation:
${conversationTrim || "None"}

Current question:
"${question}"

ABSOLUTE RULES:
- Do NOT invent numbers, rates, payments, fees, or scenario facts unless the user explicitly asks for an example.
- If MORTGAGE CALCULATION context is provided above, use those numbers EXACTLY. Do not recalculate.
- When user does NOT specify a rate, use the FRED 30Y fixed average rate shown above. Do NOT use rates from "Latest signals" unless user asks for current market rates.
- Markdown only inside the "answer" field. Never output HTML.
- Keep total length around 180–350 words unless asked for more.

Return valid JSON only:
{
  "answer": "Use sections: **Summary**, **Key Numbers**, **Comparison Table** (at least one markdown table), **What This Means For You**.",
  "next_step": "1–2 concrete actions.",
  "follow_up": "One sharp follow-up question.",
  "confidence": "0.00–1.00 numeric score plus a short reason."
}
`.trim()
    );

    let grokFinal: any = null;
    let debug: any = null;

    let sourcesInjected = false;
    // ========== END AFFORDABILITY CHECK ==========


    mark("before Grok call");

    let scenarioMemoryContext = "";
    try {
        if (supabase && memoryThreadId && isFollowUpQuestion(question)) {
            const scenarioHistory = await getRecentScenarioHistory(supabase, memoryThreadId, 3);
            if (scenarioHistory && scenarioHistory.length > 0) {
                scenarioMemoryContext = buildSystemPromptWithMemory("", question, scenarioHistory);
                console.log('[Memory] Added scenario context from', scenarioHistory.length, 'previous scenarios');
            }
        }
    } catch (err) {
        console.warn('[Memory] Failed to fetch scenario context:', err);
    }

    if (typeof recallTurnsText === "string" && recallTurnsText.trim()) {
        grokPrompt =
            "Prior conversation context (same user, same memory_thread_id):\n" +
            recallTurnsText +
            "\n\nIMPORTANT: When answering the current question below, use the MOST RECENT values from the conversation above. " +
            "If the user is asking 'what if X changes', keep all other values from the most recent turn and only change X. " +
            "Reference the previous scenario in your answer (e.g., 'Based on your previous scenario...').\n\n" +
            "Current question:\n" +
            grokPrompt;
    }

    if (scenarioMemoryContext) {
        grokPrompt = scenarioMemoryContext + "\n\n" + grokPrompt;
    }

    if (affordabilityAnswer) {
        // Skip Grok, use affordability answer
        grokFinal = affordabilityAnswer;
        debug = {
            requestedModel: "affordability-advisor",
            servedModel: "internal-calculator",
            promptChars: question.length,
            elapsedMs: 0,
            requestId: "affordability-" + Date.now(),
            parseMode: "direct",
            repaired: false
        };
        console.log('[Affordability] Returning direct answer, skipping Grok');
    } else if (XAI_API_KEY) {
        const result = await callGrokWithRepair(grokPrompt);
        debug = {
            ...result.debug,
            repaired: result.repaired,
            debugFirst: (result as any).debugFirst ?? null,
        };

        if (result.ok) {
            grokFinal = result.grokFinal;
            if (
                !grokFinal ||
                typeof grokFinal !== "object" ||
                !grokFinal.answer ||
                !grokFinal.next_step ||
                !grokFinal.follow_up ||
                !grokFinal.confidence
            ) {
                debug.error = debug.error || "Missing required fields in Grok JSON";
                grokFinal = null;
            }
        }
    } else {
        debug = { bypass: "missing_XAI_API_KEY" };
    }

    mark("after Grok call");

    if (grokFinal) {
        try {
            const bundle = await generateSourcesBundle({
                topic: `${question} ${module}`,
                reqUrl: req.url,
            });

            if (bundle.mode === "core") {
                topSources = bundle.sources.map((s: { title: string; url: string }) => ({
                    title: s.title,
                    url: s.url,
                }));
            }
        } catch (e: any) {
            console.warn("Sources bundle failed", e?.message || e);
        }
    }

    if (grokFinal && userId && supabase) {
        try {
            let projectIdForAnswer = projectId;

            if (!projectIdForAnswer && chatThreadId) {
                const { data: threadData } = await supabase
                    .from('chat_threads')
                    .select('project_id')
                    .eq('id', chatThreadId)
                    .single();

                if (threadData?.project_id) {
                    projectIdForAnswer = threadData.project_id;
                    console.log('[Project Link] Got project_id from chat_threads:', projectIdForAnswer);
                }
            }

            await supabase.from("user_answers").insert({
                clerk_user_id: userId,
                chat_thread_id: chatThreadId,
                memory_thread_id: memoryThreadId,
                project_id: projectIdForAnswer,
                question,
                answer: grokFinal,
                answer_summary:
                    typeof grokFinal.answer === "string" ? String(grokFinal.answer).slice(0, 320) + "…" : "",
                model: XAI_MODEL,
                created_at: new Date().toISOString(),
            });
        } catch (err: any) {
            console.warn("ANSWERS: save failed", err?.message || err);
        }
    }

    const finalMarkdown = grokFinal
        ? `**Answer**\n${String(grokFinal.answer)}\n\n**Confidence**: ${String(
            grokFinal.confidence
        )}\n${!sourcesInjected && topSources.length ? `\n**Sources**\n${sourcesMd}\n` : ""}${fredLine || ""}`
        : legacyAnswerMarkdown;

    const message = grokFinal?.answer || legacyAnswer;

    mark("end (before return)");

    return noStore({
        ok: true,
        memory_thread_id: memoryThreadId,
        chat_id: chatId,
        project_id: projectId,
        chat_thread_id: chatThreadId,
        route: "answers",
        intent,
        path,
        tag,
        generatedAt,
        usedFRED,
        usedTavily,
        fred,
        topSources,
        grok: grokFinal || null,
        debug,
        data_freshness: grokFinal ? `Live (${XAI_MODEL})` : "Legacy stack",
        message,
        answerMarkdown: finalMarkdown,
        followUp: grokFinal?.follow_up || followUpFor(topic),
    });
}

export async function POST(req: NextRequest) {
    return handle(req);
}

export async function GET(req: NextRequest) {
    const intent = req.nextUrl.searchParams.get("intent") || undefined;
    return handle(req, intent);
}