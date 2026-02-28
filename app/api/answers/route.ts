// ==== WEB-FIRST + GROK + SUPABASE (UI-SAFE): app/api/answers/route.ts ====
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { calculateMortgage, compareRates } from "../../../lib/mortgageCalculator";
import { calculateFHA, compareFHAvsConventional } from "../../../lib/fhaCalculator";
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

    // Never steal FHA-specific questions
    if (/\bfha\b/i.test(text)) return false;

    const triggers = [
        /what can i afford/i,
        /how much (home|house|property) can i (afford|buy)/i,
        /first.time buyer/i,
        /first.time home/i,
        /first home/i,
        /(my|our) budget/i,
        /afford.*home/i,
        /buying power/i,
        /qualify.*amount/i,
        /pre.*approval.*range/i,
        /income.*afford/i,
        /afford.*calculator/i
    ];

    if (triggers.some(pattern => pattern.test(text))) return true;

    // Also trigger when user provides income + savings together (implied affordability question)
    const hasIncome = /(?:make|earn|income|salary|i\s+make|we\s+make|gross|making|earning)\s*(?:is\s*|of\s*)?[\s\S]{0,20}[\$]?\s*\d[\d,k]+/i.test(text) ||
        /[\$]?\s*\d[\d,k]+\s*(?:income|salary|a year|\/year|per year|annually)/i.test(text);
    const hasSavings = /(?:have|saved|savings|got|saving)\s*[\$]?\s*\d[\d,k]+/i.test(text) ||
        /[\$]?\s*\d[\d,k]+\s*(?:saved|savings|in savings|in the bank|in the bank|available|liquid|cash)/i.test(text) ||
        /(?:bank|savings).*\$?\s*\d[\d,k]+/i.test(text);

    if (hasIncome && hasSavings) return true;

    // Also trigger for "home buying options" / "options" when income context present
    const hasOptions = /(?:home buying|buying|purchase|buy)\s*(?:options|scenarios|choices)/i.test(text) ||
        /(?:what are my|show me|what(?:'s| is) my)\s*options/i.test(text);

    return hasIncome && hasOptions;
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

    // Income: "$95k/year", "income $65k", "make $95,000", "120k salary", "earn 80k a year"
    const incomeMatch = text.match(/(?:make|earn|income|salary|making|earning)\s*(?:is\s*|of\s*|about\s*)?\$?\s*(\d+(?:,\d{3})*)k?\s*(?:\/year|a year|per year|year|annually)?/i) ||
        text.match(/\$?\s*(\d+(?:,\d{3})*)k?\s*(?:income|salary|a year|\/year|per year|annually)/i) ||
        text.match(/\$?\s*(\d+)k\s*(?:a year|year|salary|income)?/i);
    let annualIncome = incomeMatch ? parseFloat(incomeMatch[1]) : undefined;

    if (incomeMatch && annualIncome && /k\b/i.test(incomeMatch[0]) && annualIncome < 1000) {
        annualIncome *= 1000;
    }

    // Savings: "$40k saved", "savings $15k", "$20k in the bank", "20k available", "$50k down"
    // IMPORTANT: Must NOT match debt patterns like "$700 monthly debts" or "$300 car payment"
    const debtKeywords = /(?:monthly|month|\/mo|per month|debt|payment|loan|car|student|credit)/i;
    const rawSavingsMatches = [
        text.match(/\$?\s*(\d+(?:,\d{3})*)k?\s*(?:saved|savings|in the bank|in savings|available|down payment)/i),
        text.match(/(?:savings|saved)\s*(?:of\s*)?\$?\s*(\d+(?:,\d{3})*)k?/i),
        text.match(/(?:have|with|got)\s*\$?\s*(\d+(?:,\d{3})*)k?\s*(?:saved|savings|in the bank|in savings|available|cash|liquid|set aside)/i),
        text.match(/\$?\s*(\d+(?:,\d{3})*)k?\s*(?:in the bank|in savings|available|liquid|cash)/i),
    ];
    // Filter out any match where the surrounding context looks like a debt amount
    const savingsMatch = rawSavingsMatches.find(m => {
        if (!m) return false;
        const idx = m.index ?? 0;
        const surrounding = text.slice(Math.max(0, idx - 5), idx + m[0].length + 25);
        return !debtKeywords.test(surrounding);
    }) || null;
    let savings = savingsMatch ? parseFloat(savingsMatch[1]) : undefined;

    if (savingsMatch && savings && /k\b/i.test(savingsMatch[0]) && savings < 1000) {
        savings *= 1000;
    }

    // Debt: "$300 car payment", "$500/month debt", "$800 in monthly debt"
    const debtMatch = text.match(/\$?\s*(\d+)\s*(?:car|student|monthly|month|\/month)\s*(?:payment|debt|loan)/i) ||
        text.match(/\$?\s*(\d+)\s*(?:\/mo|per month|monthly|a month|month)\s*(?:in\s*)?(?:debt|payments?|obligations?)/i) ||
        text.match(/(?:car|student|credit)\s*(?:payment|loan|debt)[^\d]*\$?\s*(\d+)/i) ||
        text.match(/\$?\s*(\d+)\s*(?:car payment|student loan|debt payment|loan payment)/i);
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

    // Income-based annuity factor (shared)
    const r = (currentRate / 100) / 12;
    const n = 30 * 12;
    const annuityFactor = (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));

    // Helper: given DTI target and down%, compute income-qualified home price
    // Uses iterative solver to hit DTI exactly — no approximation overshoot
    function calcScenario(dtiTarget: number, downPct: number, label: string, icon: string, program: string, closingCostPct: number = 0.03) {
        const maxTotalHousing = (monthlyIncome * dtiTarget) - monthlyDebt; // max PITI+MI

        // Iterative solve: start with PI = 85% of budget, refine 5x
        // Each iteration: compute home price → actual taxes+ins+PMI → adjust PI budget
        let maxPI = maxTotalHousing * 0.85;
        let homePrice = 0;
        for (let i = 0; i < 6; i++) {
            const loan = maxPI * annuityFactor;
            homePrice = loan / (1 - downPct / 100);
            const monthlyTaxIns = (homePrice * (0.011 + 0.0035)) / 12;
            const monthlyPMIest = downPct < 20 ? (loan * 0.005 / 12) : 0;
            maxPI = maxTotalHousing - monthlyTaxIns - monthlyPMIest;
            if (maxPI <= 0) { maxPI = maxTotalHousing * 0.5; break; }
        }

        const baseLoanAmount = homePrice * (1 - downPct / 100);
        const downPaymentAmount = homePrice * (downPct / 100);

        // FHA UFMIP: 1.75% of base loan, financed into the loan
        const isFHA = program === 'FHA';
        const ufmip = isFHA ? Math.round(baseLoanAmount * 0.0175) : 0;
        const loanAmount = baseLoanAmount + ufmip; // total financed amount

        const closingCosts = homePrice * closingCostPct; // closing costs separate from UFMIP
        const totalCashNeeded = downPaymentAmount + closingCosts; // UFMIP is financed, not cash
        const savingsGap = Math.max(0, totalCashNeeded - savings);
        const savingsAfterClose = Math.max(0, savings - totalCashNeeded);

        const mortgage = calculateMortgage({ price: homePrice, downPaymentPct: downPct, rate: currentRate, termYears: 30 });
        // Recalculate P&I on the full financed amount (including UFMIP for FHA)
        const rMonthly = (currentRate / 100) / 12;
        const nPayments = 30 * 12;
        const monthlyPI = loanAmount * (rMonthly * Math.pow(1 + rMonthly, nPayments)) / (Math.pow(1 + rMonthly, nPayments) - 1);

        const monthlyTax = (homePrice * 0.011) / 12;
        const monthlyInsurance = homePrice * 0.0035 / 12;
        // FHA MIP: 0.55%/yr on loan balance (for >15yr, LTV >90%)
        // Conventional PMI: 0.5%/yr
        const monthlyMI = isFHA ? (baseLoanAmount * 0.0055 / 12) : (downPct < 20 ? baseLoanAmount * 0.005 / 12 : 0);
        const totalMonthly = monthlyPI + monthlyTax + monthlyInsurance + monthlyMI;
        const actualDTI = ((totalMonthly + monthlyDebt) / monthlyIncome) * 100;
        const totalInterest = (monthlyPI * nPayments) - loanAmount;

        return {
            label, icon, program, dtiTarget,
            homePrice: Math.round(homePrice),
            downPaymentPct: downPct,
            downPaymentAmount: Math.round(downPaymentAmount),
            baseLoanAmount: Math.round(baseLoanAmount),
            ufmip: Math.round(ufmip),
            loanAmount: Math.round(loanAmount),
            closingCosts: Math.round(closingCosts),
            totalCashNeeded: Math.round(totalCashNeeded),
            savingsGap: Math.round(savingsGap),
            savingsAfterClose: Math.round(savingsAfterClose),
            monthlyPI: Math.round(monthlyPI),
            monthlyTax: Math.round(monthlyTax),
            monthlyInsurance: Math.round(monthlyInsurance),
            monthlyMI: Math.round(monthlyMI),
            totalMonthly: Math.round(totalMonthly),
            totalInterest: Math.round(totalInterest),
            dtiRatio: Math.round(actualDTI * 10) / 10,
            rate: currentRate,
            isFHA,
        };
    }

    // 3 scenarios: FHA 3.5%, Conventional 3%, Conventional 20%
    const results = [
        calcScenario(0.43, 3.5, 'FHA (3.5% down)', '🏠', 'FHA'),
        calcScenario(0.43, 3.0, 'Conventional (3% down)', '🎯', 'Conventional'),
        calcScenario(0.43, 20.0, 'Conventional (20% down)', '🛡️', 'Conventional'),
    ];

    return results;
}

/**
 * Generate smart, context-aware follow-up question
 */
function generateAffordabilityFollowUp(
    params: { annualIncome: number; savings: number; monthlyDebt: number },
    scenarios: any[]
): Array<{ label: string; seed: string }> {
    const [fha, conv3, conv20] = scenarios;

    const chips: Array<{ label: string; seed: string }> = [];
    const incomeK = Math.round(params.annualIncome / 1000);
    const savingsK = Math.round(params.savings / 1000);
    const fhaPriceK = Math.round(fha.homePrice / 1000);
    const conv3PriceK = Math.round(conv3.homePrice / 1000);

    if (fha.savingsGap > 0) {
        const gapK = Math.round(fha.savingsGap / 1000);
        const months1k = Math.ceil(fha.savingsGap / 1000);
        chips.push({
            label: `$${gapK}k short of closing — what's the highest price I can buy TODAY with $${savingsK}k?`,
            seed: `What's the highest home price I can close on right now with $${savingsK}k saved and $${incomeK}k income?`
        });
        chips.push({
            label: `Can gift funds cover my FHA down payment gap?`,
            seed: `Can gift funds cover my FHA down payment? I need $${gapK}k more with $${incomeK}k income`
        });
        chips.push({
            label: `What if I save $1,500/mo — how many months to be ready?`,
            seed: `How long until I can buy if I save $1,500/month? I need $${gapK}k more for FHA closing`
        });
    } else if (params.monthlyDebt >= 300) {
        const budgetIncrease = Math.round((params.monthlyDebt * 3.5) / 1000);
        chips.push({
            label: `Pay off debt → budget jumps $${budgetIncrease}k. Show me that scenario.`,
            seed: `Show me affordability with $0 monthly debt — I make $${incomeK}k and have $${savingsK}k saved`
        });
        chips.push({
            label: `Run the numbers on a specific home price for me`,
            seed: `I make $${incomeK}k/year with $${params.monthlyDebt}/mo debt — what's my monthly payment on a $${fhaPriceK}k home?`
        });
        chips.push({
            label: `Which debt should I pay off first to maximize my budget?`,
            seed: `I have $${params.monthlyDebt}/mo in debt and $${incomeK}k income — which to pay off first to maximize my home buying budget?`
        });
    } else if (conv20.savingsGap > 0) {
        const gapK = Math.round(conv20.savingsGap / 1000);
        chips.push({
            label: `$${gapK}k more = 20% down, no PMI ever. FHA vs conventional side-by-side?`,
            seed: `Compare FHA 3.5% down vs conventional 20% down — I make $${incomeK}k and have $${savingsK}k saved`
        });
        chips.push({
            label: `Show me a specific home at $${fhaPriceK}k — what's the exact monthly?`,
            seed: `FHA on a $${fhaPriceK}k home — I make $${incomeK}k/year and have $${savingsK}k saved`
        });
        chips.push({
            label: `What if rates drop to 5.5% — how much more can I afford?`,
            seed: `Recalculate my affordability at 5.5% — I make $${incomeK}k and have $${savingsK}k saved`
        });
    } else {
        // Ready to buy — push toward action
        chips.push({
            label: `I'm ready — show me FHA on a $${fhaPriceK}k home with local taxes`,
            seed: `FHA loan on a $${fhaPriceK}k home — I make $${incomeK}k/year and have $${savingsK}k saved`
        });
        chips.push({
            label: `What if I wait and save $${savingsK + 20}k — how much more home do I get?`,
            seed: `Recalculate affordability with $${savingsK + 20}k saved and $${incomeK}k income — how much more home can I afford?`
        });
        chips.push({
            label: `What happens to my budget if rates drop to 5.5%?`,
            seed: `Recalculate my affordability at 5.5% rate — I make $${incomeK}k and have $${savingsK}k saved`
        });
    }

    return chips;
}

/**
 * Build rich affordability answer with reserve requirements table
 */
function buildAffordabilityMarkdown(
    params: { annualIncome: number; savings: number; monthlyDebt: number },
    scenarios: any[]
): string {
    const [fha, conv3, conv20] = scenarios;
    const monthlyGross = Math.round(params.annualIncome / 12);

    const cashNote = (s: any) => {
        const haveK = Math.round(params.savings / 1000);
        const needK = Math.round(s.totalCashNeeded / 1000);
        const gapK = Math.round(s.savingsGap / 1000);
        const afterK = Math.round(s.savingsAfterClose / 1000);
        if (s.savingsGap > 0) {
            return `💰 **Cash needed:** $${needK}k (down + closing) | You have $${haveK}k | **Need $${gapK}k more**`;
        }
        return `💰 **Cash needed:** $${needK}k (down + closing) | You have $${haveK}k | ✅ $${afterK}k left after closing`;
    };

    const scenarioBlock = (s: any, star: string = '') => `## ${s.icon} ${s.label}${star}

| | |
|--|--|
| **Max Home Price** | **$${s.homePrice.toLocaleString()}** |
| Down Payment (${s.downPaymentPct}%) | $${s.downPaymentAmount.toLocaleString()} |
${s.isFHA ? `| Base Loan Amount | $${s.baseLoanAmount.toLocaleString()} |
| + UFMIP (1.75%, financed) | +$${s.ufmip.toLocaleString()} |
| **Total Loan Amount** | **$${s.loanAmount.toLocaleString()}** |` : `| Loan Amount | $${s.loanAmount.toLocaleString()} |`}
| Closing Costs (~3%) | $${s.closingCosts.toLocaleString()} |

**Monthly Payment:**
| Component | Amount |
|-----------|--------|
| Principal & Interest | $${s.monthlyPI.toLocaleString()} |
| Property Taxes (est.) | $${s.monthlyTax.toLocaleString()} |
| Home Insurance | $${s.monthlyInsurance.toLocaleString()} |
${s.monthlyMI > 0 ? `| ${s.isFHA ? 'FHA MIP (0.55%/yr)' : 'PMI (~0.5%/yr)'} | $${s.monthlyMI.toLocaleString()}/mo |
` : ''}| **Total ${s.isFHA ? 'PITI + MIP' : s.monthlyMI > 0 ? 'PITI + PMI' : 'PITI'}** | **$${s.totalMonthly.toLocaleString()}/mo** |

${s.isFHA ? `> ⚠️ **FHA MIP never cancels** on loans with <10% down. At your income, refinancing to conventional once you hit 20% equity saves ~$${s.monthlyMI}/mo.` : s.monthlyMI > 0 ? `> 💡 **PMI cancels** at 80% LTV — saves you $${s.monthlyMI}/mo when it drops off.` : `> ✅ **No PMI** — 20% down eliminates mortgage insurance entirely.`}

- DTI: **${s.dtiRatio}%** of $${monthlyGross.toLocaleString()}/mo gross
- Total interest over 30yr: **$${Math.round(s.totalInterest / 1000)}k**
${cashNote(s)}`;

    return `**What You Can Afford — Income-Based Analysis**

**$${Math.round(params.annualIncome / 1000)}k/year = $${monthlyGross.toLocaleString()}/mo gross** | Rate: ${fha.rate}%${params.monthlyDebt > 0 ? ` | $${params.monthlyDebt}/mo existing debt factored in` : ''}

> 💡 Home prices below are based on what your **income qualifies for** at 43% DTI. Savings gap is shown separately — you may have more savings than listed, or can save toward the gap.

---

${scenarioBlock(fha, ' ⭐ Lowest barrier to entry')}

---

${scenarioBlock(conv3, ' — Lowest conventional down')}

---

${scenarioBlock(conv20, ' — No PMI, best long-term rate')}

---

## 📊 Side-by-Side Comparison

| | FHA 3.5% | Conv 3% | Conv 20% |
|--|--|--|--|
| Max home price | $${Math.round(fha.homePrice / 1000)}k | $${Math.round(conv3.homePrice / 1000)}k | $${Math.round(conv20.homePrice / 1000)}k |
| Cash needed | $${Math.round(fha.totalCashNeeded / 1000)}k | $${Math.round(conv3.totalCashNeeded / 1000)}k | $${Math.round(conv20.totalCashNeeded / 1000)}k |
| You have | $${Math.round(params.savings / 1000)}k | $${Math.round(params.savings / 1000)}k | $${Math.round(params.savings / 1000)}k |
| Gap to close | ${fha.savingsGap > 0 ? `**$${Math.round(fha.savingsGap / 1000)}k more**` : `✅ Ready`} | ${conv3.savingsGap > 0 ? `**$${Math.round(conv3.savingsGap / 1000)}k more**` : `✅ Ready`} | ${conv20.savingsGap > 0 ? `**$${Math.round(conv20.savingsGap / 1000)}k more**` : `✅ Ready`} |
| Monthly PITI | $${fha.totalMonthly.toLocaleString()} | $${conv3.totalMonthly.toLocaleString()} | $${conv20.totalMonthly.toLocaleString()} |
| PMI/MIP | Yes (life of loan) | Yes (until 80% LTV) | ❌ None |

---

## 💡 Your Best Path Forward

${fha.savingsGap === 0 && conv3.savingsGap === 0 ? `✅ **You're ready to buy now.** FHA and Conventional 3% are both within reach with your $${Math.round(params.savings / 1000)}k saved.
- **Choose FHA** if your credit is under 680 — more lenient approval, 3.5% down
- **Choose Conventional 3%** if your credit is 680+ — no UFMIP, PMI cancels, lower long-term cost
- **The $${Math.round((conv20.homePrice - fha.homePrice) / 1000)}k difference** in max home price between FHA and 20% down shows your income's full purchasing power`
            : fha.savingsGap > 0 ? `⚡ **You need $${Math.round(fha.savingsGap / 1000)}k more to close on FHA** — the fastest path to homeownership on your income.
- At $500/mo savings: **${Math.ceil(fha.savingsGap / 500)} months** to closing-ready
- At $1,000/mo savings: **${Math.ceil(fha.savingsGap / 1000)} months** to closing-ready
- Alternative: Ask about **gift funds** — FHA allows 100% of down payment as a gift from family`
                : `✅ **You can close on FHA today** — you have enough saved.`}

${params.monthlyDebt > 200 ? `💳 **Your $${params.monthlyDebt}/mo in debt is costing you buying power.** Paying it off would add ~$${Math.round(params.monthlyDebt * 8 / 1000)}k to your max home price.` : ''}

**What to do next:**
1. Share your credit score → I'll tell you exactly which program you'll qualify for
2. Share your target city/zip → I'll adjust for local property taxes and FHA loan limits  
3. Ask me to run any specific home price → I'll show your DTI and whether you qualify`;
}

// ===== END AFFORDABILITY HELPERS =====

// ===== FHA CALCULATOR HELPERS =====
// Add to app/api/answers/route.ts after affordability helpers

/**
 * Detect if this is an FHA-specific question
 */
function isFHAQuestion(question: string): boolean {
    const text = question.toLowerCase();

    // Strong FHA indicators
    const hasFHA = /\bfha\b/i.test(text);
    const hasMIP = /\bmip\b|\bmortagage insurance premium\b|\bupfront.*premium\b|\bufmip\b/i.test(text);
    const has35Down = /3\.?5\s*%\s*down/i.test(text);

    // FHA-specific terms
    const fhaTerms = /fha.*loan|fha.*mortgage|fha.*guideline|fha.*requirement/i.test(text);

    return hasFHA || hasMIP || (has35Down && /loan|mortgage|payment/.test(text)) || fhaTerms;
}

/**
 * Extract FHA parameters from question
 */
function extractFHAParams(question: string): {
    purchasePrice?: number;
    downPaymentPct?: number;
    interestRate?: number;
    annualIncome?: number;
    monthlyDebts?: number;
    propertyTaxRate?: number;
    creditScore?: number;
    hasInfo: boolean;
} {
    const text = question.toLowerCase();

    // Purchase price — handles "$500K", "$500,000", "$500k home", "purchase price $500k"
    // NOTE: bare "$Xk" only matches if followed by home/house/property context OR the value is >= 50
    //       (prevents matching "$84k" in "MIP from $84k lifetime" as a purchase price)
    const priceMatchCtx = text.match(/\$?\s*([\d,]+)k?\s*(?:home|house|property|purchase)/i) ||
        text.match(/(?:price|purchase|home|house|property).*?\$?\s*([\d,]+)k?/i) ||
        text.match(/\$\s*([\d,]+(?:,\d{3})+)/i);  // full number like $515,000
    // Bare "$Xk" only if value looks like a home price (>= 50, meaning $50k+)
    const priceMatchBare = text.match(/\$\s*([\d,]+)\s*k\b/i);
    const priceMatchBareParsed = priceMatchBare ? parseFloat(priceMatchBare[1].replace(/,/g, '')) : 0;
    const priceMatch = priceMatchCtx || (priceMatchBareParsed >= 50 ? priceMatchBare : null);
    let purchasePrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : undefined;
    if (purchasePrice && /\$\s*[\d,]+k\b/i.test(text) && purchasePrice < 10000) {
        purchasePrice *= 1000;
    }

    // Down payment %
    const downMatch = text.match(/(\d+\.?\d*)\s*%\s*down/i);
    const downPaymentPct = downMatch ? parseFloat(downMatch[1]) : 3.5; // FHA default

    // Interest rate — treat "current rates" as FRED fallback (undefined → uses fred avg downstream)
    let rateMatch = text.match(/(?:rate|interest).*?(\d+\.?\d*)\s*%/i);
    if (!rateMatch) {
        rateMatch = text.match(/at\s+(\d+\.?\d*)\s*%/i);
    }
    const explicitRate = rateMatch ? parseFloat(rateMatch[1]) : undefined;
    const interestRate = explicitRate; // undefined = use FRED avg (handled in calculateFHA call)

    // Income — same robust regex as conventional calculator
    const incomeMatch = text.match(/(?:i\s+earn|i\s+make|we\s+make|earn|makes?|income|salary)\s+[\$]?\s*([\d,]+)\s*k?\b/i) ||
        text.match(/[\$]\s*([\d,]+)\s*k?\s*(?:income|salary|a\s+year|per\s+year|annually)/i);
    let annualIncome = incomeMatch ? parseFloat(incomeMatch[1].replace(/,/g, '')) : undefined;
    if (annualIncome && annualIncome < 1000) annualIncome *= 1000;

    // Monthly debts
    const debtMatch = text.match(/\$\s*(\d+)\s*(?:car|student|debt|loan)\s*payment/i) ||
        text.match(/(\d+)\s*(?:dollar|\/mo).*?(?:car|debt|loan)/i) ||
        text.match(/\$?\s*(\d+)\s*(?:month|monthly|\/mo).*?(?:car|debt|loan|payment)/i) ||
        text.match(/(?:car|student|debt|loan)\s*payment.*?\$?\s*(\d+)/i);
    const monthlyDebts = debtMatch ? parseFloat(debtMatch[1]) : 0;

    // Property tax rate
    const taxMatch = text.match(/(?:property tax|tax).*?(\d+\.?\d*)\s*%/i);
    const propertyTaxRate = taxMatch ? parseFloat(taxMatch[1]) : undefined;

    // Credit score
    const creditMatch = text.match(/(?:credit score|fico|score).*?(\d{3})/i);
    const creditScore = creditMatch ? parseInt(creditMatch[1]) : undefined;

    const hasInfo = !!(purchasePrice || annualIncome);

    return {
        purchasePrice,
        downPaymentPct,
        interestRate,
        annualIncome,
        monthlyDebts,
        propertyTaxRate,
        creditScore,
        hasInfo,
    };
}

/**
 * Build FHA answer markdown with guidelines
 */
function buildFHAMarkdown(
    params: any,
    result: any,
    comparison?: any
): string {
    const { annualIncome, monthlyDebts } = params;

    // Normalise field names (calculator uses monthlyTax, monthlyInsurance, totalMonthly, frontEndDTI)
    const monthlyTax = result.monthlyTax ?? result.monthlyPropertyTax ?? 0;
    const monthlyIns = result.monthlyInsurance ?? result.monthlyHomeInsurance ?? 0;
    const totalMonthly = result.totalMonthly ?? result.totalMonthlyPITIA ?? 0;
    const frontEndDTI = result.frontEndDTI ?? result.housingDTI ?? null;
    const convTotal = comparison?.conventional?.monthlyPayment ?? comparison?.conventional?.totalMonthly ?? 0;
    const convPMI = comparison?.conventional?.monthlyMI ?? comparison?.conventional?.monthlyPMI ?? 0;
    const convDown = comparison?.conventional?.downPayment ?? 0;
    const convDownPct = comparison?.conventional?.downPaymentPct ?? 5;
    // Estimate total MIP paid (monthly MIP × duration in months, capped at 360)
    const mipMonths = result.mipDuration === '11 years' ? 132 : result.mipDuration === 'Life of loan' ? 360 : 360;
    const totalMIPPaid = result.monthlyMIP * mipMonths;

    return `**FHA Loan Analysis**

${annualIncome ? `**Your Situation:** $${(annualIncome / 1000).toFixed(0)}k income${monthlyDebts > 0 ? `, $${monthlyDebts}/month debt` : ''}` : ''}

---

## 🏡 FHA Loan Details

**Property:** $${(result.purchasePrice / 1000).toFixed(0)}k purchase price

**Down Payment:**
- Amount: $${(result.downPayment / 1000).toFixed(1)}k (${result.downPaymentPct}%)
- ${result.meetsDownPaymentRequirement ? '✅' : '❌'} Meets FHA minimum (3.5%)

**Loan Structure:**
- Base loan: $${(result.baseLoanAmount / 1000).toFixed(0)}k
- UFMIP (1.75%): $${(result.ufmip / 1000).toFixed(1)}k (financed)
- **Total loan: $${(result.totalLoanAmount / 1000).toFixed(0)}k**

---

## 💰 Monthly Payment Breakdown

| Component | Amount |
|-----------|--------|
| Principal & Interest | $${result.monthlyPI.toLocaleString()} |
| Monthly MIP | $${result.monthlyMIP.toLocaleString()} |
| Property Taxes | $${monthlyTax.toLocaleString()} |
| Home Insurance | $${monthlyIns.toLocaleString()} |
${result.monthlyHOA > 0 ? `| HOA | $${result.monthlyHOA.toLocaleString()} |\n` : ''}| **Total Monthly (PITI${result.monthlyHOA > 0 ? 'A' : ''})** | **$${totalMonthly.toLocaleString()}** |

---

## 📊 FHA-Specific Costs

**Upfront Mortgage Insurance Premium (UFMIP):**
- 1.75% of base loan = $${(result.ufmip / 1000).toFixed(1)}k
- Financed into loan (no cash needed upfront)

**Monthly Mortgage Insurance Premium (MIP):**
- $${result.monthlyMIP}/month
- Duration: ${result.mipDuration}
- Est. total MIP paid: $${(totalMIPPaid / 1000).toFixed(0)}k

${result.mipDuration === 'Life of loan' ? `⚠️ **Note:** With ${result.downPaymentPct}% down, MIP lasts for the life of the loan. Put 10%+ down to remove MIP after 11 years.` : `✅ MIP automatically removed after 11 years (10%+ down).`}

---

${annualIncome ? `## 📈 Debt-to-Income (DTI) Analysis

**Housing Ratio (Front-End):** ${frontEndDTI}%
- Your monthly payment ÷ gross income
- FHA guideline: ≤ 31% (with flexibility)

**Total DTI (Back-End):** ${result.totalDTI}%
- Your monthly payment + debts ÷ gross income
- FHA guideline: ≤ 43% (up to 50% with compensating factors)

${result.qualifies ? '✅ **You qualify** based on DTI!' : '⚠️ **DTI too high** - may need higher income, lower price, or pay off debts'}

---

` : ''}## 📋 FHA Requirements Checklist

${result.meetsCreditRequirement ? '✅' : '❌'} Credit score ≥ 580 (for 3.5% down) or ≥ 500 (for 10% down)
${result.meetsDownPaymentRequirement ? '✅' : '❌'} Down payment ≥ 3.5%
${result.withinLimits ? '✅' : '❌'} Loan amount ≤ $${(result.fhaLoanLimit / 1000).toFixed(0)}k (FHA limit)
${result.qualifies !== undefined ? (result.qualifies ? '✅' : '❌') + ' DTI ≤ 43%' : ''}

**FHA Advantages:**
- ✅ Low down payment (3.5%)
- ✅ More flexible credit requirements
- ✅ Gift funds allowed for down payment
- ✅ Seller can contribute up to 6% toward closing costs

**FHA Considerations:**
- ⚠️ MIP for ${result.mipDuration}
- ⚠️ UFMIP adds to loan amount
- ⚠️ Property must meet FHA standards
- ⚠️ Loan limits vary by county

---

${comparison ? `## 🆚 FHA vs Conventional Comparison

| Feature | FHA | Conventional (5% down) |
|---------|-----|------------------------|
| Down payment | $${(result.downPayment / 1000).toFixed(0)}k (${result.downPaymentPct}%) | $${(convDown / 1000).toFixed(0)}k (${convDownPct}%) |
| Monthly payment | $${totalMonthly.toLocaleString()} | $${convTotal.toLocaleString()} |
| Upfront cash needed | $${(result.downPayment / 1000).toFixed(0)}k down | $${(convDown / 1000).toFixed(0)}k down |
| Monthly insurance | MIP: $${result.monthlyMIP} | PMI: $${convPMI} |
| Insurance duration | ${result.mipDuration} | Until 80% LTV (auto-removes) |

**Bottom line:** ${(convDown - result.downPayment) >= 0 ? `FHA saves $${((convDown - result.downPayment) / 1000).toFixed(0)}k upfront.` : `FHA costs $${((result.downPayment - convDown) / 1000).toFixed(0)}k more upfront.`} ${(totalMonthly - convTotal) <= 0 ? `FHA saves $${(convTotal - totalMonthly)}/month vs Conventional.` : `Conventional saves $${(totalMonthly - convTotal)}/month long-term.`}

---

` : ''}**Next Steps:**
1. **Get FHA pre-approval** from FHA-approved lender
2. **Check credit score** - 580+ for 3.5% down
3. **Property inspection** - Must meet FHA standards
4. **Down payment source** - Verify funds (gift funds OK)

**FHA Guidelines:** [HUD FHA Loan Limits](https://www.hud.gov/program_offices/housing/sfh/lender/origination) | [FHA Mortgage Insurance](https://www.hud.gov/program_offices/housing/comp/premiums/sfpcalc)`;
}

// ===== END FHA HELPERS =====

// ===== DSCR / SCENARIO CALCULATOR HELPERS =====

function isDSCRQuestion(q: string): boolean {
    if (/\bfha\b/i.test(q)) return false;
    if (isAffordabilityQuestion(q)) return false;
    if (/\bfha\b/i.test(q)) return false;
    return /dscr|debt.?service.?coverage|rental income|investment property|cash.?flow|gross rent|pitia/i.test(q) ||
        (/rent/i.test(q) && /\$[\s\d,]+k?\b/i.test(q) && /home|house|property|loan|mortgage/i.test(q));
}

function extractDSCRParams(q: string, fredRate?: number) {
    const priceMatch = q.match(/\$\s*([\d,]+)k?\b/i);
    let purchasePrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : undefined;
    if (purchasePrice && /\$\s*[\d]+k\b/i.test(q) && purchasePrice < 10000) purchasePrice *= 1000;

    const downMatch = q.match(/(\d+\.?\d*)\s*%\s*down/i);
    const downPaymentPct = downMatch ? parseFloat(downMatch[1]) : 20;

    const rateMatch = q.match(/(?:rate|at|@)\s*(\d+\.?\d*)\s*%/i) || q.match(/(\d+\.?\d*)\s*%\s*(?:rate|interest)/i);
    const rateFromFRED = !rateMatch;
    const interestRate = rateMatch ? parseFloat(rateMatch[1]) : (fredRate || 6.5);

    const rentMatch = q.match(/(?:rent(?:s?\s+for)?|rental)\s*\$?\s*([\d,]+)k?/i) ||
        q.match(/\$\s*([\d,]+)k?\s*(?:\/mo|per\s*month|rent)/i);
    let grossMonthlyRent = rentMatch ? parseFloat(rentMatch[1].replace(/,/g, '')) : undefined;
    if (grossMonthlyRent && grossMonthlyRent < 100) grossMonthlyRent *= 1000;

    const taxMatch = q.match(/(?:tax|taxes)\s*(?:rate|of)?\s*(\d+\.?\d*)\s*%/i);
    const propertyTaxRate = taxMatch ? parseFloat(taxMatch[1]) : 1.1;

    const hoaMatch = q.match(/hoa\s*[\$:]?\s*([\d,]+)/i) || q.match(/\$\s*([\d,]+)\s*hoa/i);
    const hoaMonthly = hoaMatch ? parseFloat(hoaMatch[1].replace(/,/g, '')) : 0;

    const hasInfo = !!(purchasePrice && grossMonthlyRent);
    return { purchasePrice, downPaymentPct, interestRate, grossMonthlyRent, propertyTaxRate, annualInsurance: 1200, hoaMonthly, rateFromFRED, hasInfo };
}

function buildDSCRMarkdown(params: ReturnType<typeof extractDSCRParams>): object {
    const { purchasePrice, downPaymentPct, interestRate, grossMonthlyRent, propertyTaxRate, annualInsurance, hoaMonthly, rateFromFRED } = params as any;

    const downPayment = purchasePrice * (downPaymentPct / 100);
    const loanAmount = purchasePrice - downPayment;
    const monthlyRate = (interestRate / 100) / 12;
    const n = 360;
    const monthlyPI = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
    const monthlyTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const monthlyIns = (annualInsurance || 1200) / 12;
    const monthlyHOA = hoaMonthly || 0;
    const monthlyPITIA = monthlyPI + monthlyTax + monthlyIns + monthlyHOA;
    const dscr = grossMonthlyRent / monthlyPITIA;
    const monthlyCashFlow = grossMonthlyRent - monthlyPITIA;
    const annualCashFlow = monthlyCashFlow * 12;
    const totalInterest = (monthlyPI * 360) - loanAmount;

    const dscrStatus = dscr >= 1.25 ? '✅ **Excellent** — most lenders approve at 1.25x+'
        : dscr >= 1.0 ? '✅ **Qualifies** — meets minimum 1.0x (some lenders require 1.25x)'
            : dscr >= 0.75 ? '⚠️ **Below 1.0x** — select lenders (LoanDepot, Griffin) allow 0.75x+ with reserves'
                : '❌ **Does not qualify** — DSCR too low for standard programs';

    // Amortization snapshot
    const snapYears = [1, 5, 10, 15, 20, 30];
    let balance = loanAmount;
    const snapRows: string[] = [];
    let cumPrincipal = 0;
    for (let yr = 1; yr <= 30; yr++) {
        let yrPrincipal = 0; let yrInterest = 0;
        for (let mo = 0; mo < 12; mo++) {
            const intPmt = balance * monthlyRate;
            const prinPmt = monthlyPI - intPmt;
            yrInterest += intPmt; yrPrincipal += prinPmt;
            balance = Math.max(0, balance - prinPmt);
        }
        cumPrincipal += yrPrincipal;
        if (snapYears.includes(yr)) {
            snapRows.push(`| ${yr} | $${Math.round(cumPrincipal).toLocaleString()} | $${Math.round(yrInterest).toLocaleString()} | $${Math.round(balance).toLocaleString()} |`);
        }
    }

    const rateNote = rateFromFRED ? ' (FRED avg)' : '';
    const hoaRow = monthlyHOA > 0 ? `| HOA | $${monthlyHOA.toLocaleString()} |\n` : '';

    const answer = `**DSCR Investment Property Analysis**

**Property:** $${purchasePrice.toLocaleString()} | **Rent:** $${grossMonthlyRent.toLocaleString()}/mo | **Rate:** ${interestRate}%${rateNote}

---

## 🏠 Loan Structure

| | |
|--|--|
| Purchase Price | $${purchasePrice.toLocaleString()} |
| Down Payment | $${Math.round(downPayment).toLocaleString()} (${downPaymentPct}%) |
| Loan Amount | $${Math.round(loanAmount).toLocaleString()} |
| Interest Rate | ${interestRate}% (30-year fixed) |
| Total Interest | $${Math.round(totalInterest).toLocaleString()} |

---

## 💰 Monthly PITIA Breakdown

| Component | Amount |
|-----------|--------|
| Principal & Interest | $${Math.round(monthlyPI).toLocaleString()} |
| Property Taxes (${propertyTaxRate}%) | $${Math.round(monthlyTax).toLocaleString()} |
| Insurance | $${Math.round(monthlyIns).toLocaleString()} |
${hoaRow}| **Total PITIA** | **$${Math.round(monthlyPITIA).toLocaleString()}** |

---

## 📊 DSCR Analysis

| Metric | Value |
|--------|-------|
| Gross Monthly Rent | $${grossMonthlyRent.toLocaleString()} |
| Monthly PITIA | $${Math.round(monthlyPITIA).toLocaleString()} |
| **DSCR (Rent ÷ PITIA)** | **${dscr.toFixed(2)}x** |
| Monthly Cash Flow | ${monthlyCashFlow >= 0 ? '+' : ''}$${Math.round(monthlyCashFlow).toLocaleString()} |
| Annual Cash Flow | ${annualCashFlow >= 0 ? '+' : ''}$${Math.round(annualCashFlow).toLocaleString()} |

${dscrStatus}

**DSCR Lender Benchmarks:**
- 1.25x+ → Most lenders (LoanDepot, Griffin, JMAC)
- 1.0x → Minimum for standard programs
- 0.75x–1.0x → Select lenders with 6–12 months reserves
- <0.75x → Very limited options

---

## 📈 Amortization Snapshot

| Year | Cum. Principal | Yr Interest | Balance |
|------|----------------|-------------|---------|
${snapRows.join('\n')}

---

## ⚠️ Key Risks

${dscr < 1.0 ? '- **Negative cash flow** — PITIA exceeds rent, reserves required\n' : ''}${downPaymentPct < 20 ? '- **<20% down** — most DSCR programs require 20–25% minimum\n' : ''}- Vacancy (5–10% typical) not modeled — reduces effective DSCR
- Maintenance/CapEx (1–2% annually) not included

---

**Next Steps:**
1. **Compare DSCR lenders** — LoanDepot, Griffin, JMAC, Angel Oak
2. **Verify rent** — lender requires lease or 1007 rent schedule appraisal
3. **Reserves** — most programs require 6–12 months PITIA after closing`;

    return {
        answer,
        next_step: `DSCR is ${dscr.toFixed(2)}x. ${dscr >= 1.0 ? 'Get quotes from DSCR lenders — LoanDepot, Griffin, JMAC.' : 'Rent needs to be ~$' + Math.ceil(monthlyPITIA * 1.0).toLocaleString() + '/mo to hit 1.0x DSCR.'}`,
        follow_up: dscr >= 1.0
            ? `Want to see how vacancy (5–10%) or maintenance costs affect your cash flow?`
            : `Rent of $${Math.ceil(monthlyPITIA * 1.25).toLocaleString()}/mo would hit 1.25x DSCR. Is that achievable in your market?`,
        confidence: '1.00 (calculated using DSCR formula: Rent ÷ PITIA)',
    };
}

// ===== END DSCR HELPERS =====


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
    // Guard: never intercept FHA, conventional mortgage, or affordability questions
    const skipDscrOverride = /\bfha\b/i.test(question) ||
        isAffordabilityQuestion(question) ||
        isFHAQuestion(question) ||
        (/\$\s*[\d,]+k?\b/i.test(question) && /home|house|property|purchase|buying/i.test(question) && !/rent|rental|dscr|investment|cash flow/i.test(question));
    try {
        const dscrOverride = !skipDscrOverride ? await maybeBuildDscrOverrideAnswer(question) : null;
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

    // ========== UNDERWRITING GUIDELINES BYPASS ==========
    // Must run FIRST — before all calculator bypasses
    // Detects pure info/guideline questions and answers them directly from the database
    // Key distinction: "What credit score do I need?" (info) vs "FHA loan on $300k" (calculation)

    function isUnderwritingGuidelineQuestion(q: string): boolean {
        const text = q.toLowerCase();

        // Pure info signals — these phrases mean the user wants a guideline answer, not a calculation
        const infoSignals = [
            /what.{0,20}(?:minimum|min|required?|need|require).{0,30}credit.?score/i,
            /credit.?score.{0,30}(?:required?|minimum|qualify|need|for)/i,
            /what.{0,20}(?:dti|debt.to.income).{0,30}(?:allow|require|limit|max|need)/i,
            /how.{0,30}(?:months?|reserves?).{0,30}(?:require|need|dscr|investment|conventional|fha|va|usda)/i,
            /(?:reserves?|months?).{0,30}(?:require|need).{0,30}(?:dscr|investment|loan|conventional)/i,
            /can i use gift/i,
            /gift funds?.{0,30}(?:allow|conventional|fha|investment|down)/i,
            /(?:what|how).{0,30}(?:employment|work).{0,30}(?:histor|require|need)/i,
            /(?:what|how).{0,30}(?:income|doc|documentation).{0,30}(?:need|require|accept)/i,
            /(?:loan|conforming|fha).{0,20}limit/i,
            /(?:what|how).{0,30}(?:ltv|down.?payment).{0,30}(?:require|minimum|need|allow)/i,
            /va.{0,20}(?:funding.?fee|eligib|entitlement|require)/i,
            /usda.{0,20}(?:income.?limit|eligible|area|require)/i,
            /(?:what|how).{0,20}(?:qualify|qualif).{0,30}(?:fha|conventional|dscr|va|usda|jumbo)/i,
            /(?:pmi|mip).{0,30}(?:cancel|remov|when|stop|how)/i,
            /self.employ.{0,30}(?:qualify|doc|require|guideline)/i,
            /(?:underwriting|guideline|lending).{0,20}(?:for|on|require)/i,
        ];

        // If any info signal matches, it's a guideline question
        if (infoSignals.some(pattern => pattern.test(q))) return true;

        // Negative signals — these mean it's a calculation, not a guideline question
        const hasDollarAmount = /\$\s*[\d,]+/i.test(q);
        if (hasDollarAmount) return false;

        // "use my scenario", "run my numbers", "calculate for me" = calculation intent
        const isCalculationIntent = /use my scenario|run.{0,20}(?:numbers?|scenario|calc)|calculate.{0,20}for me|show me.{0,20}(?:fha|payment|cost)|what.{0,10}(?:would|will).{0,20}(?:payment|piti|cost)|can you.{0,20}(?:calc|run|show|use)|(?:use|apply|run).{0,20}(?:my|this|same|that).{0,20}(?:scenario|situation|numbers?|info|details?)|(?:for|with).{0,5}fha\b|fha.{0,20}(?:version|option|instead)|my scenario.{0,20}fha|can.{0,10}fha/i.test(q);
        if (isCalculationIntent) return false;

        return false;
    }

    if (isUnderwritingGuidelineQuestion(question)) {
        console.log('[UW Guidelines] Detected guideline question in answers route — calling AI with database');

        const uwDatabase = `
=== UNDERWRITING GUIDELINES DATABASE (2025) ===

── FHA (Federal Housing Administration) ──────────────────────────────
Source: HUD Handbook 4000.1 | hud.gov/program_offices/housing/sfh
DTI: Front-end ≤31% guideline, up to 40%+ with AUS. Back-end ≤43%, up to 50% with compensating factors.
Credit Score: 580+ → 3.5% down. 500–579 → 10% down. Below 500 → not eligible.
LTV / Down Payment: 3.5% min (580+ FICO), 10% min (500–579 FICO). Max LTV 96.5%.
Loan Limits (2025): Standard $524,225 (1-unit). High-cost up to $1,209,750. AK/HI up to $1,814,625.
Mortgage Insurance: UFMIP 1.75% financed. Annual MIP 0.55% (>15yr, LTV >90%) — life of loan. Removed at yr 11 if 10%+ down.
Reserves: Not required by FHA. Lender overlays may require 1–3 months.
Employment: 2-year history required. Gaps >6 months need explanation.
Gift Funds: 100% of down payment can be gift (family, employer, nonprofit).
Self-Employed: 2 years tax returns (1040), P&L, business bank statements. Income averaged over 2 years.

── CONVENTIONAL (Fannie Mae / Freddie Mac) ────────────────────────────
Source: Fannie Mae Selling Guide B3-6 | selling-guide.fanniemae.com. Freddie Mac SFSSG | freddiemac.com/singlefamily
DTI: Standard ≤45% back-end. DU/LP approval up to 50% with strong compensating factors.
Credit Score: Minimum 620. Best pricing 740+. Below 620 not eligible.
LTV / Down Payment: Primary 1-unit 3% min (HomeReady/Standard 97). Investment property 15% (1-unit), 25% (2–4 units). Second home 10% min. No PMI at 20%+ down.
Loan Limits (2025): Conforming $806,500 (1-unit standard). High-cost up to $1,209,750.
Reserves: Primary 1-unit 0–2 months typical. Investment property 6 months PITIA. Multiple financed properties: 2% of aggregate UPB.
Employment: 2-year history standard. Recent job change OK if same field.
Gift Funds: Allowed for primary and second homes. NOT allowed for investment properties.
Self-Employed: 2 years 1040s + business returns. Business must be 2+ years old.
PMI Removal: Request at 80% LTV. Automatic at 78% LTV (original schedule).

── DSCR / INVESTMENT (Non-QM) ─────────────────────────────────────────
Source: Lender guidelines — LoanDepot, Griffin Funding, Angel Oak, JMAC
DTI: Not used. Qualification based on DSCR = Gross Rent ÷ PITIA.
DSCR Thresholds: 1.25x+ → most lenders approve. 1.0x → minimum for many. 0.75x–1.0x → select lenders with 6–12 months reserves. <0.75x → very limited.
Credit Score: Minimum 620–640 most lenders. Best pricing 700+.
LTV / Down Payment: 1-unit 20–25% down (75–80% LTV max). 2–4 unit 25% min. Cash-out refi 70–75% LTV max.
Reserves: 6–12 months PITIA required post-close (most lenders). Some require 12 months for <1.0x DSCR.
Employment/Income: Not required. No income verification, no DTI.
Documentation: Lease agreement or 1007 appraisal rent schedule required.

── VA (Department of Veterans Affairs) ────────────────────────────────
Source: VA Lenders Handbook (VA Pamphlet 26-7) | benefits.va.gov/homeloans
DTI: No hard limit. 41% guideline; above requires residual income test.
Credit Score: VA has no minimum. Lender overlays typically 580–620+.
LTV / Down Payment: 0% down with full entitlement. No PMI ever.
Funding Fee (2025): First use 0% down: 2.15%. First use 5–10% down: 1.50%. First use 10%+ down: 1.25%. Subsequent use 0% down: 3.30%. Exempt: disabled vets with 10%+ service-connected disability.
Reserves: Not required by VA. Lender overlays may require 2–3 months.
Gift Funds: Allowed.
Eligibility: Active duty 90+ days (wartime), 181 days (peacetime), 6 years NG/Reserves, surviving spouses.

── USDA (Rural Development) ───────────────────────────────────────────
Source: USDA RD Handbook HB-1-3555 | rd.usda.gov/programs-services/single-family-housing
DTI: Front-end ≤29% (GUS up to 32%). Back-end ≤41% (GUS up to 44%).
Credit Score: GUS automated 640+. Manual underwrite 580+. Below 580 generally not eligible.
LTV / Down Payment: 0% down (100% financing). Guarantee Fee: 1% upfront (can be financed), 0.35% annual.
Income Limits (2025): 115% of area median income. Check: eligibility.sc.egov.usda.gov
Property: Must be in USDA-designated rural area.
Reserves: Not required.
Employment: 2-year history required.

── JUMBO / NON-QM ──────────────────────────────────────────────────────
Source: Lender-specific (Chase, Wells Fargo, UWM, Angel Oak)
DTI: Typically ≤43%. Non-QM bank statement up to 55%.
Credit Score: Jumbo 680–720 min. Non-QM bank statement 620+.
LTV / Down Payment: Standard jumbo 10–20% down. $1M–$2M typically 20% min. $2M+ typically 25–30% min.
Reserves: 6–24 months depending on loan size. $2M+ typically 18–24 months.
Documentation: Full doc, 12/24-month bank statements, asset depletion (assets ÷ 84 months), P&L only, DSCR.
Loan Limits: Above conforming ($806,500 standard / $1,209,750 high-cost).
=== END GUIDELINES ===`;

        const uwSystemPrompt = `You are HomeRates.AI Underwriting Guidelines Expert.

STRICT RULES — violations are not acceptable:
- NEVER introduce yourself or mention HomeRates.AI in your response
- NEVER say "Welcome" or any greeting
- Jump straight into the content with the headline
- ONLY use information from the guidelines database below — do not add outside tools, resources, websites, or services not listed in the database
- Do NOT recommend Credit Karma, credit counseling services, apps, or any third-party tools
- Do NOT invent lender names, programs, or requirements not in the database
- If something is not in the database, say "Not specified in guidelines — verify with lender"

FORMAT RULES (hard):
- Always produce a rich, structured markdown card — never a plain paragraph answer
- Start immediately with a bold headline: "## [emoji] [Topic]"
- Use tables for any data with multiple values (by lender, by tier, by loan type)
- Sections in this order: Overview → Details table → Cross-program Comparison table → Key Takeaways → Source
- Bold all numbers and thresholds
- Minimum 4 sections per answer
- End with "## 📎 Source" citing exact source name and URL from the database
- Use emojis for section headers: 🏦 📊 ✅ ⚠️ 💡 📎

CONTENT RULES (hard):
- Give actual numbers — never say "varies" without the specific range from the database
- Show comparison tables when multiple programs or tiers exist
- Include a "💡 Pro Tip" with one concrete, actionable next step based only on the guidelines

${uwDatabase}`;

        const tAI = Date.now();
        let uwAnswerText = '';
        try {
            const xaiRes = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'grok-3-mini',
                    messages: [
                        { role: 'system', content: uwSystemPrompt },
                        { role: 'user', content: question },
                    ],
                    max_tokens: 2500,
                    temperature: 0.15,
                }),
            });
            const xaiData = await xaiRes.json() as any;
            uwAnswerText = xaiData?.choices?.[0]?.message?.content || 'Unable to retrieve guideline data.';
        } catch (uwErr: any) {
            console.error('[UW Guidelines] AI call failed:', uwErr?.message);
            uwAnswerText = 'Unable to retrieve guideline data. Please try again.';
        }
        const uwElapsed = Date.now() - tAI;
        console.log(`[UW Guidelines] Answered in ${uwElapsed}ms`);

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
            usedFRED: false,
            usedTavily: false,
            fred: { tenYearYield: null, mort30Avg: null, spread: null, asOf: null },
            topSources: [],
            grok: {
                answer: uwAnswerText,
                next_step: "Verify current guidelines with your lender or at the official source.",
                follow_up: "Do you have a specific scenario you'd like to calculate?",
                confidence: "1.00 (sourced from official guidelines database)",
            },
            debug: {
                requestedModel: "underwriting-guidelines",
                servedModel: "underwriting-guidelines",
                promptChars: question.length,
                elapsedMs: uwElapsed,
                requestId: "uw-" + Date.now(),
                parseMode: "direct",
                repaired: false,
            },
            data_freshness: `Live (grok-3-mini + guidelines database)`,
            message: uwAnswerText,
            answerMarkdown: `**Answer**
${uwAnswerText}`,
            followUp: "Do you have a specific scenario you'd like to calculate?",
        });
    }
    // ========== END UNDERWRITING GUIDELINES BYPASS ==========

    // ========== MORTGAGE CALCULATOR BYPASS ==========
    let mortgageAnswer: any = null;
    let mortgageCalcContext = "";

    // Broad detection - any question with a price + mortgage context
    function isMortgageCalculation(q: string): boolean {
        const hasPrice = /\$\s*[\d,]+k?\b/i.test(q);
        const hasMortgageContext = /home|house|property|loan|mortgage|buying|purchase|condo|townhouse/i.test(q);
        // Exclude FHA (handled separately) and affordability (no specific price)
        const isFHA = /\bfha\b/i.test(q);
        const isAffordability = isAffordabilityQuestion(q);
        return hasPrice && hasMortgageContext && !isFHA && !isAffordability;
    }

    if (isMortgageCalculation(question)) {
        const params = extractMortgageParams(question, fred?.mort30Avg ?? undefined);

        if (params && params.price) {
            try {
                console.log('[Mortgage Calc] Detected question, calling calculator with:', params);

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
                    [params.rate! - 0.5, params.rate!, params.rate! + 0.5]
                );

                console.log('[Mortgage Calc] Pre-calculated:', {
                    monthlyPI: result.monthlyPI,
                    totalInterest: result.totalInterest
                });

                // Extract income/debts for DTI if provided
                const incomeMatch = question.match(/(?:i\s+earn|i\s+make|we\s+make|earn|makes?|income|salary)\s+[\$]?\s*([\d,]+)\s*k?\b/i) ||
                    question.match(/[\$]\s*([\d,]+)\s*k?\s*(?:income|salary|a\s+year|per\s+year|annually)/i);
                let annualIncome = incomeMatch ? parseFloat(incomeMatch[1].replace(/,/g, "")) : undefined;
                if (annualIncome && annualIncome < 1000) annualIncome *= 1000;
                const debtMatch = question.match(/\$\s*(\d+)\s*(?:car|student|debt|loan)\s*payment/i) ||
                    question.match(/(?:car|student|debt|loan)\s*payment.*?\$?\s*(\d+)/i);
                const monthlyDebts = debtMatch ? parseFloat(debtMatch[1]) : 0;

                // Monthly tax + insurance estimates
                const monthlyTax = Math.round((result.homePrice * 0.011) / 12);
                const monthlyIns = 100;
                const monthlyPMI = result.downPaymentPct < 20 ? Math.round((result.loanAmount * 0.006) / 12) : 0;
                const totalMonthly = Math.round(result.monthlyPI + monthlyTax + monthlyIns + monthlyPMI);

                // DTI
                let frontEndDTI: number | undefined;
                let totalDTI: number | undefined;
                if (annualIncome) {
                    const monthlyIncome = annualIncome / 12;
                    frontEndDTI = Math.round((totalMonthly / monthlyIncome) * 1000) / 10;
                    totalDTI = Math.round(((totalMonthly + monthlyDebts) / monthlyIncome) * 1000) / 10;
                }

                const pmiLine = monthlyPMI > 0 ? `| PMI (~0.6%) | $${monthlyPMI} |\n` : '';
                const dtiSection = annualIncome ? `
---

## 📈 Debt-to-Income Analysis

| | Amount |
|--|--|
| Gross Monthly Income | $${Math.round(annualIncome / 12).toLocaleString()} |
| Front-End DTI (housing) | ${frontEndDTI}% |
| Back-End DTI (housing + debts) | ${totalDTI}% |

${frontEndDTI! <= 28 ? '✅ **Excellent** — well within 28% front-end guideline' :
                        frontEndDTI! <= 36 ? '✅ **Good** — within conventional 36% guideline' :
                            frontEndDTI! <= 43 ? '⚠️ **Stretched** — above 36% but below 43% FHA max' :
                                '❌ **Too High** — exceeds 43% guideline, lender approval uncertain'}
` : '';

                const mortgageMarkdown = `**Conventional Mortgage Breakdown**

${annualIncome ? `**Your Situation:** $${(annualIncome / 1000).toFixed(0)}k income${monthlyDebts > 0 ? `, $${monthlyDebts}/month debt` : ''}` : ''}

---

## 🏡 Loan Details

| | |
|--|--|
| Home Price | $${result.homePrice.toLocaleString()} |
| Down Payment | $${result.downPayment.toLocaleString()} (${result.downPaymentPct}%) |
| Loan Amount | $${result.loanAmount.toLocaleString()} |
| Interest Rate | ${result.rateAnnual}% (${result.termYears}-year fixed) |
| Total Interest | $${result.totalInterest.toLocaleString()} |

---

## 💰 Monthly Payment Breakdown

| Component | Amount |
|-----------|--------|
| Principal & Interest | $${Math.round(result.monthlyPI).toLocaleString()} |
| Property Taxes (~1.1%) | $${monthlyTax.toLocaleString()} |
| Home Insurance | $${monthlyIns} |
${pmiLine}| **Total Monthly (PITI${monthlyPMI > 0 ? '+PMI' : ''})** | **$${totalMonthly.toLocaleString()}** |

${monthlyPMI > 0 ? `⚠️ **PMI applies** — less than 20% down. Removed automatically at 80% LTV (~${Math.round((result.loanAmount * 0.8) / (result.homePrice * 0.003) / 12)} years).` : '✅ **No PMI** — 20%+ down payment.'}

---

## 📊 Rate Comparison

| Rate | Monthly P&I | Total Interest |
|------|-------------|----------------|
${scenarios.map((s: any) => `| ${s.label} | $${Math.round(s.monthlyPI).toLocaleString()} | $${Math.round(s.totalInterest).toLocaleString()} |`).join('\n')}
${dtiSection}
---

**Next Steps:**
1. **Get pre-approved** with 2-3 lenders to compare rates
2. **Lock your rate** once pre-approved
3. **Factor in closing costs** (~2-3% of loan = $${Math.round(result.loanAmount * 0.025).toLocaleString()})`;

                // Smart follow-up
                let followUp = "Want to see a 15-year vs 30-year comparison, or factor in PMI removal timeline?";
                if (annualIncome && frontEndDTI! > 43) {
                    followUp = `Your DTI is ${frontEndDTI}%. Want to see what price range keeps you under 36%?`;
                } else if (monthlyPMI > 0) {
                    followUp = `PMI adds $${monthlyPMI}/month. Want to see how much extra to put down to eliminate it?`;
                } else if (annualIncome && frontEndDTI! <= 28) {
                    followUp = `Strong DTI at ${frontEndDTI}%. Want to compare 15-year vs 30-year to save on total interest?`;
                }

                mortgageAnswer = {
                    answer: mortgageMarkdown,
                    next_step: `Get pre-approved with 2-3 lenders. Closing costs estimated at ~$${Math.round(result.loanAmount * 0.025).toLocaleString()}.`,
                    follow_up: followUp,
                    confidence: "1.00 (calculated using verified mortgage formula)"
                };

                // Keep context for Grok fallback (if mortgage answer somehow null)
                mortgageCalcContext = `MORTGAGE CALCULATION (PRE-CALCULATED):\n- Monthly P&I: $${result.monthlyPI}\n- Total Interest: $${result.totalInterest}\nCRITICAL: Use these numbers EXACTLY.`;

            } catch (err: any) {
                console.error('[Mortgage Calc] Error:', err.message, err.stack);
            }
        }
    }
    // ========== END MORTGAGE CALCULATOR BYPASS ==========
    // ========== AFFORDABILITY ADVISOR CHECK ==========
    let affordabilityAnswer = null;

    // Detect debt/savings change follow-ups that should re-run the affordability calculator
    // e.g. "what if I have $800 in monthly debt", "what if I pay off my car"
    function isAffordabilityFollowUp(q: string): { isFollowUp: boolean; debtOverride?: number; savingsOverride?: number; useCurrentRate?: boolean } {
        const t = q.toLowerCase();

        // "base it on current/market/today's rates", "use current rates", "at today's rates"
        const useCurrentRate = /(?:base|use|apply|calculate|run).{0,20}(?:current|today|market|live|fred|actual)\s*rates?/i.test(t) ||
            /(?:current|today\'?s?|market|live)\s*(?:mortgage\s*)?rates?/i.test(t) ||
            t === 'base it on current market rates' ||
            /at\s+(?:current|today|market)\s*rates?/i.test(t);

        if (useCurrentRate) {
            return { isFollowUp: true, useCurrentRate: true };
        }

        // "what if I have $X in monthly debt" / "add $X debt" / "with $X monthly debt"
        const debtMatch = t.match(/(?:what if|add|with|including|have|had)\s*(?:i have\s*)?[\$]?\s*(\d+)\s*(?:in\s*)?(?:monthly\s*)?(?:debt|payment|obligation)/i) ||
            t.match(/[\$]?\s*(\d+)\s*(?:\/mo|per month|monthly|a month)\s*(?:in\s*)?(?:debt|payments?)/i);
        const debtOverride = debtMatch ? parseFloat(debtMatch[1]) : undefined;

        // "what if I pay off my car/debt" → debt = 0
        const payOff = /pay\s*off|zero\s*debt|no\s*debt|without\s*debt|debt.{0,10}free/i.test(t);

        const hasMutator = !!(debtOverride !== undefined || payOff);
        return { isFollowUp: hasMutator, debtOverride: payOff ? 0 : debtOverride };
    }

    // Check debt/savings follow-up FIRST — may override params from memory
    const affordFollowUp = isAffordabilityFollowUp(question);

    // Try to pull prior affordability context from recent Grok memory (in-request context)
    // We look for income/savings in the recent conversation history passed to Grok
    let priorAffordContext: { annualIncome?: number; savings?: number; monthlyDebt?: number } | null = null;
    if (affordFollowUp.isFollowUp) {
        // Scan recent message history for income/savings values
        const historyText = conversationHistory || '';
        // Search history lines in reverse to get MOST RECENT income/savings values
        const histLines = historyText.split('\n').reverse();
        let histIncome: RegExpMatchArray | null = null;
        let histSavings: RegExpMatchArray | null = null;
        for (const line of histLines) {
            if (!histIncome) {
                histIncome = line.match(/\$?([\d,]+)k?\s*(?:\/year|a year|per year|income|salary)/i) ||
                    line.match(/(?:make|earn|income|salary)[^\d]{0,10}\$?([\d,]+)k?/i);
            }
            if (!histSavings) {
                histSavings = line.match(/\$?([\d,]+)k?\s*(?:saved|savings|in the bank|in savings|available)/i) ||
                    line.match(/(?:have|with|savings|bank)[^\d]{0,10}\$?([\d,]+)k?/i);
            }
            if (histIncome && histSavings) break;
        }
        if (histIncome || histSavings) {
            let inc = histIncome ? parseFloat(histIncome[1]) : undefined;
            let sav = histSavings ? parseFloat(histSavings[1]) : undefined;
            if (inc && inc < 1000) inc *= 1000;
            if (sav && sav < 1000) sav *= 1000;
            priorAffordContext = { annualIncome: inc, savings: sav };
        }
    }

    // If query explicitly mentions FHA + a home price, skip affordability and let FHA calculator handle it
    const hasFHAWithPrice = /\bfha\b/i.test(question) && /\$?\d+k?\s*(?:home|house|property|purchase|price)/i.test(question);

    if (!hasFHAWithPrice && (isAffordabilityQuestion(question) || (affordFollowUp.isFollowUp && (priorAffordContext?.annualIncome || affordFollowUp.useCurrentRate)))) {
        console.log('[Affordability] Detected affordability question');

        const affordParams = extractAffordabilityParams(question);

        // If it's a follow-up (debt change OR "use current rates"), merge prior context
        if (affordFollowUp.isFollowUp && priorAffordContext?.annualIncome && !affordParams.hasInfo) {
            affordParams.annualIncome = priorAffordContext.annualIncome;
            affordParams.savings = priorAffordContext.savings || affordParams.savings || 10000;
            affordParams.monthlyDebt = affordFollowUp.debtOverride ?? priorAffordContext.monthlyDebt ?? 0;
            (affordParams as any).hasInfo = true;
            // "base it on current rates" — use live FRED rate (already default, but log it)
            if (affordFollowUp.useCurrentRate) {
                console.log('[Affordability] Re-running with FRED rate:', fred?.mort30Avg || 6.01);
            }
            console.log('[Affordability] Follow-up override applied:', affordParams);
        }

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

            // Generate dynamic follow-up chips
            const affordChips = generateAffordabilityFollowUp(
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
                follow_up: affordChips[0]?.label ?? "Want to run numbers on a specific home or see how rates affect your budget?",
                follow_up_chips: affordChips,
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
    // ===== FHA CALCULATOR INTEGRATION =====
    // Add to app/api/answers/route.ts AFTER the affordability check (around line 1820)

    // ========== FHA CALCULATOR CHECK ==========
    let fhaAnswer = null;

    // History-aware FHA detection: if prior conversation mentions FHA and current question
    // is a down-payment follow-up ("show me 10% down", "what about 20% down"), treat as FHA question
    const isFHAFollowUp = !isFHAQuestion(question) &&
        /\b(\d+)\s*%\s*down\b|show me.*down|down payment/i.test(question) &&
        /\bfha\b|\bmip\b|\bufmip\b/i.test(conversationHistory || '');

    if (!affordabilityAnswer && (isFHAQuestion(question) || isFHAFollowUp)) {
        console.log('[FHA] Detected FHA question');

        const fhaParams = extractFHAParams(question);

        // If this is a follow-up with no price in current question, pull price + rate from history
        if (!fhaParams.purchasePrice && isFHAFollowUp && conversationHistory) {
            // Look for price with home/purchase context first (most reliable)
            const histPriceCtx = conversationHistory.match(/\$\s*([\d,]+)\s*k?\s*(?:home|house|property|purchase price)/i) ||
                conversationHistory.match(/(?:home|house|property|purchase price)[^$]*\$\s*([\d,]+)k?/i) ||
                conversationHistory.match(/\$\s*([\d,]+(?:,\d{3})+)/i); // full $515,000 format
            // Bare $Xk only if value >= 100 (i.e. $100k+) to avoid matching MIP amounts like $84k, $26k
            const histPriceBare = conversationHistory.match(/\$\s*(\d+)k\b/gi)
                ?.map((m: string) => parseFloat(m.replace(/[\$k]/gi, '')))
                .find((v: number) => v >= 100);
            const histPriceVal = histPriceCtx
                ? parseFloat(histPriceCtx[1].replace(/,/g, ''))
                : (histPriceBare ?? null);

            if (histPriceVal !== null && histPriceVal !== undefined) {
                let hp = histPriceVal;
                if (hp < 10000) hp *= 1000;
                // Sanity check: home prices are $50k–$5M
                if (hp >= 50000 && hp <= 5000000) {
                    fhaParams.purchasePrice = hp;
                    fhaParams.hasInfo = true;
                }
            }
            // Also pull prior rate if no rate in current question
            if (!fhaParams.interestRate) {
                const histRate = conversationHistory.match(/(?:fha|at)\s+(\d+\.?\d*)\s*%/i);
                if (histRate) fhaParams.interestRate = parseFloat(histRate[1]);
            }
            // Override down payment from current question (e.g. "show me 10% down")
            const followUpDown = question.match(/\b(\d+)\s*%\s*down\b/i);
            if (followUpDown) fhaParams.downPaymentPct = parseFloat(followUpDown[1]);
        }

        if (fhaParams.hasInfo && fhaParams.purchasePrice) {
            console.log('[FHA] Calculating FHA loan:', fhaParams);

            try {
                // Calculate FHA loan
                const fhaResult = calculateFHA({
                    purchasePrice: fhaParams.purchasePrice,
                    downPaymentPct: fhaParams.downPaymentPct || 3.5,
                    interestRate: fhaParams.interestRate || fred?.mort30Avg || 6.5,
                    creditScore: fhaParams.creditScore || 580,
                    loanTerm: 30,
                    propertyTaxRate: fhaParams.propertyTaxRate || 1.1,
                    homeInsuranceAnnual: 1200,
                    hoaMonthly: 0,
                    annualIncome: fhaParams.annualIncome,
                    monthlyDebts: fhaParams.monthlyDebts || 0,
                });

                // Generate comparison if:
                // 1) we have income (always compare), OR
                // 2) user explicitly asks to compare FHA vs conventional
                const wantsComparison = /conventional|\bconv\b|compare|\bvs\b|both options/i.test(question);
                let comparison = null;

                // Extract the conventional rate if two rates are given (e.g. "FHA at 5.625% and conventional at 5.99%")
                const allRates = [...question.matchAll(/(\d+\.?\.?\d*)\s*%/gi)]
                    .map((m: RegExpMatchArray) => parseFloat(m[1])).filter((r: number) => r > 2 && r < 15);
                const convRate = allRates.length > 1 ? allRates[1] : (fhaParams.interestRate || fred?.mort30Avg || 6.5);

                if (fhaParams.annualIncome) {
                    // Full comparison with DTI when income is known
                    comparison = compareFHAvsConventional(
                        fhaParams.purchasePrice,
                        convRate,
                        fhaParams.annualIncome,
                        fhaParams.monthlyDebts || 0,
                        fhaParams.propertyTaxRate || 1.1
                    );
                } else if (wantsComparison) {
                    // Build conventional numbers directly (no income needed — just payment math)
                    const price = fhaParams.purchasePrice;
                    const convDownPct = 5;
                    const convDown = price * (convDownPct / 100);
                    const convLoan = price - convDown;
                    const convMthRate = (convRate / 100) / 12;
                    const convPI = convLoan * (convMthRate * Math.pow(1 + convMthRate, 360)) / (Math.pow(1 + convMthRate, 360) - 1);
                    const convPMI = (convLoan * 0.005) / 12;
                    const convTax = (price * ((fhaParams.propertyTaxRate || 1.1) / 100)) / 12;
                    const convIns = 100;
                    const convTotal = Math.round(convPI + convPMI + convTax + convIns);
                    comparison = {
                        conventional: {
                            downPayment: convDown,
                            downPaymentPct: convDownPct,
                            monthlyPayment: convTotal,
                            monthlyPI: Math.round(convPI),
                            monthlyMI: Math.round(convPMI),
                            monthlyPMI: Math.round(convPMI),
                            convRateUsed: convRate,
                        }
                    };
                }

                // Build markdown answer
                const fhaMarkdown = buildFHAMarkdown(fhaParams, fhaResult, comparison);

                // Generate dynamic follow-up chips
                // Each chip has: label (displayed to user) + seed (fills the Ask pill as a natural question)
                const chips: Array<{ label: string; seed: string }> = [];
                const price = fhaParams.purchasePrice!;
                const priceK = Math.round(price / 1000);
                const totalMIP = Math.round(fhaResult.monthlyMIP * (fhaResult.mipDuration === '11 years' ? 132 : 360) / 1000);
                const mip10k = Math.round(fhaResult.monthlyMIP * 0.85 * 132 / 1000);
                const extraUpfront10 = Math.round((price * 0.10 - price * 0.035) / 1000);

                if (!fhaResult.qualifies && fhaResult.totalDTI) {
                    chips.push({
                        label: `DTI is ${fhaResult.totalDTI}% — above the 43% limit. What price do I actually qualify for?`,
                        seed: `What's the max home price I qualify for with my income? DTI is ${fhaResult.totalDTI}%`
                    });
                    chips.push({
                        label: `What if I paid off my debts first — how much more home could I afford?`,
                        seed: `Show me FHA affordability on $${priceK}k with $0 monthly debt`
                    });
                    chips.push({
                        label: `Show me the price range where I'm safely under 43% DTI`,
                        seed: `What home price keeps my FHA DTI under 40% with my current income?`
                    });
                } else if (!fhaResult.meetsCreditRequirement) {
                    chips.push({
                        label: `Credit under 580 — show me FHA with 10% down instead`,
                        seed: `Show me FHA with 10% down on $${priceK}k — credit score is under 580`
                    });
                    chips.push({
                        label: `What credit score do I need to get the 3.5% down rate?`,
                        seed: `What credit score do I need for FHA 3.5% down on $${priceK}k?`
                    });
                    chips.push({
                        label: `Are there other low-down-payment loans I might qualify for?`,
                        seed: `What are my options besides FHA if my credit score is under 580?`
                    });
                } else if (fhaResult.mipDuration === 'Life of loan') {
                    chips.push({
                        label: `Show me FHA 10% down on this home`,
                        seed: `Show me FHA with 10% down on a $${priceK}k home`
                    });
                    chips.push({
                        label: `Compare FHA vs conventional — which loan wins long term?`,
                        seed: `Compare FHA 3.5% down vs conventional 5% down on a $${priceK}k home`
                    });
                    chips.push({
                        label: `At what year does conventional become cheaper than FHA?`,
                        seed: `At what point does conventional beat FHA on a $${priceK}k home — year by year?`
                    });
                } else if (fhaResult.mipDuration === '11 years') {
                    chips.push({
                        label: `FHA 10% down vs conventional 10% down — side-by-side`,
                        seed: `Compare FHA 10% down vs conventional 10% down on a $${priceK}k home`
                    });
                    chips.push({
                        label: `Show me 20% down — no PMI ever, what's the monthly difference?`,
                        seed: `Show me conventional 20% down on a $${priceK}k home vs FHA 10% down`
                    });
                    chips.push({
                        label: `What income do I need to comfortably qualify at 10% down?`,
                        seed: `What annual income do I need to qualify for FHA on a $${priceK}k home at 10% down?`
                    });
                }

                if (comparison && chips.length < 3) {
                    const convTotal = comparison.conventional?.monthlyPayment ?? 0;
                    const convDown = comparison.conventional?.downPayment ?? 0;
                    const fhaMonthly = fhaResult.totalMonthly ?? 0;
                    const monthlyDiff = Math.abs(Math.round(fhaMonthly - convTotal));
                    const downDiff = Math.abs(Math.round((convDown - fhaResult.downPayment) / 1000));
                    const fhaWinsMonthly = fhaMonthly < convTotal;
                    chips.push({
                        label: fhaWinsMonthly
                            ? `FHA is cheaper monthly — add my income to see which I actually qualify for`
                            : `Conventional saves monthly once PMI cancels — add income to see which I qualify for`,
                        seed: `I make $${Math.round(price / 5 / 1000) * 10}k/year — FHA or conventional on $${priceK}k?`
                    });
                }

                // Pad to 3 chips if needed
                if (!fhaParams.annualIncome && chips.length < 3) {
                    chips.push({
                        label: `Add my income — tell me if I actually qualify for this payment`,
                        seed: `I make $[income]/year — do I qualify for FHA on $${priceK}k home?`
                    });
                }

                const fhaFollowUp = chips[0]?.label ?? "Want to explore different down payment or loan scenarios?";

                fhaAnswer = {
                    answer: fhaMarkdown,
                    next_step: "Get FHA pre-approval from an FHA-approved lender. Check credit score and verify down payment source.",
                    follow_up: fhaFollowUp,
                    follow_up_chips: chips,
                    confidence: "1.00 (calculated using official FHA guidelines and MIP rates)"
                };

                console.log('[FHA] Generated FHA analysis');

            } catch (err: any) {
                console.error('[FHA] Calculation error:', err.message);
            }

        } else {
            // Check if this is a knowledge question about MIP/FHA rules (not a calc request)
            const mipKnowledgeQ = /(?:when|how long|does|will|would|can)\s+(?:my\s+)?(?:mip|mortgage insurance|fha insurance|mip drop|mip cancel|mip go away|mip end|mip expire|mip stop)/i.test(question) ||
                /(?:mip|mortgage insurance)\s+(?:drop|cancel|go away|end|expire|stop|remove|come off)/i.test(question) ||
                /(?:get rid of|eliminate|remove)\s+(?:mip|fha mortgage insurance)/i.test(question);

            if (mipKnowledgeQ) {
                // Answer MIP duration rules directly from context
                // Check if prior context has a down payment % to personalize
                const histText = conversationHistory || '';
                const hadLowDown = /3\.5%|3\.5 percent|three and a half/i.test(histText);
                const had10Down = /10%|10 percent/i.test(histText);

                const mipLowDownAnswer = `**FHA MIP Duration — Your Situation**

With **3.5% down** (the minimum), FHA MIP lasts for the **life of the loan** — it never automatically cancels.

**Your options to remove MIP:**
1. **Refinance to conventional** once you reach 20% equity — this is the most common exit strategy
   - Typically takes 7–10 years of normal payments to reach 20% equity
2. **Pay down to 80% LTV faster** via extra principal payments, then refinance

**Why FHA doesn't cancel MIP automatically:**
FHA changed the rules in 2013 — loans with <10% down now carry MIP for the full 30 years (vs. conventional PMI which cancels at 80% LTV by law).

> 💡 **Rule of thumb:** If your credit score is 680+ and you have 20% equity, refinancing to conventional is usually worth it.

Want me to calculate your break-even point for a refinance?`;

                const mipHighDownAnswer = `**FHA MIP Duration**

With **≥10% down**: MIP cancels after **11 years** (132 payments)
With **<10% down**: MIP lasts for the **life of the loan** (never cancels automatically)

To remove MIP before 11 years: refinance to conventional once you reach 20% equity.`;

                fhaAnswer = {
                    answer: (hadLowDown || !had10Down) ? mipLowDownAnswer : mipHighDownAnswer,
                    next_step: "To exit FHA MIP, refinance to conventional at 20% LTV.",
                    follow_up: "Want me to calculate when you'd hit 20% equity and the refinance break-even point?",
                    confidence: "1.00 (FHA MIP policy per HUD guidelines)"
                };
                console.log('[FHA] Answered MIP duration knowledge question');
            } else {
                // Need more info
                console.log('[FHA] Asking for FHA info');

                fhaAnswer = {
                    answer: `**FHA Loan Calculator**

I can help you calculate an FHA loan with all costs including:
- ✅ UFMIP (Upfront Mortgage Insurance Premium)
- ✅ Monthly MIP (Mortgage Insurance Premium)  
- ✅ DTI analysis (qualify or not)
- ✅ FHA vs Conventional comparison

**To calculate, I need:**
- Purchase price
- Interest rate (or I'll use current rates)

**Optional but helpful:**
- Your income (for DTI qualification)
- Monthly debts (car, student loans, etc.)
- Credit score
- Property tax rate in your area

**Examples:**
- "FHA loan on $300k home at 6.5%"
- "I make $75k, want FHA loan on $280k house, have $400 car payment"
- "FHA with 3.5% down on $350k, credit score 620, property tax 1.5%"

What's your scenario?`,
                    next_step: "Share property price and rate (or income for full DTI analysis).",
                    follow_up: "What's the purchase price and do you know your credit score?",
                    confidence: "1.00 (ready to calculate FHA loan)"
                };
            } // end else (not MIP knowledge question)
        }
    }
    // ========== END FHA CHECK ==========
    // ========== DSCR / SCENARIO CHECK ==========
    let dscrAnswer: any = null;
    if (isDSCRQuestion(question)) {
        console.log('[DSCR] Detected DSCR/investment question');
        const params = extractDSCRParams(question, fred?.mort30Avg ?? undefined);
        if (params.hasInfo) {
            console.log('[DSCR] Calculating DSCR with params:', params);
            dscrAnswer = buildDSCRMarkdown(params);
            console.log('[DSCR] Generated DSCR analysis, DSCR =', (params.grossMonthlyRent! / ((params.purchasePrice! * (1 - params.downPaymentPct! / 100)) * ((params.interestRate! / 100 / 12) * Math.pow(1 + params.interestRate! / 100 / 12, 360)) / (Math.pow(1 + params.interestRate! / 100 / 12, 360) - 1) + (params.purchasePrice! * (params.propertyTaxRate! / 100)) / 12 + 100 + (params.hoaMonthly || 0))).toFixed(2));
        } else {
            console.log('[DSCR] Missing info, asking for rent');
            dscrAnswer = {
                answer: `**DSCR Investment Property Calculator**

I can calculate DSCR (Debt Service Coverage Ratio), monthly PITIA, cash flow, and amortization instantly.

**To calculate, I need:**
- Purchase price
- Gross monthly rent
- Interest rate (or I'll use current FRED avg)

**Optional:**
- Down payment % (default 20%)
- Property tax rate (default 1.1%)
- HOA

**Examples:**
- "$450k property, rents for $3,200/mo at 7%"
- "$600k investment property, 25% down, $3,800 rent, 7.25%"

What's your scenario?`,
                next_step: 'Share purchase price, monthly rent, and rate.',
                follow_up: 'What is the purchase price and expected monthly rent?',
                confidence: '1.00 (ready to calculate DSCR)',
            };
        }
    }
    // ========== END DSCR CHECK ==========



    // THEN, update the final check to include FHA:

    let grokFinal: any = null;
    let debug: any = null;

    let sourcesInjected = false;
    if (affordabilityAnswer) {
        grokFinal = affordabilityAnswer;
        debug = { requestedModel: "affordability-calculator", servedModel: "dti-scenarios", promptChars: question.length, elapsedMs: 0, requestId: "afford-" + Date.now(), parseMode: "direct", repaired: false };
        console.log('[Affordability] Returning direct answer, skipping Grok');
    } else if (fhaAnswer) {
        grokFinal = fhaAnswer;
        debug = { requestedModel: "fha-calculator", servedModel: "fha-guidelines", promptChars: question.length, elapsedMs: 0, requestId: "fha-" + Date.now(), parseMode: "direct", repaired: false };
        console.log('[FHA] Returning FHA analysis, skipping Grok');
    } else if (mortgageAnswer) {
        grokFinal = mortgageAnswer;
        debug = { requestedModel: "mortgage-calculator", servedModel: "mortgage-calculator", promptChars: question.length, elapsedMs: 0, requestId: "mort-" + Date.now(), parseMode: "direct", repaired: false };
        console.log('[Mortgage Calc] Returning direct answer, skipping Grok');
    } else if (dscrAnswer) {
        grokFinal = dscrAnswer;
        debug = { requestedModel: "dscr-calculator", servedModel: "dscr-calculator", promptChars: question.length, elapsedMs: 0, requestId: "dscr-" + Date.now(), parseMode: "direct", repaired: false };
        console.log('[DSCR Calc] Returning direct answer, skipping Grok');
    } else if (XAI_API_KEY) {
        // Normal Grok path...

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
        follow_up_chips: grokFinal?.follow_up_chips || null,
    });
}

export async function POST(req: NextRequest) {
    return handle(req);
}

export async function GET(req: NextRequest) {
    const intent = req.nextUrl.searchParams.get("intent") || undefined;
    return handle(req, intent);
}