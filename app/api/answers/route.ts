// ==== WEB-FIRST + GROK + SUPABASE (UI-SAFE): app/api/answers/route.ts ====
export const runtime = "nodejs"; // v2
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { calculateMortgage, compareRates } from "../../../lib/mortgageCalculator";
import { calculateFHA, compareFHAvsConventional } from "../../../lib/fhaCalculator";
// NEW unified calc engine
import {
    calcConventional, calcFHA, calcRefi, calcAffordability, calcAffordabilityScenario,
    calcDSCR, calcFHAvsConv, runCalcTests, calcRefi20vs30, calcExtraPayment, calcRefiEarlySale, calcOneExtraPaymentPerYear,
    calcVA, calcJumbo, calcVAEntitlement,
} from "../../../lib/calcEngine";
import { buildAnswerMarkdown, runFormatTests } from "../../../lib/answerFormat";
import { dispatch, isRefiQuestion, isLoanLimitsQuestion, isScenarioComparisonQuestion, isBuydownQuestion } from "../../../lib/calcDispatcher";
import {
    buildConventionalCard, buildFHACard, buildFHAEquityTimelineCard, buildRefiCard, buildRefiNeedsInputCard,
    buildRefi20vs30Card, buildExtraPaymentCard, buildRefiEarlySaleCard, buildOneExtraPaymentPerYearCard,
    buildFHANeedsInputCard, buildAffordabilityCard, buildAffordabilityNeedsInputCard,
    buildDSCRCard, buildDSCRNeedsInputCard, buildMIPDurationCard,
    buildVACard, buildVANeedsInputCard, buildVAEntitlementCard, buildVAEntitlementNeedsInputCard, buildJumboCard,
    buildLoanLimitsCard,
    buildJumboAffordabilityCard,
    buildScenarioComparisonCard,
    buildBuydownCard, buildSellerCreditCard,
    buildUWCard, type UWCardInput, buildLabCard, buildAboutCard,
    buildAboutTrustCard, buildAboutDifferenceCard, buildAboutDataCard, buildAboutFounderCard,
    buildUWStarterCard, buildHowItWorksCard, getContextChips,
} from "../../../lib/cardBuilders";
import {
    getGuidelineContextForQuestion,
    maybeBuildDscrOverrideAnswer,
} from "@/lib/guidelinesServer";
import { generateSourcesBundle } from "../../lib/sources-generator";
import {
    buildLoanLimitsContext, getCALoanLimits, getCACountyByZip,
    getCACountyTaxRate, getCACountyInsRate, NATIONAL_CONFORMING_BASELINE,
} from "../../../lib/loanLimits2026";
import {
    getLimits as getNationalLimits, HIGH_COST_COUNTIES, STATE_NAMES,
} from "../../../lib/loanLimitsNational2026";
import {
    getRecentScenarioHistory,
    buildSystemPromptWithMemory,
    isFollowUpQuestion,
} from "../../../lib/memory";
import { resolveGeoFeatures, extractZip, extractIncome } from "../../../lib/geoFeatures";
import { tavily as createTavilyClient } from '@tavily/core';
import { spendCredits, checkCreditGate } from "../../../lib/credits";
import { getUserPlan } from "../../../lib/subscription";
import { isAdminId } from "../../../lib/adminAuth";
// Verify calc engine on cold start — logs failures, never throws
try {
    const testResult = runCalcTests();
    if (!testResult.passed) {
        console.error('[CalcEngine] VERIFICATION FAILURES:', testResult.failures);
    } else {
        console.log('[CalcEngine] All verification tests passed ✓');
    }
} catch (e) {
    console.error('[CalcEngine] Test runner threw:', e);
}
// Verify answer format rules on cold start
try {
    const fmtResult = runFormatTests();
    if (!fmtResult.passed) {
        console.error('[AnswerFormat] VERIFICATION FAILURES:', fmtResult.failures);
    } else {
        console.log('[AnswerFormat] Format rules verified ✓');
    }
} catch (e) {
    console.error('[AnswerFormat] Test runner threw:', e);
}
// ---------- Price formatter — handles $500k and $4.995M correctly ----------
function fmtPriceK(k: number): string {
    return k >= 1000 ? `$${(k / 1000).toFixed(1).replace(/\.0$/, '')}M` : `$${k}k`;
}

// ---------- noStore helper ----------
function stripChips(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(stripChips);
    if (obj && typeof obj === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            out[k] = k === 'follow_up_chips' ? [] : stripChips(v);
        }
        return out;
    }
    return obj;
}

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(stripChips(json), { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

// ---------- Env ----------
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const FRED_API_KEY = process.env.FRED_API_KEY || "";
if (!FRED_API_KEY) console.warn('[FRED] FRED_API_KEY not set — all rate/macro data will be null');
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
    const rate = rateMatch ? parseFloat(rateMatch[1]) : (fredMort30Avg || 6.5); // Prefer FRED live rate; 6.5 as last-resort only

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
        /afford.*calculator/i,
        /how much income.{0,30}(?:qualify|need|afford|buy|purchase)/i,
        /what income.{0,30}(?:need|qualify|required|to buy)/i,
        /what salary.{0,30}(?:need|qualify|required|to buy)/i,
        /income.{0,20}(?:need|required).{0,20}(?:qualify|home|house|mortgage)/i,
        /what income.*with.*(?:debts?|payment|car|student)/i,
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
    rateOverride?: number;
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
        const surrounding = text.slice(Math.max(0, idx - 15), idx + m[0].length);
        return !debtKeywords.test(surrounding);
    }) || null;
    let savings = savingsMatch ? parseFloat(savingsMatch[1]) : undefined;

    if (savingsMatch && savings && /k\b/i.test(savingsMatch[0]) && savings < 1000) {
        savings *= 1000;
    }

    // Debt: "$300 car payment", "$500/month debt", "$800 in monthly debt",
    //       "pay $300/month in car payments", "$300/month in debt"
    const debtMatch = text.match(/\$?\s*(\d+)\s*(?:car|student|monthly|month|\/month)\s*(?:payment|debt|loan)/i) ||
        text.match(/(?:pay|paying)\s*\$?\s*(\d+)\s*(?:\/month|\/mo|per month|a month|month)/i) ||
        text.match(/\$?\s*(\d+)\s*\/month\s*(?:in\s*)?(?:car|debt|student|credit|loan)/i) ||
        text.match(/\$?\s*(\d+)\s*(?:month|monthly)\s*(?:in\s*)?(?:car|debt|loan|payments?)/i) ||
        text.match(/\$?\s*(\d+)\s*(?:\/mo|per month|monthly|a month|month)\s*(?:in\s*)?(?:debt|payments?|obligations?)/i) ||
        text.match(/(?:car|student|credit)\s*(?:payment|loan|debt)[^\d]*\$?\s*(\d+)/i) ||
        text.match(/\$?\s*(\d+)\s*(?:car payment|student loan|debt payment|loan payment)/i);
    const monthlyDebt = debtMatch ? parseFloat(debtMatch[1]) : 0;

    // If user stated a down payment % but no savings, derive savings from down %
    // so hasInfo passes — generateAffordabilityScenarios uses downPct directly
    const downPctMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*down/i);
    const statedDownPct = downPctMatch ? parseFloat(downPctMatch[1]) / 100 : undefined;
    if (!savings && statedDownPct && annualIncome) {
        // Estimate savings from income-based max price at stated down %
        const estPrice = (annualIncome / 12) * 0.43 / 0.006 * 0.9; // rough DTI-based price
        savings = Math.round(estPrice * statedDownPct);
    }
    const hasInfo = !!(annualIncome && savings);

    // Rate override: "at 5.5%", "recalculate at 5.5%", "if rates drop to 5.5%"
    const rateMatch = text.match(/(?:at|recalculate.*at|rates?.*drop.*to|if.*rate.*is|rate.*of)\s*([\d.]+)\s*%/i) ||
        text.match(/(\d+\.\d+)\s*%\s*(?:rate|interest)/i);
    const rateOverride = rateMatch ? parseFloat(rateMatch[1]) : undefined;

    return { annualIncome, savings, monthlyDebt, rateOverride, hasInfo };
}

/**
 * Generate 3 affordability scenarios with Fannie Mae DTI guidelines
 */
// 2026 loan limits
const FHA_FLOOR = 541287;         // national floor (standard county)
const FHA_CEILING = 1249125;      // high-cost ceiling
const CONF_STANDARD = 832750;     // 2026 conforming standard (FHFA, effective Jan 1 2026)
const CONF_HIGH_BALANCE = 1249125; // CA high-balance ceiling

/** Detect loan limits — uses loanLimits2026.ts for CA county precision, 3-bucket fallback for non-CA */
function detectLoanLimits(question: string): { fhaLimit: number; confLimit: number; locationLabel: string; loanLimitsContext?: string } {
    const q = question.toLowerCase();

    // Try county-precise CA lookup first
    const caLocationMatch = q.match(/\b(los angeles|orange county|san francisco|san jose|san diego|sacramento|fresno|riverside|san bernardino|santa clara|alameda|contra costa|san mateo|marin|napa|sonoma|ventura|santa barbara|san luis obispo|monterey|santa cruz|kern|bakersfield|stockton|modesto|thousand oaks|irvine|anaheim|pasadena|long beach|oakland|berkeley|fremont|hayward|walnut creek|concord|daly city|redwood city|palo alto|mountain view|sunnyvale|cupertino|santa rosa|petaluma)\b/i);
    if (caLocationMatch) {
        const limits = getCALoanLimits(caLocationMatch[0]);
        if (limits) {
            const loanAmountMatch = q.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*k?\b/i);
            const loanAmount = loanAmountMatch ? parseFloat(loanAmountMatch[1].replace(/,/g, '')) * (loanAmountMatch[0].toLowerCase().includes('k') ? 1000 : 1) : limits.conformingLimit;
            return {
                fhaLimit: limits.fhaLimit,
                confLimit: limits.conformingLimit,
                locationLabel: `${limits.county} County`,
                loanLimitsContext: buildLoanLimitsContext(caLocationMatch[0], loanAmount),
            };
        }
    }

    // Non-CA fallback buckets
    const highCostOther = /\b(new york|nyc|seattle|washington dc|dc|miami|boston|denver|austin|nashville|hawaii|honolulu|alaska)\b/i;
    if (highCostOther.test(q)) {
        return { fhaLimit: FHA_CEILING, confLimit: CONF_HIGH_BALANCE, locationLabel: 'high-cost area' };
    }
    return { fhaLimit: FHA_FLOOR, confLimit: CONF_STANDARD, locationLabel: '' };
}

async function generateAffordabilityScenarios(params: {
    annualIncome: number;
    savings: number;
    monthlyDebt: number;
    currentRate: number;
    downPctOverride?: number;
    question?: string;   // for loan limit detection
}) {
    const { annualIncome, savings, monthlyDebt, currentRate, downPctOverride, question: affordQuestion } = params;
    const { fhaLimit, confLimit, locationLabel } = detectLoanLimits(affordQuestion || '');
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

        // Cap home price at loan limit for the program
        const isFHAprog = program === 'FHA';
        const loanLimitForProgram = isFHAprog ? fhaLimit : confLimit;
        // Max home price given down %: loanLimit / (1 - downPct/100) [for FHA: pre-UFMIP base loan]
        const maxHomePriceForLimit = loanLimitForProgram / (1 - downPct / 100);
        const wasLimitCapped = homePrice > maxHomePriceForLimit;
        if (wasLimitCapped) homePrice = maxHomePriceForLimit;

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
            wasLimitCapped,
            loanLimitForProgram,
            locationLabel,
        };
    }

    // Determine if this borrower's income qualifies them for jumbo territory.
    // If at 20% down + 43% DTI the max loan exceeds confLimit, they're in jumbo land.
    const probeMaxPI = (monthlyIncome * 0.43 - monthlyDebt) * 0.82;
    const probeMaxLoan = probeMaxPI * annuityFactor;
    const isJumboBorrower = probeMaxLoan > confLimit;

    // 3 scenarios: FHA 3.5%, Conventional 3%, Conventional 20%
    // High-income borrowers: swap conventional for jumbo tiers (20% + 25% down, no FHA)
    // If downPctOverride given (follow-up like "what if 10% down"), show that pct + 20% + FHA comparison
    let results;
    if (downPctOverride !== undefined) {
        const pctLabel = (downPctOverride * 100).toFixed(0);
        const isFHAPct = downPctOverride <= 0.035;
        results = [
            calcScenario(0.43, downPctOverride * 100, `${isFHAPct ? 'FHA' : 'Conventional'} (${pctLabel}% down)`, isFHAPct ? '🏠' : '🎯', isFHAPct ? 'FHA' : 'Conventional'),
            calcScenario(0.43, 20.0, 'Conventional (20% down)', '🛡️', 'Conventional'),
            calcScenario(0.43, 3.5, 'FHA (3.5% down) — for comparison', '🏠', 'FHA'),
        ];
    } else if (isJumboBorrower) {
        // High-income: replace FHA/conventional tiers with jumbo-appropriate scenarios
        // Uncap home price for jumbo — use a very high limit so solver isn't constrained
        const savedConfLimit = confLimit;
        // Temporarily override calcScenario caps by passing a jumbo flag via a wrapper
        function calcJumboScenario(dtiTarget: number, downPct: number, label: string, icon: string) {
            // Run the solver uncapped, then return
            const maxTotalHousing = (monthlyIncome * dtiTarget) - monthlyDebt;
            let maxPI = maxTotalHousing * 0.85;
            let homePrice = 0;
            for (let i = 0; i < 6; i++) {
                const loan = maxPI * annuityFactor;
                homePrice = loan / (1 - downPct / 100);
                const monthlyTaxIns = (homePrice * (0.011 + 0.0035)) / 12;
                const monthlyPMIest = 0; // Jumbo — no PMI at 20%+ down
                maxPI = maxTotalHousing - monthlyTaxIns - monthlyPMIest;
                if (maxPI <= 0) { maxPI = maxTotalHousing * 0.5; break; }
            }
            // No loan limit cap for jumbo
            const baseLoanAmount = homePrice * (1 - downPct / 100);
            const downPaymentAmount = homePrice * (downPct / 100);
            const loanAmount = baseLoanAmount;
            const closingCosts = homePrice * 0.025;
            const totalCashNeeded = downPaymentAmount + closingCosts;
            const savingsGap = Math.max(0, totalCashNeeded - savings);
            const rMonthly = (currentRate / 100) / 12;
            const nPayments = 30 * 12;
            const monthlyPI = loanAmount * (rMonthly * Math.pow(1 + rMonthly, nPayments)) / (Math.pow(1 + rMonthly, nPayments) - 1);
            const monthlyTax = (homePrice * 0.011) / 12;
            const monthlyInsurance = homePrice * 0.005 / 12; // Jumbo: 0.5% ins
            const monthlyMI = 0;
            const totalMonthly = monthlyPI + monthlyTax + monthlyInsurance;
            const actualDTI = ((totalMonthly + monthlyDebt) / monthlyIncome) * 100;
            const totalInterest = (monthlyPI * nPayments) - loanAmount;
            return {
                label, icon, program: 'Jumbo', dtiTarget,
                homePrice: Math.round(homePrice),
                downPaymentPct: downPct,
                downPaymentAmount: Math.round(downPaymentAmount),
                baseLoanAmount: Math.round(baseLoanAmount),
                ufmip: 0,
                loanAmount: Math.round(loanAmount),
                closingCosts: Math.round(closingCosts),
                totalCashNeeded: Math.round(totalCashNeeded),
                savingsGap: Math.round(savingsGap),
                savingsAfterClose: Math.max(0, savings - Math.round(totalCashNeeded)),
                monthlyPI: Math.round(monthlyPI),
                monthlyTax: Math.round(monthlyTax),
                monthlyInsurance: Math.round(monthlyInsurance),
                monthlyMI: 0,
                totalMonthly: Math.round(totalMonthly),
                totalInterest: Math.round(totalInterest),
                dtiRatio: Math.round(actualDTI * 10) / 10,
                rate: currentRate,
                isFHA: false,
                wasLimitCapped: false,
                loanLimitForProgram: 99_000_000,
                locationLabel,
            };
        }
        results = [
            calcJumboScenario(0.43, 20.0, 'Jumbo (20% down) — standard', '🏛️'),
            calcJumboScenario(0.43, 25.0, 'Jumbo (25% down) — better pricing', '🛡️'),
            calcScenario(0.43, 20.0, `Conventional (20% down) — up to $${(savedConfLimit / 1000).toFixed(0)}k loan`, '🎯', 'Conventional'),
        ];
    } else {
        results = [
            calcScenario(0.43, 3.5, 'FHA (3.5% down)', '🏠', 'FHA'),
            calcScenario(0.43, 3.0, 'Conventional (3% down)', '🎯', 'Conventional'),
            calcScenario(0.43, 20.0, 'Conventional (20% down)', '🛡️', 'Conventional'),
        ];
    }

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
            seed: `Compare FHA 3.5% down vs conventional 20% down — I make $${incomeK}k/year and have $${savingsK}k saved`
        });
        chips.push({
            label: `Show me a specific home at $${fhaPriceK}k — what's the exact monthly?`,
            seed: `Show me my monthly payment on a $${fhaPriceK}k home — I make $${incomeK}k/year and have $${savingsK}k saved`
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
    const [s0, s1, s2] = scenarios;
    // Use dynamic aliases — scenario order varies when downPctOverride is set
    const fha = s0; const conv3 = s1; const conv20 = s2;
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

${s.isFHA ? `> ⚠️ **FHA MIP never cancels** on loans with <10% down. At your income, refinancing to conventional once you hit 20% equity saves ~$${s.monthlyMI}/mo.` : s.monthlyMI > 0 ? `> 💡 **PMI cancels** at 80% LTV — saves you $${s.monthlyMI}/mo when it drops off.` : `> ✅ **No PMI** — 20% down eliminates mortgage insurance entirely.`}${s.wasLimitCapped ? `\n\n> 🏛️ **Loan limit applied** ($${Math.round(s.loanLimitForProgram / 1000)}k ${s.isFHA ? 'FHA' : 'conforming'} limit${s.locationLabel ? ' — ' + s.locationLabel : ' — standard county'}). Your income qualifies for more — share your zip for high-cost area limits.` : ''}

- DTI: **${(s.totalMonthly / monthlyGross * 100).toFixed(1)}%** housing${params.monthlyDebt > 0 ? ` + $${params.monthlyDebt}/mo debt = **${s.dtiRatio}% back-end**` : ''} of $${monthlyGross.toLocaleString()}/mo gross
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

## 📊 Side-by-Side Comparison${(s0.wasLimitCapped || s1.wasLimitCapped || s2.wasLimitCapped) ? ' — ⚠️ loan limits applied (no zip provided)' : ''}

| | ${s0.shortLabel || s0.label.replace(/ — .*/, '')} | ${s1.shortLabel || s1.label.replace(/ — .*/, '')} | ${s2.shortLabel || s2.label.replace(/ — .*/, '')} |
|--|--|--|--|
| Max home price | $${Math.round(s0.homePrice / 1000)}k | $${Math.round(s1.homePrice / 1000)}k | $${Math.round(s2.homePrice / 1000)}k |
| Cash needed | $${Math.round(s0.totalCashNeeded / 1000)}k | $${Math.round(s1.totalCashNeeded / 1000)}k | $${Math.round(s2.totalCashNeeded / 1000)}k |
| You have | $${Math.round(params.savings / 1000)}k | $${Math.round(params.savings / 1000)}k | $${Math.round(params.savings / 1000)}k |
| Gap to close | ${s0.savingsGap > 0 ? `**$${Math.round(s0.savingsGap / 1000)}k more**` : `✅ Ready`} | ${s1.savingsGap > 0 ? `**$${Math.round(s1.savingsGap / 1000)}k more**` : `✅ Ready`} | ${s2.savingsGap > 0 ? `**$${Math.round(s2.savingsGap / 1000)}k more**` : `✅ Ready`} |
| Monthly PITI | $${s0.totalMonthly.toLocaleString()} | $${s1.totalMonthly.toLocaleString()} | $${s2.totalMonthly.toLocaleString()} |
| PMI/MIP | ${s0.monthlyMI > 0 ? (s0.isFHA ? 'Yes (life of loan)' : 'Yes (until 80% LTV)') : '❌ None'} | ${s1.monthlyMI > 0 ? (s1.isFHA ? 'Yes (life of loan)' : 'Yes (until 80% LTV)') : '❌ None'} | ${s2.monthlyMI > 0 ? (s2.isFHA ? 'Yes (life of loan)' : 'Yes (until 80% LTV)') : '❌ None'} |

---

## 💡 Your Best Path Forward

${s0.savingsGap === 0 && s1.savingsGap === 0 ? `✅ **You're ready to buy now.** ${s0.label.replace(/ — .*/, '')} and ${s1.label.replace(/ — .*/, '')} are both within reach with your $${Math.round(params.savings / 1000)}k saved.
- **Choose FHA** if your credit is under 680 — more lenient approval, 3.5% down
- **Choose Conventional 3%** if your credit is 680+ — no UFMIP, PMI cancels, lower long-term cost
- **The $${Math.round((conv20.homePrice - fha.homePrice) / 1000)}k difference** in max home price between FHA and 20% down shows your income's full purchasing power`
            : (() => {
                const best = [s0, s1, s2].filter(s => s.savingsGap > 0).sort((a, b) => a.savingsGap - b.savingsGap)[0] || s0; return best.savingsGap > 0 ? `⚡ **You need $${Math.round(best.savingsGap / 1000)}k more to close on ${best.label.replace(/ — .*/, '').replace(/[🏠🎯🛡️]/g, '').trim()}** — the fastest path to homeownership on your income.
- At $500/mo savings: **${Math.ceil(best.savingsGap / 500)} months** to closing-ready
- At $1,000/mo savings: **${Math.ceil(best.savingsGap / 1000)} months** to closing-ready
- Alternative: Ask about **gift funds** — FHA allows 100% of down payment as a gift from family` : `✅ **You can close today** — you have enough saved.`;
            })()}

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

    // "Ask Underwriting:" prefix — always UW, never FHA calc
    if (/^\s*ask\s+underwriting\s*:/i.test(question)) return false;

    // Savings timeline / planning questions — never FHA calc
    // e.g. "how long until I can buy if I save $1,500/month"
    const isSavingsTimeline =
        /how.{0,10}long.{0,20}(save|saving|until|buy|afford)|how.{0,10}many.{0,10}month|when.{0,15}(buy|afford|ready)|save.{0,20}month/i.test(text) ||
        /saving.{0,20}month|months.{0,20}(to|until|before).{0,20}(buy|close|afford)/i.test(text);
    if (isSavingsTimeline) return false;

    // Pure educational / underwriting questions — never FHA calc
    const isEducational =
        /chapter.{0,5}(7|11|13)|bankrupt|bk\b|foreclosur|deed.in.lieu|short sale|waiting period/i.test(text) ||
        /credit.{0,10}event|derogatory|explain.{0,20}(fha|mip|ufmip)|difference.{0,20}between/i.test(text);
    if (isEducational) return false;

    // Conceptual/comparison/educational — never route to FHA calc
    const isConceptual =
        /pros.{0,10}cons|which is better|should i (use|choose|go with)|compare.*for.*buyer/i.test(text) ||
        /what.{0,20}differ|advantages|disadvantages|overview of fha|explain fha/i.test(text);
    if (isConceptual) return false;

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
    // AND the surrounding context doesn't mark it as income/salary
    const incomeContextRe = /(?:income|salary|earn|make|making)\s{0,5}\$[\d,]+\s*k\b|\$[\d,]+\s*k\s{0,5}(?:income|salary)\b/i;
    const allBareKMatches = Array.from(text.matchAll(/\$(\s*[\d,]+)\s*k\b/gi));
    const bestBarePriceMatch = allBareKMatches.find(m => {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (val < 50) return false; // too small to be a home price
        const idx = m.index ?? 0;
        const surrounding = text.slice(Math.max(0, idx - 15), idx + m[0].length + 15);
        return !incomeContextRe.test(surrounding); // exclude if income context nearby
    }) || null;
    const priceMatch = priceMatchCtx || bestBarePriceMatch;
    let purchasePrice = priceMatch ? parseFloat((priceMatch[1] as string).replace(/,/g, '')) : undefined;
    if (purchasePrice && /\$\s*[\d,]+k\b/i.test(text) && purchasePrice < 10000) {
        purchasePrice *= 1000;
    }

    // Down payment % — match "X% down", "X% down payment", or "at X%" when 
    // followed by "down" or when used in a down-payment context
    const downMatch = text.match(/(\d+\.?\d*)\s*%\s*down/i) ||
        text.match(/(?:at|with)\s+(\d+\.?\d*)\s*%(?=\s*down|\s*(?:down\s*payment)?\s*(?:on|for|of))/i) ||
        (text.match(/(?:down\s*payment|put\s*down).*?(\d+\.?\d*)\s*%/i));
    const downPaymentPct = downMatch ? parseFloat(downMatch[1] || downMatch[2] || downMatch[3]) : 3.5; // FHA default

    // Interest rate — treat "current rates" as FRED fallback (undefined → uses fred avg downstream)
    let rateMatch = text.match(/(?:rate|interest).*?(\d+\.?\d*)\s*%/i);
    if (!rateMatch) {
        // "at X%" is a rate only if:
        // - X contains a decimal (6.25%, 5.5%) — rates are almost never whole numbers
        // - OR explicitly preceded by "rate of" / "interest of"
        // Whole-number "at X%" (e.g. "at 10%") is treated as down payment context, not rate
        const atPctMatch = text.match(/at\s+(\d+\.\d+)\s*%(?!\s*down)/i); // decimal only
        if (atPctMatch) {
            const val = parseFloat(atPctMatch[1]);
            if (val >= 2 && val <= 15) rateMatch = atPctMatch;
        }
    }
    const explicitRate = rateMatch ? parseFloat(rateMatch[1]) : undefined;
    const interestRate = explicitRate; // undefined = use FRED avg (handled in calculateFHA call)

    // Income — must have dollar/number directly tied to income keyword
    // Guard: "how much income do I need" should NOT match — income keyword with no adjacent amount
    // Valid: "I make $95k", "income $95k", "$95k salary", "$95k/year"
    // Invalid: "what income do I need for this $850k home" → $850k is price, not income
    const incomeMatch =
        text.match(/(?:i\s+earn|i\s+make|we\s+make|make|earn)\s+[\$]?\s*([\d,]+)\s*k?\b/i) ||
        text.match(/[\$]\s*([\d,]+)\s*k?\s*(?:income|salary|a\s+year|per\s+year|annually|\/year)/i) ||
        text.match(/(?:salary|income)\s+(?:is\s+|of\s+)?[\$]?\s*([\d,]+)\s*k?\b/i);
    // Reject if the matched value is the purchase price context (e.g. "how much income for $850k home")
    const incomeVal = incomeMatch ? parseFloat((incomeMatch[1] as string).replace(/,/g, '')) : null;
    const priceAlreadyFound = !!(purchasePrice);
    const isIncomeAmbiguous = incomeVal !== null && priceAlreadyFound &&
        Math.abs((incomeVal < 1000 ? incomeVal * 1000 : incomeVal) - (purchasePrice || 0)) < 1000;
    let annualIncome = (incomeMatch && !isIncomeAmbiguous) ? parseFloat((incomeMatch[1] as string).replace(/,/g, '')) : undefined;
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
    comparison?: any,
    assumptions?: { rate?: boolean; downPct?: boolean; ambiguous10pct?: boolean; incomeNeeded?: boolean }
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

    const assumptionNotice = assumptions ? [
        assumptions.ambiguous10pct ? `> 💡 **Assuming 3.5% down** (if you meant 10% down, try: *"FHA loan on a $${(result.purchasePrice / 1000).toFixed(0)}k home with 10% down"*)` : null,
        assumptions.rate ? `> 💡 **Using current market rate (~${params.interestRate?.toFixed(2) ?? '6.5'}%)** — add a specific rate to your question (e.g. *"at 6.75%"*) to override` : null,
    ].filter(Boolean).join('\n') : '';

    return `**FHA Loan Analysis**

${assumptionNotice ? assumptionNotice + '\n\n' : ''}${annualIncome ? `**Your Situation:** $${(annualIncome / 1000).toFixed(0)}k income${monthlyDebts > 0 ? `, $${monthlyDebts}/month debt` : ''}` : ''}

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

${assumptions?.incomeNeeded && !annualIncome ? `## 💰 Minimum Income Required

To qualify for this FHA payment under standard DTI guidelines:

| DTI Guideline | Required Annual Income |
|---------------|----------------------|
| Conservative (31% front-end) | ~$${Math.round(result.totalMonthly / 0.31 * 12 / 1000)}k/year |
| Standard (43% back-end) | ~$${Math.round(result.totalMonthly / 0.43 * 12 / 1000)}k/year |
| Max with compensating factors (50%) | ~$${Math.round(result.totalMonthly / 0.50 * 12 / 1000)}k/year |

💡 *Based on $${result.totalMonthly.toLocaleString()}/month PITI with no other monthly debts. Add monthly debts to increase the required income.*

---

` : ''}${annualIncome ? `## 📈 Debt-to-Income (DTI) Analysis

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
${result.withinLimits ? '✅' : '❌'} Loan amount ≤ $${((result.fhaLoanLimit && result.fhaLoanLimit > 500000 ? result.fhaLoanLimit : 541287) / 1000).toFixed(0)}k (FHA 2026 floor; high-cost areas up to $1,249k)
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

| Feature | FHA | Conventional (${convDownPct}% down) |
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
    if (isFHAQuestion(q)) return false;
    if (isAffordabilityQuestion(q)) return false;
    // Require explicit DSCR/rental signal — "investment property" alone with no rent is not enough
    const hasHardDSCR = /dscr|debt.?service.?coverage|cash.?flow|gross rent|pitia/i.test(q);
    const hasRentSignal = /\brent/i.test(q) && /\$[\s\d,]+k?\b/i.test(q);
    const hasInvestmentWithRent = /investment property/i.test(q) && hasRentSignal;
    return hasHardDSCR || hasRentSignal && /home|house|property|loan|mortgage/i.test(q) || hasInvestmentWithRent;
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

    const vacancyMatch = q.match(/(\d+\.?\d*)\s*%\s*vacanc/i) ||
        q.match(/vacanc\w*\s*(?:rate|loss|factor)?\s*(?:of\s*)?(\d+\.?\d*)\s*%/i);
    const vacancyRate = vacancyMatch ? parseFloat(vacancyMatch[1]) / 100 : 0;

    const hasInfo = !!(purchasePrice && grossMonthlyRent);
    return { purchasePrice, downPaymentPct, interestRate, grossMonthlyRent, vacancyRate, propertyTaxRate, annualInsurance: purchasePrice ? Math.round(purchasePrice * 0.003) : 1200, hoaMonthly, rateFromFRED, hasInfo };
}

function buildDSCRMarkdown(params: ReturnType<typeof extractDSCRParams>): object {
    const { purchasePrice, downPaymentPct, interestRate, grossMonthlyRent, vacancyRate, propertyTaxRate, annualInsurance, hoaMonthly, rateFromFRED } = params as any;

    const downPayment = purchasePrice * (downPaymentPct / 100);
    const loanAmount = purchasePrice - downPayment;
    const monthlyRate = (interestRate / 100) / 12;
    const n = 360;
    const monthlyPI = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
    const monthlyTax = (purchasePrice * (propertyTaxRate / 100)) / 12;
    const monthlyIns = (annualInsurance || Math.round(purchasePrice * 0.003)) / 12;
    const monthlyHOA = hoaMonthly || 0;
    const monthlyPITIA = monthlyPI + monthlyTax + monthlyIns + monthlyHOA;
    // EGI = Effective Gross Income after vacancy loss
    const vacPct = (vacancyRate || 0);
    const egi = grossMonthlyRent * (1 - vacPct);
    const dscr = egi / monthlyPITIA;
    const monthlyCashFlow = egi - monthlyPITIA;
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
${vacPct > 0 ? `| Vacancy Loss (${Math.round(vacPct * 100)}%) | -$${Math.round(grossMonthlyRent * vacPct).toLocaleString()} |` : ''}${vacPct > 0 ? `
| **Effective Gross Income (EGI)** | **$${Math.round(egi).toLocaleString()}** |` : ''}
| Monthly PITIA | $${Math.round(monthlyPITIA).toLocaleString()} |
| **DSCR (EGI ÷ PITIA)** | **${dscr.toFixed(2)}x** |
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
const tavilyClient = TAVILY_API_KEY ? createTavilyClient({ apiKey: TAVILY_API_KEY }) : null;

async function askTavily(
    req: NextRequest,
    query: string,
    opts?: { depth?: "basic" | "advanced"; max?: number }
): Promise<TavilyMini> {
    if (!tavilyClient) return { ok: false, answer: null, results: [] };
    try {
        const response = await tavilyClient.search(query, {
            searchDepth: opts?.depth ?? 'basic',
            maxResults: typeof opts?.max === 'number' ? opts.max : 5,
            includeAnswer: true,
        });
        const results = (response.results ?? []).map((r: any) => ({
            title: r.title ?? '',
            url: r.url ?? '',
            content: r.content,
        }));
        return { ok: true, answer: response.answer ?? null, results };
    } catch (e: unknown) {
        console.warn('[Tavily SDK] error:', e instanceof Error ? e.message : String(e));
        return { ok: false, answer: null, results: [] };
    }
}



/* ===== FRED snapshot (for rate questions) ===== */
type FredSnap = {
    // Core — always fetched
    tenYearYield: number | null;    // DGS10
    mort30Avg: number | null;       // MORTGAGE30US
    spread: number | null;          // mort30Avg - tenYearYield
    asOf: string | null;
    // Rates tier
    mort15Avg: number | null;       // MORTGAGE15US
    arm5Avg: number | null;         // MORTGAGE5US
    dgs2: number | null;            // DGS2  — 2Y yield
    dgs30: number | null;           // DGS30 — 30Y yield
    t10y2y: number | null;          // T10Y2Y — yield curve spread
    // Policy
    fedFunds: number | null;        // FEDFUNDS
    sofr: number | null;            // SOFR
    // Inflation
    cpi: number | null;             // CPIAUCSL
    corePCE: number | null;         // PCEPILFE
    cpiShelter: number | null;      // CUSR0000SAH1
    // Housing
    housingStarts: number | null;   // HOUST (thousands, SAAR)
    existingHomeSales: number | null; // EXHOSLUSM495S (millions, SAAR)
    medianHomePrice: number | null; // MSPUS (dollars)
    monthsSupply: number | null;    // MSACSR
    caseShiller: number | null;     // CSUSHPINSA
    rentalVacancy: number | null;   // RRVRUSQ156N (%)
    // Labor
    unemployment: number | null;    // UNRATE
    hourlyEarnings: number | null;  // CES0500000003
};

// Hardcoded fallback — used when FRED_API_KEY is absent or all calls fail.
// Update these quarterly or whenever FRED_API_KEY is confirmed missing.
// Last updated: 2026-03-26
const FRED_FALLBACK: FredSnap = {
    tenYearYield:      4.29,
    mort30Avg:         6.65,
    spread:            2.36,
    asOf:              '2026-03-21',
    mort15Avg:         5.89,
    arm5Avg:           6.11,
    dgs2:              3.97,
    dgs30:             4.63,
    t10y2y:            0.32,
    fedFunds:          4.33,
    sofr:              4.30,
    cpi:               2.8,
    corePCE:           2.7,
    cpiShelter:        4.3,
    housingStarts:     1390,
    existingHomeSales: 4.02,
    medianHomePrice:   407500,
    monthsSupply:      3.5,
    caseShiller:       null,
    rentalVacancy:     6.9,
    unemployment:      4.1,
    hourlyEarnings:    35.1,
};

async function getFredSnapshot(topics: string[] = []): Promise<FredSnap> {
    if (!FRED_API_KEY) {
        console.warn('[FRED] API key missing — using fallback estimates (update FRED_API_KEY in Vercel env vars)');
        return FRED_FALLBACK;
    }

    const wantRates = topics.includes('rates') || topics.includes('refi') || topics.includes('arm');
    const wantHousing = topics.includes('housing') || topics.includes('affordability') || topics.includes('dscr') || topics.includes('qualify');
    const wantMacro = topics.includes('macro') || topics.includes('rates') || topics.includes('inflation');

    // Helper: fetch one FRED series, return parsed value + date or null
    // Pass units='pc1' for YoY % change on index-level series (e.g. PCEPILFE, CUSR0000SAH1)
    let fredErrorLogged = false; // log only first failure to avoid log spam
    const fredFetch = async (seriesId: string, units?: string): Promise<{ value: number | null; date: string | null }> => {
        try {
            const unitsParam = units ? `&units=${units}` : '';
            const r = await fetch(
                `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1${unitsParam}`,
                { cache: "no-store" }
            );
            if (!r.ok) {
                if (!fredErrorLogged) {
                    const errText = await r.text().catch(() => '(unreadable)');
                    console.error(`[FRED] HTTP ${r.status} on ${seriesId}: ${errText.slice(0, 300)}`);
                    fredErrorLogged = true;
                }
                return { value: null, date: null };
            }
            const j = await r.json();
            if (j?.error_message && !fredErrorLogged) {
                console.error(`[FRED] API error on ${seriesId}: ${j.error_message}`);
                fredErrorLogged = true;
            }
            const raw = j?.observations?.[0]?.value ?? null;
            const date = j?.observations?.[0]?.date ?? null;
            const value = raw && raw !== '.' ? Number(raw) : null;
            return { value, date };
        } catch (e) {
            if (!fredErrorLogged) {
                console.error(`[FRED] fetch exception on ${seriesId}:`, e instanceof Error ? e.message : String(e));
                fredErrorLogged = true;
            }
            return { value: null, date: null };
        }
    };

    // Tier 1 — always fetch (6 series, parallel)
    const coreIds = ['DGS10', 'MORTGAGE30US', 'FEDFUNDS', 'UNRATE', 'CPIAUCSL', 'MSPUS'];

    // Tier 2 — topic-gated
    const enrichIds: string[] = [];
    if (wantRates) enrichIds.push('MORTGAGE15US', 'MORTGAGE5US', 'DGS2', 'DGS30', 'T10Y2Y', 'SOFR');
    if (wantHousing) enrichIds.push('HOUST', 'EXHOSLUSM495S', 'MSACSR', 'CSUSHPINSA', 'RRVRUSQ156N');
    // PCEPILFE and CUSR0000SAH1 are price index levels — must fetch with units=pc1 for YoY %
    // They are NOT added to enrichIds; fetched separately below.

    const allIds = [...new Set([...coreIds, ...enrichIds])];
    const results = await Promise.allSettled(allIds.map(id => fredFetch(id)));

    const byId: Record<string, { value: number | null; date: string | null }> = {};
    allIds.forEach((id, i) => {
        const r = results[i];
        byId[id] = r.status === 'fulfilled' ? r.value : { value: null, date: null };
    });

    // Fetch PCE core and CPI shelter as YoY % (units=pc1) when macro context is needed
    if (wantMacro) {
        const [pcePct, shelterPct] = await Promise.allSettled([
            fredFetch('PCEPILFE', 'pc1'),
            fredFetch('CUSR0000SAH1', 'pc1'),
        ]);
        byId['PCEPILFE'] = pcePct.status === 'fulfilled' ? pcePct.value : { value: null, date: null };
        byId['CUSR0000SAH1'] = shelterPct.status === 'fulfilled' ? shelterPct.value : { value: null, date: null };
    }

    const g = (id: string) => byId[id]?.value ?? null;
    const tenYearYield = g('DGS10');
    const mort30Avg = g('MORTGAGE30US');
    const spread = tenYearYield != null && mort30Avg != null
        ? Number((mort30Avg - tenYearYield).toFixed(2)) : null;
    const asOf = byId['MORTGAGE30US']?.date ?? byId['DGS10']?.date ?? null;

    const live: FredSnap = {
        tenYearYield, mort30Avg, spread, asOf,
        mort15Avg: g('MORTGAGE15US'),
        arm5Avg: g('MORTGAGE5US'),
        dgs2: g('DGS2'),
        dgs30: g('DGS30'),
        t10y2y: g('T10Y2Y'),
        fedFunds: g('FEDFUNDS'),
        sofr: g('SOFR'),
        cpi: g('CPIAUCSL'),
        corePCE: g('PCEPILFE'),
        cpiShelter: g('CUSR0000SAH1'),
        housingStarts: g('HOUST'),
        existingHomeSales: g('EXHOSLUSM495S'),
        medianHomePrice: g('MSPUS'),
        monthsSupply: g('MSACSR'),
        caseShiller: g('CSUSHPINSA'),
        rentalVacancy: g('RRVRUSQ156N'),
        unemployment: g('UNRATE'),
        hourlyEarnings: g('CES0500000003'),
    };

    // ── Unit normalization ─────────────────────────────────────────────────────
    // EXHOSLUSM495S: FRED reports in thousands SAAR historically, but may return
    // raw units (4,090,000) in some API vintages. Normalize to millions for display.
    if (live.existingHomeSales !== null) {
        if (live.existingHomeSales > 100_000)       // raw units e.g. 4090000
            live.existingHomeSales = Math.round(live.existingHomeSales / 1_000_000 * 100) / 100;
        else if (live.existingHomeSales > 100)      // thousands e.g. 4090
            live.existingHomeSales = Math.round(live.existingHomeSales / 1_000 * 100) / 100;
        // else already in millions e.g. 4.09 — keep as-is
    }
    // HOUST: housing starts in thousands — keep as thousands (1,487k = 1.487M starts/yr)
    // MSPUS: median home price in dollars — keep as-is

    // If core rates came back null (API outage / bad key), fall back to estimates
    if (live.mort30Avg === null && live.tenYearYield === null) {
        console.warn('[FRED] All core series returned null — using fallback estimates');
        return FRED_FALLBACK;
    }

    // Fill any remaining nulls from fallback so downstream code never sees null on core fields
    return {
        ...FRED_FALLBACK,
        ...Object.fromEntries(Object.entries(live).filter(([, v]) => v !== null)),
    } as FredSnap;
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
async function callGrokOnce(prompt: string, opts?: { maxTokens?: number }) {
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
                    max_tokens: opts?.maxTokens ?? 1100,
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
/**
 * Universal fallback chip generator — fires for ANY response that doesn't already have chips.
 * Reads question + conversation history to produce contextual next-step suggestions.
 */
function generateFallbackChips(
    question: string,
    conversationHistory: string
): Array<{ label: string; seed: string }> {
    const q = question.toLowerCase();
    const hist = (conversationHistory || '').toLowerCase();
    const combined = hist + ' ' + q;

    // Extract financial context from history + question.
    // IMPORTANT: only match first-person income disclosures ("I make", "I earn", "my salary",
    // "we earn", "earning $X"). Never match interrogative uses like "what income do I need".
    const incMatch =
        combined.match(/(?:i\s+make|we\s+make|i\s+earn|we\s+earn|my\s+salary|our\s+salary|earning|makes?\s+\$)[^\d]*\$?\s*([\d,]+)\s*k?\b/i) ||
        combined.match(/\$\s*([\d,]+)\s*k?\s*(?:a\s+year|\/year|per\s+year|annually|income|salary)\b/i);
    let income = incMatch ? parseFloat(incMatch[1].replace(/,/g, '')) : 0;
    if (income && income < 1000) income *= 1000;

    const savMatch = combined.match(/\$?\s*([\d,]+)\s*k?\s*(?:saved|savings)\b/i);
    let savings = savMatch ? parseFloat(savMatch[1].replace(/,/g, '')) : 0;
    if (savings && savings < 1000) savings *= 1000;

    // Price: prefer explicit home/property context; exclude if income keyword nearby
    const priceMatchCtxChip = combined.match(/\$\s*([\d,]+(?:,\d{3})*)\s*k?\s*(?:home|house|property|purchase)/i);
    const incomeNearbyChip = /(?:income|salary|earn|make|making|year|annual)[^$]{0,20}\$[\d,]+|\$[\d,]+[^$]{0,20}(?:income|salary|year|annual)/i.test(combined);
    const priceMatch = priceMatchCtxChip || (!incomeNearbyChip ? combined.match(/\$\s*([\d,]+(?:,\d{3})*)\s*k?/i) : null);
    let price = priceMatch ? parseFloat((priceMatch[1] as string).replace(/,/g, '')) : 0;
    if (price && price < 10000) price *= 1000;
    // Guard: if extracted price equals income, it's likely the income value not a home price
    if (income && price && Math.abs(price - income) < 1000) price = 0;

    const incK = income ? Math.round(income / 1000) : 0;
    const savK = savings ? Math.round(savings / 1000) : 0;
    const priceK = price ? Math.round(price / 1000) : 0;

    // Context-aware chips based on topic
    const isDTI = /\bdti\b|debt.to.income|debt to income/i.test(q);
    const isMIP = /\bmip\b|mortgage insurance|fha insurance/i.test(q);
    const isGiftFunds = /gift fund/i.test(q);
    const isRate = /rate|interest|refinanc/i.test(q);
    const isCreditScore = /credit score|fico/i.test(q);
    const isComparison = /compare|vs\b|versus/i.test(q);
    const hasPrice = priceK >= 50;
    const hasIncome = incK >= 30;

    // --- Topic-specific chip sets ---

    if (isDTI && hasIncome) {
        return [
            { label: `Run full affordability — $${incK}k income`, seed: `I make $${incK}k/year${savK ? ` and have $${savK}k saved` : ''} — what can I afford?` },
            { label: `How does my $300/mo car payment affect DTI?`, seed: `Show me how a $300/month car payment changes my DTI and max home price — I make $${incK}k/year` },
            { label: `What income do I need for a $${hasPrice ? priceK : 500}k home?`, seed: `What annual income do I need to qualify for a $${hasPrice ? priceK : 500}k home with FHA 3.5% down?` },
        ];
    }

    if (isMIP && hasPrice) {
        return [
            { label: `FHA 10% down — MIP drops off after 11 years`, seed: `Show me FHA with 10% down on a $${fmtPriceK(priceK)} home${hasIncome ? ` — I make $${incK}k/year` : ''}` },
            { label: `FHA vs conventional — total 10-year cost`, seed: `Compare FHA 3.5% down vs conventional 5% down on a $${fmtPriceK(priceK)} home — total cost over 10 years` },
            { label: `When can I refinance out of FHA MIP?`, seed: `When can I refinance from FHA to conventional to remove MIP on a $${fmtPriceK(priceK)} home?` },
        ];
    }

    if (isGiftFunds && hasIncome) {
        return [
            { label: `Show me FHA affordability — $${incK}k income`, seed: `I make $${incK}k/year${savK ? ` and have $${savK}k saved` : ''} — what's the max FHA home price?` },
            { label: `FHA gift fund rules — what's allowed?`, seed: `What are FHA gift fund rules for down payment? Who can give and what documentation is needed?` },
            { label: `Compare FHA vs conventional gift fund rules`, seed: `How do FHA and conventional loan gift fund rules differ for down payment?` },
        ];
    }

    if (isRate && hasIncome) {
        return [
            { label: `How much more can I afford at 5.5%?`, seed: `Recalculate my affordability at 5.5% — I make $${incK}k${savK ? ` and have $${savK}k saved` : ''}` },
            { label: `Lock now vs wait — rate outlook`, seed: `Should I lock my mortgage rate now or wait? I'm buying a $${hasPrice ? priceK : 500}k home` },
            { label: `Every 0.5% rate drop = how much more home?`, seed: `How much does each 0.5% rate drop increase my buying power? I make $${incK}k/year` },
        ];
    }

    if (isCreditScore && hasIncome) {
        return [
            { label: `FHA with 580 credit score`, seed: `FHA loan with 580 credit score — what are my options?${hasPrice ? ` Home price $${fmtPriceK(priceK)}` : ''}` },
            { label: `How to improve credit score fast for mortgage`, seed: `What's the fastest way to improve my credit score to qualify for a better mortgage rate?` },
            { label: `Score impact on rate — 620 vs 680 vs 740`, seed: `How does credit score affect my mortgage rate and monthly payment? Compare 620, 680, and 740 FICO` },
        ];
    }

    if (isComparison && hasPrice) {
        return [
            { label: `Run this at current market rates`, seed: `${question} — use today's current market rate` },
            { label: `20% down — eliminate PMI entirely`, seed: `Show me conventional 20% down on a $${fmtPriceK(priceK)} home${hasIncome ? ` — I make $${incK}k/year` : ''}` },
            { label: `Which has lower total 30-year cost?`, seed: `Which has lower total cost over 30 years: FHA 3.5% down or conventional 5% down on a $${fmtPriceK(priceK)} home?` },
        ];
    }

    // --- Generic fallback with context ---
    if (hasIncome && hasPrice) {
        return [
            { label: `FHA vs conventional on $${fmtPriceK(priceK)} — side-by-side`, seed: `Compare FHA 3.5% down vs conventional 5% down on a $${fmtPriceK(priceK)} home — I make $${incK}k/year` },
            { label: `What if rates drop to 5.5%?`, seed: `Recalculate at 5.5% — I make $${incK}k/year${savK ? ` and have $${savK}k saved` : ''}` },
            { label: `What income do I need to qualify?`, seed: `What income do I need to qualify for a $${fmtPriceK(priceK)} home with FHA 3.5% down?` },
        ];
    }

    if (hasIncome) {
        return [
            { label: `Run my full affordability breakdown`, seed: `What can I afford? I make $${incK}k/year${savK ? ` and have $${savK}k saved` : ''}` },
            { label: `Show me FHA 3.5% down options`, seed: `I make $${incK}k/year — what's my max home price with FHA 3.5% down?` },
            { label: `Compare loan types for my situation`, seed: `I make $${incK}k/year${savK ? ` and have $${savK}k saved` : ''} — compare FHA vs conventional loan options` },
        ];
    }

    // Generic FTHB fallback (no context available)
    return [
        { label: `What can I afford as a first-time buyer?`, seed: `What can I afford as a first-time home buyer?` },
        { label: `FHA vs conventional — which is better for me?`, seed: `Compare FHA 3.5% down vs conventional 5% down — pros and cons for first-time buyers` },
        { label: `How much do I need saved to buy a home?`, seed: `How much money do I need saved to buy a home? Include down payment and closing costs` },
    ];
}

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
                .limit(3);

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
                        return `Turn ${idx + 1}\nUser: ${q}\nAssistant: ${aTrim.slice(0, 300)}`.trim();
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

    // ── Credit gate ──────────────────────────────────────────────────────────
    // Free users: blocked when balance=0 AND grace exhausted (3 grace messages).
    // Paid users (Plus/Pro) and admins always bypass.
    if (userId) {
      const adminBypass = await isAdminId(userId);
      if (!adminBypass) {
        const gate = await checkCreditGate(userId);
        if (gate.state === 'blocked') {
          return noStore({
            ok: false,
            credits_exhausted: true,
            upgrade: true,
            balance: 0,
            route: 'credits_gate',
          }, 402);
        }
        // 'grace' state: continue normally — gate already incremented grace counter
      }
    }

    // ── Credit spend ─────────────────────────────────────────────────────────
    // Deduct at request time (non-blocking) — same pattern as Claude/ChatGPT.
    // Costs: deep analysis = 25, standard AI query = 15, local calc = 5.
    // Balance floors at 0 (never goes negative).
    if (userId) {
      const _isDeep = /^\[deep-analysis\]/i.test(question);
      const _isCalcOnly = /^\$([\d,.]+[kKmM]?)|\b(what.*(payment|piti|rate)|how much|afford|calculate|refi|dscr|fha|va loan|jumbo)\b/i.test(question) && question.length < 120;
      const _creditCost = _isDeep ? 25 : _isCalcOnly ? 5 : 15;
      const _creditType = _isDeep ? "analysis_spend" : "query_spend";
      const _creditDesc = _isDeep ? "Deep analysis" : _isCalcOnly ? "Calc query" : "AI query";
      spendCredits(userId, _creditCost, _creditType, _creditDesc).catch(() => {});
    }

    // Always present for UI contract
    let usedFRED = false;
    let usedTavily = false;
    let fred: FredSnap = {
        tenYearYield: null, mort30Avg: null, spread: null, asOf: null,
        mort15Avg: null, arm5Avg: null, dgs2: null, dgs30: null, t10y2y: null,
        fedFunds: null, sofr: null, cpi: null, corePCE: null, cpiShelter: null,
        housingStarts: null, existingHomeSales: null, medianHomePrice: null,
        monthsSupply: null, caseShiller: null, rentalVacancy: null,
        unemployment: null, hourlyEarnings: null,
    };
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
        | "about"
        | "homeowner_payoff";

    let module: ModuleKey = "general";
    const q = question.toLowerCase();

    if (/(current.*rate|today.*rate|30.*year|30 year fixed|arm.*rate)/i.test(q)) {
        module = "rate";
    } else if (
        /(refinance|refi|closing costs?|break[- ]?even|loan balance|remaining.*(year|term|month)|years? left)/i.test(q)
    ) {
        module = "refi";
    } else if (
        /(how much.*qualify|qualify for|how much.*afford|afford.*home|income.*qualify|income.*need.*(?:home|house|mortgage)|how much income|what income.*need|what salary.*need|debt.*ratio|credit score.*qualify|pre.?approve)/i.test(
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
        /(what is homerates|heard about homerates|tell me about this site|what makes you different|who is the founder|who built homerates|who created homerates|who made homerates|founder of homerates|about homerates:)/i.test(
            q
        )
    ) {
        module = "about";
    } else if (
        /(payoff.*(?:plan|trajectory|accelerat|milestone)|equity.*(?:build|trajectory|milestone|plan|accelerat)|extra.*payment|biweekly|bi.?weekly|pay off.*(?:early|faster|sooner)|reduce.*(?:term|years|payoff)|refi.*15.?year|15.?year.*refi|wealth.*build|wealth.?building|payoff.*milestone)/i.test(q)
    ) {
        module = "homeowner_payoff";
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
            "Parse user location for limits (e.g., CA high-cost up to $1,249,125 in 2026; standard $832,750).\n" +
            "Use conforming baselines ($832,750 standard / up to $1,249,125 high-balance in CA, 2026). Jumbo pricing 0.20–0.50% over conforming; stricter: 720+ credit, 20%+ down, 12–24 months reserves.\n" +
            "Focus on structure, eligibility, risk — no sales. Table limits by county if CA. Respond in 150-250 words max. End with disclaimer.",

        underwriting:
            "You are Underwriting Oracle — 2026 guidelines only, Grok 4.1 Fast Non-Reasoning mode.\n" +
            "Parse user scenario: income type, credit events, property type.\n" +
            "Answer using ONLY:\n" +
            " • Fannie Mae Selling Guide (singlefamily.fanniemae.com)\n" +
            " • Freddie Mac Seller/Servicer Guide (freddiemac.com)\n" +
            " • FHA (hud.gov), VA (va.gov / benefits.va.gov), USDA, lender overlays (LoanDepot, UWM, Pennymac, Fairway, Angel Oak, Acra, Citadel, Newrez).\n" +
            "MANDATORY: Cite exact section + URL (e.g., \"Fannie B3-3.2-01 [singlefamily.fanniemae.com/selling-guide]\").\n" +
            "Never 'it depends' without rule/citation. List paths (DU vs manual, FHA vs Conventional) as Path A/B with citations.\n" +
            "FORMATTING: In tables, write dollar amounts and numbers as plain text — never wrap them in ** bold markers.\n" +
            "Tone: clinical, factual, zero sales — like senior underwriter on decisioning. Respond in 150-250 words max. End with disclaimer.",

        dscr:
            "You are DSCR Lab — 2026 non-QM investor loan expert for residential rentals (1-4 units), Grok 4.1 Fast Non-Reasoning mode.\n" +
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
            "Label illustrations 'Example Scenario'. Use FRED live rate if provided in context; otherwise assume current market ~6.0%.\n" +
            "CRITICAL — Use ACTUAL 2026 guidelines, NOT outdated 28/36 rule:\n" +
            "  • DEFAULT 43% back-end — standard threshold for FHA and conventional baseline. [HUD 4000.1 / Fannie B3-6]\n" +
            "  • STRETCH 45% back-end — Fannie/Freddie DU may approve with compensating factors (720+ FICO, 6mo reserves). [singlefamily.fanniemae.com]\n" +
            "  • MAX 50% — DU exception only, not a standard path.\n" +
            "  • Back-end = (PITI + all monthly debts) ÷ gross monthly income.\n" +
            "  • NEVER use 28/36 — outdated rule of thumb, not current lender guidelines.\n" +
            "INCOME BACK-SOLVE — MANDATORY STEPS:\n" +
            "  1) P&I: amortization formula M = L×[r(1+r)^n/((1+r)^n-1)], r=rate/12, n=360\n" +
            "  2) PITI: P&I + taxes(1.25%/yr÷12) + ins($150/mo) + PMI if <20% down (0.7%/yr÷12)\n" +
            "  3) Income: (PITI + other debts) ÷ DTI × 12. PRIMARY at 43% DTI. Secondary at 45%.\n" +
            "  CRITICAL: PMI must be in PITI for <20% down — do NOT omit it.\n" +
            "  Verified: 5.98% on $807,500 → P&I=$4,831 + Tax=$885 + PMI=$538 = PITI=$6,254\n" +
            "  Correct income at 43%: $6,254÷0.43×12 = $174,600/yr\n" +
            "LOAN LIMITS: $832,750 standard conforming (2026). CA most counties $832,750+, high-cost ceiling $1,249,125. Jumbo if over county limit.\n" +
            "Table: max PITI, required income at 43% DTI, required income at 45% DTI. Cite [Fannie Mae Selling Guide] or [HUD 4000.1]. No fluff. Tone: calm, decisive. Respond in 150-250 words max. End with disclaimer.",

        homeowner_payoff:
            "You are Payoff Planner — Grok 4.1 Fast Non-Reasoning mode. Homeowner equity acceleration specialist.\n" +
            "CRITICAL — BASE ALL MATH ON MORTGAGE BALANCE, NOT EQUITY. The question will contain 'mortgage balance $X' — use that X as your loan principal P. Equity is what the homeowner has already built; it is NOT the loan balance. Do not confuse them.\n" +
            "Your only job: show this homeowner the fastest, most cost-effective paths to pay off their mortgage early.\n" +
            "ALWAYS cover exactly these three strategies (with real math from the numbers provided):\n" +
            "1) Extra monthly payments — pick meaningful amounts ($100, $200, $500/mo) and show: months saved, interest saved, new payoff date.\n" +
            "2) Refi to 15-year — use the FRED 15Y rate provided in context. Show new P&I, total interest saved vs staying on current loan, breakeven on closing costs (~$3,500 assumed if not given).\n" +
            "3) Biweekly payments — show: extra payments/year (26 half-payments = 13 full payments), months saved, interest saved vs monthly schedule.\n" +
            "MATH: amortization formula M = P [r(1+r)^n / ((1+r)^n-1)] where r=monthly rate, n=months remaining (derive from payoff year if given). Use FRED mort15Avg for 15Y refi rate.\n" +
            "FORMATTING: Lead with a clean markdown table comparing all three strategies (Strategy | Monthly Change | Months Saved | Interest Saved). Then one short paragraph per strategy with the numbers.\n" +
            "DO NOT discuss: market conditions, AMI, FEMA risk, unemployment, Case-Shiller, neighborhood trends, foreclosure options, or general macro. Homeowner is focused — stay focused.\n" +
            "DO NOT use 'Example Scenario' labels when real numbers are provided in context.\n" +
            "Tone: calm, precise, empowering — like a trusted financial advisor showing someone how to get their house paid off.\n" +
            "Respond in 200-350 words. End with disclaimer.",

        about:
            "You are the dedicated About HomeRates.ai module — Grok 4.1 Fast Non-Reasoning mode.\n" +
            "ALWAYS open with the borrower pain: buying a home is the biggest financial decision most people make, yet the system is stacked against them — lenders quote selectively, rates are opaque, and every 'advisor' has a product to sell. Borrowers end up confused, overpaying, or paralyzed.\n" +
            "CRITICAL — FOUNDER FACTS (never invent, never substitute, never embellish):\n" +
            "- Founder: Rayaan Arif\n" +
            "- Background: tech entrepreneur and mortgage industry professional based in Los Angeles. Founded FundingTree.com (commercial real estate funding platform) and co-founded Konectcity Technology (AI-driven smart city platform). Speaker at IDEAS (International Data Engineering and Science Association) conference. Spent over a decade in mortgage lending working directly with borrowers across all loan types.\n" +
            "- The problem he kept seeing: borrowers trying to make the biggest financial decision of their lives — completely on their own. They'd Google and land on 14 articles written to rank, not to help. They'd ask a lender and immediately enter a sales funnel. They'd try ChatGPT and get confident answers built on data that's 12–24 months out of date with no connection to what rates actually are today. The entire mortgage industry was using AI to help lenders close faster — nobody was building for the borrower.\n" +
            "- Why he built HomeRates.ai: to give borrowers a place to get real answers before they talk to anyone — real mortgage math, live market rates, no gatekeepers, no lead forms, no sales pressure. The borrower finally has something in their corner.\n" +
            "- Mission: give every borrower access to the same quality of data and analysis that institutional players have, before they sign anything.\n" +
            "If asked about the founder, use ONLY these facts. Tell the story with warmth and authenticity. Do NOT invent a backstory, employer, personal anecdote, or any detail not listed above.\n" +
            "Modes:\n" +
            "1) Product: Elevator pitch (2-3 sentences), problem (conflicting quotes/sales/stale AI data), solution (on-demand analysis, no pressure), how it works (live FRED data, Freddie Mac guidelines, deterministic calc engine), philosophy (borrower first). End with HomeRates.ai next step.\n" +
            "2) Founder: Use ONLY the locked facts above. Tell the story — the problem he saw, the gap nobody was filling, why he built it. Calm, precise, empathetic. Next step: 'Test-drive on your scenario'.\n" +
            "Rules: Focus on HomeRates.ai — no generic education. Borrowers deserve institutional-grade analysis. Never invent facts.\n" +
            "FINAL: Append disclaimer:\n" +
            "DISCLAIMER: Educational only, not financial or legal advice. Rates and eligibility vary by lender and profile.\n" +
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
                answerMarkdown: buildAnswerMarkdown(typeof dscrOverride === "string" ? dscrOverride : JSON.stringify(dscrOverride)),
                followUp: null,
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

    // TAVILY GATE — only fire for questions that need live web data
    // Skips: calc engine questions, rate lookups (FRED handles), UW guidelines, about, lab
    // Detect a street address anywhere in the question
    // e.g. "1984 Lake Sherwood Dr" / "CMA for 1984 Lake Sherwood Dr, CA" / "What's 123 Main St worth"
    const isAddressQuery = /\b\d{1,5}\s+\w.{0,80}\b(dr|drive|st|street|ave|avenue|blvd|boulevard|ln|lane|way|rd|road|ct|court|pl|place|cir|circle|ter|terrace|pkwy|parkway|hwy|highway|loop|trail|run|path)\b/i.test(question);

    const needsWebSearch = (
        // Street address — always fetch comps + market context
        isAddressQuery ||
        // Location-specific market questions
        /\b(price|prices|market|median|inventory|homes?\s+in|buying\s+in|selling\s+in)\b.{0,40}\b(in|near|around)\b/i.test(question) ||
        /\b(austin|dallas|houston|miami|phoenix|denver|seattle|chicago|atlanta|boston|nashville|tampa|orlando|charlotte|las\s+vegas|los\s+angeles|san\s+diego|san\s+francisco|bay\s+area|new\s+york|new\s+jersey|virginia|maryland|colorado|florida|texas|california|georgia|arizona|washington)\b/i.test(question) ||
        // Current news / recent events
        /\b(news|today|this\s+week|this\s+month|recently|latest|just|breaking|2026)\b.{0,30}\b(mortgage|rate|housing|market|fed|economy)\b/i.test(question) ||
        // Lender-specific questions
        /\b(loandepot|loan\s+depot|uwm|united\s+wholesale|rocket|quicken|chase|wells\s+fargo|bank\s+of\s+america|pennymac|loancare|freedom\s+mortgage|caliber|newrez|lender|lenders)\b/i.test(question) ||
        // Market trends / forecasts needing current data
        /\b(forecast|outlook|prediction|trend|when\s+will|will\s+rates|housing\s+crash|bubble|recession|tariff|inflation\s+impact)\b/i.test(question)
    ) && module !== 'about';

    // TAVILY QUERY – module-aware
    let tav: TavilyMini = { ok: false, answer: null, results: [] };

    if (needsWebSearch) {
        let tavQuery: string;
        if (isAddressQuery) {
            tavQuery = `${question} home value recent sales comparable homes neighborhood market 2026 -youtube -forum -reddit`;
        } else if (module === "underwriting" || module === "qualify") {
            tavQuery = `${question} 2025 conventional mortgage guidelines site:singlefamily.fanniemae.com OR site:fanniemae.com OR site:freddiemac.com OR site:hud.gov OR site:benefits.va.gov OR site:va.gov OR site:cfpb.gov OR site:consumerfinance.gov -yahoo -aol -forum -blog -reddit -studylib -quizlet`;
        } else if (module === "rate") {
            tavQuery = `${question} 2025 mortgage rates site:bankrate.com OR site:mortgagenewsdaily.com OR site:freddiemac.com OR site:nerdwallet.com OR site:forbes.com -yahoo -aol -forum -blog -reddit`;
        } else {
            tavQuery = `${question} 2025 mortgage -yahoo -aol -forum -blog -reddit`;
        }

        tav = await askTavily(req, tavQuery, {
            depth: module === "underwriting" || module === "qualify" ? "advanced" : "basic",
            max: 6,
        });

        // Fallback relax
        if ((!tav.answer || tav.answer.trim().length < 80) && tav.results.length < 2) {
            const fallbackQuery = `${question} mortgage 2025`;
            tav = await askTavily(req, fallbackQuery, { depth: "advanced", max: 8 });
        }
    }

    mark("after Tavily");

    usedTavily = tav.ok && (tav.answer !== null || tav.results.length > 0);

    // FRED snapshot for rate questions AND mortgage/qualify/FHA topics
    // These calcs need the live rate — without it they default to hardcoded values
    const fredTopics: string[] = [];
    if (topic === 'rates' || module === 'rate' || /\b(rate|rates|\d+\.\d+\s*%)\b/i.test(question)) fredTopics.push('rates');
    if (module === 'refi') fredTopics.push('refi');
    if (module === 'arm') fredTopics.push('arm');
    if (isAffordabilityQuestion(question) || module === 'qualify') fredTopics.push('affordability', 'housing');
    if (isDSCRQuestion(question)) fredTopics.push('dscr', 'housing');
    if (isFHAQuestion(question) || isMortgageCalculation(question) || module === 'jumbo') fredTopics.push('housing');
    if (/\b(inflation|cpi|pce|prices?)\b/i.test(question)) fredTopics.push('inflation', 'macro');
    if (/\b(housing|home\s*price|inventory|supply|starts|market)\b/i.test(question)) fredTopics.push('housing');
    // Address queries always need live mortgage rate + housing context for PITI/affordability estimates
    if (isAddressQuery) { fredTopics.push('rates', 'housing'); }
    const wantFred = fredTopics.length > 0;
    fred = wantFred
        ? await getFredSnapshot(fredTopics)
        : {
            tenYearYield: null, mort30Avg: null, spread: null, asOf: null,
            mort15Avg: null, arm5Avg: null, dgs2: null, dgs30: null, t10y2y: null,
            fedFunds: null, sofr: null, cpi: null, corePCE: null, cpiShelter: null,
            housingStarts: null, existingHomeSales: null, medianHomePrice: null,
            monthsSupply: null, caseShiller: null, rentalVacancy: null,
            unemployment: null, hourlyEarnings: null
        };

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
            // First try memory_items (scenario_snapshot) — richest context
            const { data: memItems } = await supabase
                .from("memory_items")
                .select("content_text, content_json, created_at")
                .eq("memory_thread_id", memoryThreadId)
                .eq("kind", "scenario_snapshot")
                .order("created_at", { ascending: false })
                .limit(3);

            if (memItems?.length) {
                conversationHistory = [...memItems]
                    .reverse()
                    .map((item: any) => {
                        const text = item.content_text ||
                            (item.content_json ? JSON.stringify(item.content_json).slice(0, 300) : "");
                        return text.trim();
                    })
                    .filter(Boolean)
                    .join("\n\n");
            }

            // Fall back to user_answers if no memory_items found
            if (!conversationHistory) {
                const { data: history } = await supabase
                    .from("user_answers")
                    .select("question, answer_summary, answer, content_text")
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
                                entry.content_text ||
                                entry.answer_summary ||
                                (typeof entry.answer === "object" && entry.answer?.answer
                                    ? String(entry.answer.answer).slice(0, 200) + "…"
                                    : "Previous answer");
                            return `User: ${entry.question}\nAssistant: ${prev}`;
                        })
                        .join("\n\n");
                }
            }
        } catch (err: any) {
            console.warn("ANSWERS: history fetch failed", err?.message || err);
        }
    }

    mark("after history fetch");

    // Compact context blocks hard
    const today = new Date().toISOString().slice(0, 10);

    // fredContext: always show rate if available (even if usedFRED=false due to partial fetch)
    const fredRateStr = fred.mort30Avg != null
        ? `${fred.mort30Avg}%`
        : "~6.0% (estimate — FRED unavailable)";
    const fredLines: string[] = [];
    if (fred.mort30Avg != null) fredLines.push(`30Y fixed=${fred.mort30Avg}% (Freddie Mac PMMS, ${fred.asOf ?? today})`);
    if (fred.mort15Avg != null) fredLines.push(`15Y fixed=${fred.mort15Avg}%`);
    if (fred.arm5Avg != null) fredLines.push(`5/1 ARM=${fred.arm5Avg}%`);
    if (fred.tenYearYield != null) fredLines.push(`10Y Treasury=${fred.tenYearYield}%`);
    if (fred.dgs2 != null) fredLines.push(`2Y Treasury=${fred.dgs2}%`);
    if (fred.t10y2y != null) fredLines.push(`yield curve (10Y-2Y)=${fred.t10y2y}% ${fred.t10y2y < 0 ? '(INVERTED)' : ''}`);
    if (fred.spread != null) fredLines.push(`mtg-treasury spread=${fred.spread}%`);
    if (fred.fedFunds != null) fredLines.push(`Fed funds=${fred.fedFunds}%`);
    if (fred.sofr != null) fredLines.push(`SOFR=${fred.sofr}%`);
    if (fred.cpi != null) fredLines.push(`CPI=${fred.cpi}%`);
    if (fred.corePCE != null) fredLines.push(`core PCE=${fred.corePCE}%`);
    if (fred.cpiShelter != null) fredLines.push(`CPI shelter=${fred.cpiShelter}%`);
    if (fred.unemployment != null) fredLines.push(`unemployment=${fred.unemployment}%`);
    if (fred.housingStarts != null) fredLines.push(`housing starts=${fred.housingStarts}k SAAR`);
    if (fred.existingHomeSales != null) fredLines.push(`existing home sales=${fred.existingHomeSales}M SAAR`);
    if (fred.medianHomePrice != null) fredLines.push(`median home price=$${fred.medianHomePrice.toLocaleString()}`);
    if (fred.monthsSupply != null) fredLines.push(`months supply=${fred.monthsSupply}mo`);
    if (fred.caseShiller != null) fredLines.push(`Case-Shiller HPI=${fred.caseShiller}`);
    if (fred.rentalVacancy != null) fredLines.push(`rental vacancy=${fred.rentalVacancy}%`);
    const fredContext = fredLines.length > 0
        ? `FRED LIVE DATA:\n${fredLines.join('\n')}`
        : "FRED data unavailable — use ~6.0% as rate estimate";

    // ── GEO INTELLIGENCE: HUD + FEMA context ─────────────────────────────────
    // Resolve if question contains a ZIP code. Non-blocking — silently skips if
    // tables are empty (pre-ETL) or ZIP not found.
    let geoContext = "";
    let geoFeatures: Awaited<ReturnType<typeof resolveGeoFeatures>> = null;
    try {
        const detectedZip = extractZip(question);
        if (detectedZip && supabase) {
            const detectedIncome = extractIncome(question);
            geoFeatures = await resolveGeoFeatures(detectedZip, {
                annualIncome: detectedIncome ?? undefined,
                householdSize: 4,
            });
            if (geoFeatures?.promptBlock) {
                geoContext = geoFeatures.promptBlock;
                console.log(`[GeoIntel] Resolved ZIP ${detectedZip} → ${geoFeatures.county_name ?? 'unknown county'}`);
            }
        }
    } catch (geoErr) {
        // Never block an answer due to geo lookup failure
        console.warn('[GeoIntel] Lookup failed (silently ignored):', geoErr);
    }
    // ── END GEO INTELLIGENCE ──────────────────────────────────────────────────

    // Inject live rate into qualify prompt so model stops using its hardcoded 6.25%
    if (module === "qualify" && modulePrompts["qualify"]) {
        modulePrompts["qualify"] = modulePrompts["qualify"].replace(
            "Use FRED live rate if provided in context; otherwise assume current market ~6.0%.",
            `Use FRED live rate: ${fredRateStr} (30yr fixed avg as of ${fred.asOf || today}).`
        );
    }
    const tavilyContextRaw =
        Array.isArray(tav.results) && tav.results.length
            ? tav.results
                .slice(0, 4)
                .map((s) => `• ${s.title}: ${(s.snippet || s.content || "").slice(0, 140)}…`)
                .join("\n")
            : "No recent sources";

    const specialistPrefix = clampText(compactWhitespace(modulePrompts[module] ?? ""), module === 'about' ? 1200 : module === 'homeowner_payoff' ? 900 : 450);
    const guidelineCtxTrim = clampText(compactWhitespace(guidelineContext || ""), 300);
    const tavilyCtxTrim = clampText(compactWhitespace(tavilyContextRaw), 600);
    const conversationTrim = clampText(compactWhitespace(conversationHistory || ""), 320);

    // Refi guardrail: ask for inputs only if missing; otherwise compute locally (no Grok)
    const _po = (body as any)?.paramOverrides;
    const _hasRefiCalcParams = (_po?.newRatePct != null && _po?.currentBalance != null) || (_po?.rate20yr != null && _po?.rate30yr != null);
    if (module === "refi" && !_hasRefiCalcParams) {
        // ============================================================
        // SMART REFI ADVISOR v2 — AI-powered decision engine
        // Not a calculator. A verdict.
        // ============================================================

        // ── Math helpers ──
        const mpi = (p: number, r: number, n: number): number => {
            const mr = (r / 100) / 12;
            if (n <= 0 || p <= 0) return 0;
            if (mr === 0) return p / n;
            const pw = Math.pow(1 + mr, n);
            return p * (mr * pw) / (pw - 1);
        };

        const remainBal = (origBal: number, rPct: number, totalMo: number, paidMo: number): number => {
            const r = (rPct / 100) / 12;
            if (r === 0) return origBal * (1 - paidMo / totalMo);
            const pw = Math.pow(1 + r, totalMo);
            const pwp = Math.pow(1 + r, paidMo);
            const pmt = origBal * (r * pw) / (pw - 1);
            return pmt * (pw - pwp) / (r * pw);
        };

        // What rate achieves a target breakeven (binary search)
        const triggerRate = (bal: number, curRatePct: number, costs: number, targetBeYears: number, moLeft: number): number | null => {
            const curPmt = mpi(bal, curRatePct, moLeft);
            for (let r10 = Math.floor(curRatePct * 10) - 1; r10 >= 15; r10--) {
                const r = r10 / 10;
                const newPmt = mpi(bal, r, moLeft);
                const save = curPmt - newPmt;
                if (save > 0 && costs / save <= targetBeYears * 12) return r;
            }
            return null;
        };

        const f$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
        const fD = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const fPct = (n: number) => `${n.toFixed(2)}%`;

        // ── Parse inputs ──
        const qFull = question;

        // Balance — handles $1,280,000 / $1.28M / $580k / on my $X
        // Equity-options questions ("value $X, balance $Y, equity $Z") list value before balance —
        // check for the explicit "balance $X" label first to avoid grabbing the value amount.
        const balM =
            qFull.match(/\bbalance\b\s*\$?\s*([\d,]+)/i) ??
            qFull.match(/\$\s*([\d,]+(?:,\d{3})+)/i) ??
            qFull.match(/\$\s*(\d+(?:\.\d+)?)\s*[Mm]\b/) ??
            qFull.match(/\bon\s+(?:my\s+)?\$\s*(\d+(?:\.\d+)?)\s*k?\b/i) ??
            qFull.match(/\$\s*(\d+(?:\.\d+)?)\s*k\b/i);
        let balance: number | null = null;
        if (balM) {
            const raw = balM[1].replace(/,/g, '');
            const n = parseFloat(raw);
            if (isFinite(n)) {
                // Check matched token only — not full question (prevents $100k × $2.35M = $100B bug)
                const mSuf = /\$\s*\d+(?:\.\d+)?\s*[Mm]\b/.test(balM[0]);
                const kSuf = /\$\s*\d+(?:\.\d+)?\s*k\b/i.test(balM[0]);
                balance = mSuf ? n * 1_000_000 : kSuf ? n * 1000 : n;
            }
        }

        // Current rate — explicit patterns preferred; catch-all (first %) used only when no
        // snapshot exists. On follow-up turns the snapshot fill below overwrites catch-all
        // with the correct stored rate, preventing wrong-rate poisoning from chip seed text.
        const curRMExplicit =
            qFull.match(/\b(?:current\s*rate|my\s*rate)\b\s*(?:is\s+)?(\d+\.?\d*)\s*%/i) ??
            qFull.match(/\bat\s+(\d+\.?\d*)\s*%/i) ??
            qFull.match(/(\d+\.?\d*)\s*%\s*(?:rate|interest|on\s*my|current)/i);
        const curRMFallback = (() => {
            const all = [...qFull.matchAll(/(\d+\.?\d*)\s*%/g)].map(m => parseFloat(m[1])).filter(r => r > 1 && r < 20);
            return all.length >= 1 ? { 1: String(all[0]) } as any : null;
        })();
        let currentRate = curRMExplicit
            ? parseFloat(curRMExplicit[1])
            : curRMFallback ? parseFloat(curRMFallback[1]) : null;
        const currentRateFromFallbackOnly = !curRMExplicit && curRMFallback != null;

        // New/target rate
        const newRM =
            qFull.match(/\b(?:refi(?:nance)?\s+(?:to|at|when)|new\s*rate)\s+(\d+\.?\d*)\s*%/i) ??
            qFull.match(/(?:go\s+(?:down\s+)?to|drop\s+to|hit|reach|down\s+to)\s*(\d+\.?\d*)\s*%/i) ??
            qFull.match(/when.*?rates?.*?(?:go|drop|hit|reach|become|are).*?(?:to|at)?\s*(\d+\.?\d*)\s*%/i) ??
            (() => {
                const all = [...qFull.matchAll(/(\d+\.?\d*)\s*%/g)].map(m => parseFloat(m[1])).filter(r => r > 1 && r < 20);
                return all.length >= 2 ? { 1: String(all[all.length - 1]) } as any : null;
            })();
        const newRate = newRM ? parseFloat((newRM as any)[1]) : null;

        // Years info
        const ylM = qFull.match(/(\d+)\s*(?:years?|yrs?)\s*(?:left|remaining|to\s*go)/i);
        const yiM = qFull.match(/(\d+)\s*years?\s*(?:in|into|ago)/i) ??
            qFull.match(/(?:bought|purchased|got\s*(?:the\s*)?loan)\s*(\d+)\s*years?\s*ago/i);
        const yearsLeft = ylM ? parseInt(ylM[1]) : null;
        const yearsIn = yiM ? parseInt(yiM[1]) : null;
        const monthsLeft = yearsLeft ? yearsLeft * 12 : yearsIn ? (30 - yearsIn) * 12 : 360;

        // Closing costs, home value, loan type signals
        const costsM = qFull.match(/\b(?:costs?|closing\s*costs?|fees?)\s*\$?\s*([\d,]+)/i);
        const closingCosts = costsM ? parseFloat(costsM[1].replace(/,/g, '')) : null;

        const homeValM = qFull.match(/(?:home|house|property|value|worth)\s+(?:is\s+|worth\s+)?\$?\s*([\d,]+)\s*k?\b/i);
        const homeValue = homeValM ? parseFloat(homeValM[1].replace(/,/g, '')) * (homeValM[1].length <= 4 ? 1000 : 1) : null;

        // Refi TYPE detection
        const qLow = qFull.toLowerCase();
        const isCashOut = /cash.?out|pull\s*(?:out|equity)|access\s*equity|take\s*out\s*\$/.test(qLow);
        const isFHAtoConv = /fha.{0,20}(?:conventional|conv)|remove\s*mip|drop\s*mip|get\s*rid.*mip/.test(qLow);
        const isARMtoFixed = /\b(?:arm|5\/1|7\/1|10\/1|adjustable|reset|fixed\s*rate\s*(?:security|peace))\b/.test(qLow);
        const isRateWatch = /tell\s*me\s*when|rate\s*alert|when\s+(?:should|to)\s+refi|trigger\s+rate|watch\s+for/.test(qLow);
        const isStreamline = /streamline|irrrl|va\s*refi|fha\s*streamline/.test(qLow);
        const isShorten = /(?:shorten|shorter|20.?year|15.?year|pay\s*off\s*(?:faster|sooner)|reduce\s*term)/.test(qLow);

        const refiType = isCashOut ? "cash_out" : isFHAtoConv ? "fha_to_conv" : isARMtoFixed ? "arm_to_fixed" : isStreamline ? "streamline" : "rate_term";

        // Live FRED market data
        const marketRate = fred?.mort30Avg ?? null;
        const fredAsOf = fred?.asOf ?? generatedAt.slice(0, 10);

        // ── If missing key inputs — check snapshot before giving up ──
        // snapshotJson is resolved later in route.ts but this bypass fires first.
        // Fetch the most recent refi snapshot inline so currentRate/balance can be filled from prior turn.
        if ((!balance || !currentRate || currentRateFromFallbackOnly) && supabase && memoryThreadId && chatId) {
            try {
                const { data: refiSnap } = await supabase
                    .from('memory_items')
                    .select('content_json')
                    .eq('memory_thread_id', memoryThreadId)
                    .eq('kind', 'scenario_snapshot')
                    .eq('content_json->>chat_id', chatId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                if (refiSnap?.content_json) {
                    const sj = refiSnap.content_json;
                    // Snapshot always wins for currentRate — prevents catch-all grabbing
                    // a scenario/target rate from chip seed text on follow-up turns
                    if (sj.current_rate_pct) (currentRate as any) = Number(sj.current_rate_pct);
                    if (!balance && sj.loan_amount) balance = Number(sj.loan_amount);
                }
            } catch { /* silent — falls through to needs_input if no snap */ }
        }
        // ── Equity-options intercept: balance + home value known, rate not required ──
        // The "Run My Numbers" chip sends: "Equity options for {addr}: value $2.35M, balance $1.61M, equity $738k (31%). What are my best options — HELOC, cash-out refi, or sell?"
        // Values may be abbreviated ($2.35M, $738k) or full ($1,662,713) — must handle both.
        const isEquityOptions = /\b(?:heloc|cash.?out).{0,80}(?:sell|option)|sell.{0,80}(?:heloc|cash.?out)|best.*option.{0,60}(?:heloc|sell)/i.test(qFull);

        // Parse "$2.35M" | "$1.61M" | "$738k" | "$1,662,713" — all formats the chip uses
        const parseEqMoney = (token: string | null | undefined): number | null => {
            if (!token) return null;
            const m = token.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([MmKk]?)/);
            if (!m) return null;
            const n = parseFloat(m[1].replace(/,/g, ''));
            if (!isFinite(n) || n <= 0) return null;
            const s = (m[2] ?? '').toUpperCase();
            return s === 'M' ? n * 1e6 : s === 'K' ? n * 1e3 : n;
        };
        const eqValTok  = qFull.match(/\bvalue\s+(\$[\d,]+(?:\.\d+)?\s*[MmKk]?)/i)?.[1];
        const eqBalTok  = qFull.match(/\bbalance\s+(\$[\d,]+(?:\.\d+)?\s*[MmKk]?)/i)?.[1];
        const eqHomeValue = parseEqMoney(eqValTok) ?? homeValue;
        const eqBalance   = parseEqMoney(eqBalTok) ?? balance;

        if (isEquityOptions && eqBalance && eqHomeValue && eqHomeValue > eqBalance) {
            const equity    = Math.round(eqHomeValue - eqBalance);
            const equityPct = (equity / eqHomeValue) * 100;
            const helocMax  = Math.max(0, Math.round(eqHomeValue * 0.85 - eqBalance));
            const cashOutMax = Math.max(0, Math.round(eqHomeValue * 0.80 - eqBalance));
            const sellNet   = Math.round(equity - eqHomeValue * 0.07);

            let verdict = '';
            if (equityPct < 15) {
                verdict = `With only **${equityPct.toFixed(0)}% equity**, options are limited — HELOC availability is uncertain and cash-out refi may not qualify at conventional limits.`;
            } else if (equityPct < 30) {
                verdict = `With **${equityPct.toFixed(0)}% equity**, a HELOC gives you the most flexibility — pull what you need and only pay interest on the drawn amount. Cash-out refi makes sense only if you can also lower your rate.`;
            } else {
                verdict = `With **${equityPct.toFixed(0)}% equity**, you have real options. HELOC wins for flexibility; cash-out refi wins if rates are lower than yours; sell wins if you want full liquidity.`;
            }

            const rateNote = marketRate
                ? `\n\n> 📡 **Today's 30yr market rate: ${fPct(marketRate)}** (FRED, ${fredAsOf}) — if your current rate is higher, a cash-out refi becomes more attractive.`
                : '';

            const answerText = `## 🏠 Your Equity Options — By the Numbers${rateNote}

**Your position:**
- Home value: **${f$(eqHomeValue)}** · Balance: **${f$(eqBalance)}**
- Equity: **${f$(equity)}** (${equityPct.toFixed(0)}% of home value)

---

### Option 1 — HELOC
- Max available: ${helocMax > 0 ? `**${f$(helocMax)}**` : 'not available at current LTV'} (85% LTV rule)
- **How it works:** Variable-rate line you draw from as needed. Interest-only payments during the draw period. Doesn't touch your existing mortgage or rate.
- **Best for:** Home improvements, one-time needs, or preserving your current mortgage rate.

### Option 2 — Cash-Out Refi
- Max cash-out: ${cashOutMax > 0 ? `**${f$(cashOutMax)}**` : 'not available at current LTV'} (80% LTV)
- **How it works:** Replaces your mortgage entirely at a new rate and new balance. Fixed payment, but resets your amortization clock.
- **Best for:** Large lump sum + lowering your rate at the same time. Least efficient if your current rate is already competitive.

### Option 3 — Sell
- Estimated net proceeds: **${f$(Math.max(0, sellNet))}** (after ~7% in agent, title & transfer costs)
- **How it works:** Full equity capture at closing. Clean exit.
- **Best for:** Maximizing liquidity, upsizing, or downsizing.

---

${verdict}

*Share your current interest rate and I'll run the exact cash-out refi payment and break-even.*`;

            // No chips — the HELOC card is the interactive element; chips with dollar amounts
            // confuse the refi handler's balance parser on follow-up questions.
            const equityChips: Array<{ label: string; seed: string }> = [];

            const helocCard = {
                homeValue:   eqHomeValue,
                balance:     eqBalance,
                drawAmount:  Math.min(100_000, helocMax),
                helocRate:   9.0,
                cashOutRate: marketRate ?? undefined,
            };

            return noStore({
                ok: true, memory_thread_id: memoryThreadId, route: "answers", intent, path, tag,
                generatedAt, usedFRED, usedTavily, fred, topSources,
                grok: { answer: answerText, follow_up: '', follow_up_chips: [], confidence: "high" },
                debug: { bypass: "equity_options_direct", parsed: { balance: eqBalance, homeValue: eqHomeValue, equity, equityPct: equityPct.toFixed(1) } },
                message: answerText, answerMarkdown: buildAnswerMarkdown(answerText),
                followUp: null, follow_up_chips: [],
                helocCard,
            });
        }

        if (!balance || !currentRate) {
            const marketNote = marketRate
                ? `\n\n> 📡 **Today's market rate: ${fPct(marketRate)}** (FRED, live ${fredAsOf})`
                : '';

            const contextChips = isFHAtoConv
                ? [
                    { label: "FHA→conventional to kill MIP — show me the math", seed: "I have an FHA loan at 6.5% on a $450k home — is it worth refinancing to conventional to remove MIP?" },
                    { label: "How much equity do I need to remove MIP?", seed: "How much equity do I need to refinance FHA to conventional and remove MIP?" },
                    { label: "FHA→conventional at same rate — is it worth it?", seed: "Would it make sense to refi FHA to conventional at the same rate just to remove MIP on my $500k loan?" },
                ]
                : isARMtoFixed
                    ? [
                        { label: "ARM reset worst-case — show me the numbers", seed: "My 7/1 ARM is resetting — what's my worst-case payment if rates stay at 6.5%?" },
                        { label: "Lock to fixed now vs ride out the ARM", seed: "Should I lock my 5/1 ARM at 6% to a 30yr fixed at 5.99%, or ride it out?" },
                        { label: "ARM cap protection — what rate am I exposed to?", seed: "My ARM has a 2/2/5 cap structure at 4.5% start rate — what's my max payment exposure?" },
                    ]
                    : [
                        { label: "Tell me when a refi makes sense — what's my trigger rate?", seed: `What rate would I need to see to make a refi worth it on my $650,000 mortgage at ${currentRate ?? 6.5}%?` },
                        { label: "Refi now vs wait for a better rate — show the math", seed: "I have a $780k balance at 6.75% — compare refinancing to 5.99% now vs waiting for 5.5%" },
                        { label: "Should I make extra payments instead of refinancing?", seed: "I have a $500k balance at 6.5% — compare refinancing to 5.5% vs making extra principal payments" },
                    ];

            const askMsg = `## 🏦 Refi Advisor — What's Your Situation?${marketNote}

To give you a real verdict (not just math), I need:

- **Current loan balance** (e.g. $650,000)
- **Your current interest rate** (e.g. 6.5%)
- **Target rate or timeframe** you're considering

**Optional but powerful:**
- How many years you've been in the loan (affects amortization reset analysis)
- Home value (needed for cash-out or FHA→conventional analysis)
- How long you plan to stay

**Example:** *"Balance $780k at 6.75%, want to refi to 5.99%, bought 3 years ago, plan to stay 7 more years"*`;

            // Seed a slider with defaults so user can explore without typing first
            const defaultBal      = 600_000;
            const defaultCurRate  = currentRate ?? 6.75;
            const defaultNewRate  = newRate ?? marketRate ?? 6.38;
            const defaultTermMo   = monthsLeft ?? 360;
            const defaultCosts    = Math.round(defaultBal * 0.02);

            return noStore({
                ok: true, memory_thread_id: memoryThreadId, route: "answers", intent, path, tag,
                generatedAt, usedFRED, usedTavily, fred, topSources,
                grok: { answer: askMsg, follow_up: '', follow_up_chips: [], confidence: "needs_input" },
                debug: { bypass: "refi_needs_input", refiType, parsed: { balance, currentRate, newRate, monthsLeft } },
                message: askMsg, answerMarkdown: buildAnswerMarkdown(askMsg),
                followUp: null, follow_up_chips: [],
                refiSlider: {
                    balance:      defaultBal,
                    currentRate:  defaultCurRate,
                    newRate:      defaultNewRate,
                    termMonths:   defaultTermMo,
                    closingCosts: defaultCosts,
                },
            });
        }

        // ── FULL CALCULATION ENGINE ──
        const effNewRate = newRate ?? marketRate ?? (currentRate - 0.5);
        const paramClosingCosts = (body as any)?.paramOverrides?.closingCosts;
        const effCosts = paramClosingCosts != null ? paramClosingCosts : (closingCosts ?? balance * 0.02);
        const amortReset = yearsIn && yearsIn >= 10; // warn if resetting significant amortization

        // Core payments
        const curPI = mpi(balance, currentRate, monthsLeft);
        const newPI = mpi(balance, effNewRate, monthsLeft);
        const save = curPI - newPI;
        const annSav = save * 12;
        const beM = save > 0 ? effCosts / save : null;
        const beYrs = beM ? beM / 12 : null;

        // Total interest comparison (remaining term)
        const totIntCur = (curPI * monthsLeft) - balance;
        const totIntNew = (newPI * monthsLeft) - balance;
        const lifeSave = totIntCur - totIntNew - effCosts;

        // Amortization reset cost — what they pay extra in interest by restarting 30yr
        let resetPenalty = 0;
        let resetWarning = "";
        if (yearsIn && yearsIn >= 5) {
            const moLeft20 = Math.max(monthsLeft, 0);
            const totalIf30yr = newPI * 360;
            const totalIfRemaining = curPI * monthsLeft;
            resetPenalty = totalIf30yr - totalIfRemaining;
            if (resetPenalty > 0 && yearsIn >= 10) {
                resetWarning = `\n> ⚠️ **Amortization reset penalty:** You're **${yearsIn} years in** — refinancing to a new 30yr restarts your clock. You'd pay an extra **${f$(resetPenalty)}** in total interest vs finishing your current loan. Consider a 20yr or 15yr refi instead.`;
            }
        }

        // Trigger rates (what rate achieves X-year breakeven)
        const trig2yr = triggerRate(balance, currentRate, effCosts, 2, monthsLeft);
        const trig3yr = triggerRate(balance, currentRate, effCosts, 3, monthsLeft);
        const trig5yr = triggerRate(balance, currentRate, effCosts, 5, monthsLeft);

        // Wait scenarios (0.5% and 1.0% below target)
        const wr1 = Math.max(effNewRate - 0.5, 2.0);
        const wr2 = Math.max(effNewRate - 1.0, 2.0);
        const piW1 = mpi(balance, wr1, monthsLeft);
        const piW2 = mpi(balance, wr2, monthsLeft);
        const svW1 = curPI - piW1;
        const svW2 = curPI - piW2;
        const beW1 = svW1 > 0 ? effCosts / svW1 : null;
        const beW2 = svW2 > 0 ? effCosts / svW2 : null;
        const extraMoW1 = svW1 - save;
        const moToRecoverW1 = extraMoW1 > 0 ? Math.ceil(save / extraMoW1) : 999;

        // Shorten to 20yr
        const pi20 = mpi(balance, effNewRate, 240);
        const int20 = (pi20 * 240) - balance;
        const int20saved = totIntNew - int20;

        // Net savings milestones
        const net5 = (save * 60) - effCosts;
        const net10 = (save * 120) - effCosts;

        // FHA MIP context
        let mipNote = "";
        if (isFHAtoConv) {
            const estMIP = balance * 0.0055 / 12;
            mipNote = `\n\n---\n\n## 🎯 FHA → Conventional: The Real Play\n\nAt ${fPct(effNewRate)}, this isn't just about the rate — it's about **permanently eliminating MIP**.\n\n| | FHA (current) | Conventional (refi) |\n|--|--|--|\n| Rate | ${fPct(currentRate)} | ${fPct(effNewRate)} |\n| Monthly MIP | ~${f$(estMIP)}/mo | ❌ Gone |\n| PMI at 20% equity | — | Auto-cancels |\n| Combined savings | — | **${f$(save + estMIP)}/mo** |\n\n> ✅ Even if the rate savings alone are marginal, **MIP removal saves ~${f$(estMIP * 12)}/yr forever**. This changes the calculus entirely — a breakeven that looks like 6 years becomes 3 years when you factor in MIP.`;
        }

        // ARM context
        let armNote = "";
        if (isARMtoFixed) {
            const armResetRaw = qFull.match(/(\d+)\/(\d+)\s*arm/i);
            const fixedYrs = armResetRaw ? parseInt(armResetRaw[1]) : 5;
            const adjCap = currentRate + 2; // typical 2% periodic cap
            const lifeCap = currentRate + 5; // typical 5% lifetime cap
            const piWorstCase = mpi(balance, lifeCap, monthsLeft);
            armNote = `\n\n---\n\n## ⚠️ ARM Reset Risk\n\nWith a ${fixedYrs}/1 ARM, your rate adjusts annually after year ${fixedYrs}. **Worst case at caps:**\n\n| Scenario | Rate | Monthly P&I |\n|--|--|--|\n| Today (fixed period) | ${fPct(currentRate)} | ${fD(curPI)} |\n| First reset (+2% cap) | ${fPct(adjCap)} | ${fD(mpi(balance, adjCap, monthsLeft))} |\n| Lifetime cap (+5%) | ${fPct(lifeCap)} | ${fD(piWorstCase)} |\n| **Fixed at ${fPct(effNewRate)}** | **${fPct(effNewRate)}** | **${fD(newPI)}** |\n\n> 🔒 Locking to a fixed rate at ${fPct(effNewRate)} costs you ${f$(newPI - curPI > 0 ? newPI - curPI : 0)}/mo more now but **caps your worst-case exposure** at ${fD(piWorstCase - newPI)}/mo vs staying on the ARM.`;
        }

        // Cash-out context  
        let cashOutNote = "";
        if (isCashOut) {
            const cashM = qFull.match(/(?:cash\s*out|pull|take\s*out)\s*\$?\s*([\d,]+)\s*k?\b/i);
            const cashAmt = cashM ? parseFloat(cashM[1]) * (cashM[1].length <= 3 ? 1000 : 1) : null;
            cashOutNote = `\n\n---\n\n## 💵 Cash-Out: What Lenders Won't Tell You\n\n${cashAmt ? `You want to pull **${f$(cashAmt)}** out of equity.` : 'You want to pull equity out.'} Here's the true cost comparison:\n\n| Option | Rate | Monthly cost | True cost of $${cashAmt ? cashAmt / 1000 : 'X'}k |\n|--|--|--|--|\n| Cash-out refi (new 30yr) | ~${fPct(effNewRate)} | Higher P&I | ${cashAmt ? f$(cashAmt * (effNewRate / 100)) + '/yr in interest' : 'depends on amount'} |\n| HELOC (variable) | Prime+1% (~9-10%) | Interest-only option | Higher rate, flexible draw |\n| Personal loan | 8-15% | Fixed short-term | Best for amounts < $50k |\n\n> ⚠️ **Tax note:** Cash-out interest is only deductible if proceeds are used for home improvement. Debt consolidation or other uses lost deductibility under TCJA 2017.\n\n> 💡 **Pro move:** If your current rate is below 5%, think carefully — a cash-out refi replaces your entire loan at the new (higher) rate. A HELOC keeps your low first mortgage intact.`;
        }

        // FRED live market comparison
        const fredNote = marketRate
            ? save <= 0 && marketRate >= currentRate
                ? `\n> 📡 **Today's market rate: ${fPct(marketRate)}** (FRED, live) — it's *above* your current rate. **Don't refi right now.**`
                : `\n> 📡 **Today's market rate: ${fPct(marketRate)}** (FRED, live ${fredAsOf})${Math.abs(marketRate - effNewRate) < 0.1 ? ' — your target rate is **available right now**.' : ` — your target (${fPct(effNewRate)}) is ${effNewRate > marketRate ? fPct(effNewRate - marketRate) + ' above' : fPct(marketRate - effNewRate) + ' below'} today's market.`}`
            : '';

        // ── VERDICT LOGIC ──
        const rateDrop = currentRate - effNewRate;
        let vEmoji: string, vTitle: string, vBody: string;

        // Special: market rate is above/at current rate — don't refi at all
        if (marketRate && marketRate >= currentRate && !newRate) {
            vEmoji = "⛔";
            vTitle = "Hold — today's rates are not better than yours";
            vBody = `Market is at ${fPct(marketRate)} vs your ${fPct(currentRate)}. Refinancing now would increase your payment. The right move is to wait and watch for your trigger rate.`;
        } else if (save <= 0) {
            vEmoji = "⛔";
            vTitle = "This refi doesn't pencil";
            vBody = `At ${fPct(effNewRate)} your payment rises by ${f$(Math.abs(save))}/mo. Only makes sense for cash-out, term shortening, or removing MIP.`;
        } else if (rateDrop < 0.375) {
            vEmoji = "🔴";
            vTitle = "Not worth it — spread is too thin";
            vBody = `A ${fPct(rateDrop)} drop saves ${f$(save)}/mo but breakeven is ${beYrs ? beYrs.toFixed(1) : '?'} years. The general rule of thumb: refi needs at least a 0.5%–0.75% improvement to cover costs. Your trigger rate for a 3-year breakeven is **${trig3yr ? fPct(trig3yr) : 'not achievable at current costs'}**.`;
        } else if (beYrs && beYrs <= 2.5) {
            vEmoji = "✅";
            vTitle = "Strong refi — pull the trigger";
            vBody = `Breakeven in **${beYrs.toFixed(1)} years** saving ${f$(save)}/mo. This is a clear win if you're staying more than 2–3 years.`;
        } else if (beYrs && beYrs <= 4) {
            vEmoji = "✅";
            vTitle = "Good refi — solid if staying 4+ years";
            vBody = `Breakeven in **${beYrs.toFixed(1)} years**. At ${f$(save)}/mo and ${f$(annSav)}/yr, this pencils as long as you're not planning to sell soon.`;
        } else if (beYrs && beYrs <= 6) {
            vEmoji = "🟡";
            vTitle = "Marginal — depends on your timeline";
            vBody = `Breakeven is **${beYrs.toFixed(1)} years**. If you're staying 7+ years, it works. If you might sell in 3–4 years, you'll likely be underwater on the costs.`;
        } else {
            vEmoji = "🔴";
            vTitle = "Long breakeven — not recommended unless staying long-term";
            vBody = `Breakeven is **${beYrs ? beYrs.toFixed(1) : '?'} years**. That's a long time to recover closing costs. Your trigger rate for a 5-year breakeven is **${trig5yr ? fPct(trig5yr) : 'not available at 2% costs'}**.`;
        }

        // Rate-watch verdict
        const rateWatchSection = `\n\n---\n\n## 📡 Your Rate-Watch Trigger Points\n\n| Target Breakeven | Rate You Need | Monthly Savings at That Rate |\n|--|--|--|\n| 2-year breakeven | **${trig2yr ? fPct(trig2yr) : 'N/A'}** | ${trig2yr ? f$(mpi(balance, currentRate, monthsLeft) - mpi(balance, trig2yr, monthsLeft)) + '/mo' : '—'} |\n| 3-year breakeven | **${trig3yr ? fPct(trig3yr) : 'N/A'}** | ${trig3yr ? f$(mpi(balance, currentRate, monthsLeft) - mpi(balance, trig3yr, monthsLeft)) + '/mo' : '—'} |\n| 5-year breakeven | **${trig5yr ? fPct(trig5yr) : 'N/A'}** | ${trig5yr ? f$(mpi(balance, currentRate, monthsLeft) - mpi(balance, trig5yr, monthsLeft)) + '/mo' : '—'} |\n\n${fredNote}`;

        // Ask Your Lender section
        const strikeRate = parseFloat((currentRate - 0.5).toFixed(2));
        const costsNote = paramClosingCosts != null
            ? (paramClosingCosts === 0 ? 'no-cost refi — lender covers all fees' : `your provided ${f$(paramClosingCosts)}`)
            : closingCosts
                ? `your provided ${f$(closingCosts)} cost figure`
                : `2% estimate (${f$(effCosts)}) — get actual lender quotes, jumbo loans often run 1.5–2.5%`;
        const lenderAlertQ = save <= 0 || rateDrop < 0.5
            ? `- **"Can you set up a rate alert for ${fPct(strikeRate)}?"** Many lenders will call or text when your trigger rate is available.\n`
            : `- **"Do you offer a float-down before closing?"** Some lenders let you drop to the day-of rate at no cost if rates fall before you close.\n`;
        const lenderSection = `\n\n---\n\n## 💬 Ask Your Lender\n\n- **"What's the APR — not just the rate?"** APR folds in origination fees and points; that's the real number to compare across lenders.\n- **"How many discount points are priced in?"** 1 point = 1% of the loan upfront. Removing points raises the rate but cuts your cash-to-close.\n- **"What's your no-cost option?"** Ask for the rate where lender credits cover all fees — breakeven starts day 1, no math needed.\n- **"Give me a Loan Estimate in writing."** Required by law within 3 business days — title, escrow, and origination fees vary $3k–$8k between lenders.\n- **"What's the lock period and extension cost?"** Closings slip; know your exposure before you sign.\n${lenderAlertQ}`;

        // ── MAIN OUTPUT ──
        const costsUsedNote = paramClosingCosts != null
            ? (paramClosingCosts === 0 ? 'no-cost (lender credit)' : `your ${f$(paramClosingCosts)} quote`)
            : closingCosts ? `your ${f$(closingCosts)} quote` : `2% estimate (${f$(effCosts)})`;
        const md = `## ${vEmoji} Refi Analysis — ${fPct(currentRate)} → ${fPct(effNewRate)}
${fredNote}

**Loan Balance: ${f$(balance)}** · ${(monthsLeft / 12).toFixed(0)}-year remaining term

---

## 💰 Monthly Savings Breakdown

| | Current (${fPct(currentRate)}) | Refi to ${fPct(effNewRate)} | Change |
|--|--|--|--|
| P&I payment | ${fD(curPI)}/mo | ${fD(newPI)}/mo | **${save >= 0 ? '+' : ''}${f$(save)}/mo** |
| Annual savings | — | — | **${f$(annSav)}/yr** |
| Closing costs | — | ~${f$(effCosts)} | ${costsNote} |
| **Breakeven** | — | — | **${beM ? `${Math.ceil(beM)} months (${beYrs!.toFixed(1)} yrs)` : 'N/A — payment rises'}** |

---

## 🎯 ${vTitle}

${vBody}

**5-year net:** ${net5 >= 0 ? `✅ +${f$(net5)} ahead` : `⚠️ ${f$(Math.abs(net5))} short of breakeven — not there yet`}
**10-year net:** ${net10 >= 0 ? `✅ +${f$(net10)} ahead` : `⚠️ ${f$(Math.abs(net10))} — still not recovered`}
**Lifetime interest saved (${(monthsLeft / 12).toFixed(0)} yrs remaining):** **${f$(lifeSave)}** after costs
${resetWarning}

---

## 📊 Refi Now vs Wait — Full Scenario Table

| Rate | Monthly P&I | Saved vs Current | Breakeven | Lifetime Savings |
|--|--|--|--|--|
| ${fPct(currentRate)} *(current)* | ${fD(curPI)} | — | — | — |
| **${fPct(effNewRate)} *(your target)*** | **${fD(newPI)}** | **${f$(save)}/mo** | **${beM ? Math.ceil(beM) + ' mo' : 'N/A'}** | **${f$(lifeSave)}** |
| ${fPct(wr1)} *(if you wait 0.5% more)* | ${fD(piW1)} | ${f$(svW1)}/mo | ${beW1 ? Math.ceil(beW1) + ' mo' : 'N/A'} | ${f$(totIntCur - (piW1 * monthsLeft - balance) - effCosts)} |
| ${fPct(wr2)} *(stretch — wait 1% more)* | ${fD(piW2)} | ${f$(svW2)}/mo | ${beW2 ? Math.ceil(beW2) + ' mo' : 'N/A'} | ${f$(totIntCur - (piW2 * monthsLeft - balance) - effCosts)} |

${extraMoW1 > 0 ? `> 💡 **Refi now vs wait for ${fPct(wr1)}:** Waiting earns you an extra **${f$(extraMoW1)}/mo** more savings. But every month at ${fPct(currentRate)} costs **${f$(save)}** in lost opportunity. Waiting only pays back if ${fPct(wr1)} arrives within **${moToRecoverW1} months**. After that, refi-now wins.` : ''}

---

## 🔁 Should You Shorten to 20 Years?

| | 30yr at ${fPct(effNewRate)} | 20yr at ${fPct(effNewRate)} | Difference |
|--|--|--|--|
| Monthly P&I | ${fD(newPI)} | ${fD(pi20)} | +${f$(pi20 - newPI)}/mo |
| Total interest | ${f$(totIntNew)} | ${f$(int20)} | **Save ${f$(int20saved)}** |

${pi20 < curPI ? `> ✅ **Hidden win:** 20yr payment (${fD(pi20)}) is *still lower* than your current payment (${fD(curPI)}). You'd pay off 10 years faster and save ${f$(int20saved)} in interest — for *less* than you pay today.` : `> ⚠️ 20yr payment (${fD(pi20)}) is higher than current (${fD(curPI)}) — budget accordingly.`}
${rateWatchSection}${mipNote}${armNote}${cashOutNote}${lenderSection}`;

        // ── UNIFIED 4-CHIP SET: no-cost · strike-or-deeper · trigger-or-deeper · 20yr ──
        const noCostRefiRate = parseFloat((effNewRate + 0.25).toFixed(2));
        const deeperRate = parseFloat((effNewRate - 0.5).toFixed(2));
        const thinSpread = rateDrop < 0.5;

        // Chip 2: strike rate when not yet reached; deeper drop when already past it
        const chip2 = effNewRate > strikeRate
            ? {
                label: `Strike rate ${fPct(strikeRate)} — industry trigger point`,
                seed: `Refi from ${fPct(currentRate)} to ${fPct(strikeRate)} on ${f$(balance)} — full cost and breakeven`,
                paramOverrides: { newRatePct: strikeRate, currentBalance: balance, currentRatePct: currentRate },
                changedKeys: ['newRatePct'],
            }
            : {
                label: `Rates drop to ${fPct(deeperRate)} — how much more do I save?`,
                seed: `Refi from ${fPct(currentRate)} to ${fPct(deeperRate)} on ${f$(balance)}`,
                paramOverrides: { newRatePct: deeperRate, currentBalance: balance, currentRatePct: currentRate },
                changedKeys: ['newRatePct'],
            };

        // Chip 3: trigger rate (thin spread) or sell-in-3yr scenario (good spread, already a clear win)
        const chip3rate = trig3yr ?? parseFloat((currentRate - 1).toFixed(2));
        const chip3 = thinSpread
            ? {
                label: `Trigger rate ${fPct(chip3rate)} — 3yr breakeven`,
                seed: `Refi ${f$(balance)} at ${fPct(currentRate)} to ${fPct(chip3rate)} — full breakeven analysis`,
                paramOverrides: { newRatePct: chip3rate, currentBalance: balance, currentRatePct: currentRate },
                changedKeys: ['newRatePct'],
            }
            : {
                label: `If I sell in 3 years — does this refi still pay off?`,
                seed: `If I refi ${f$(balance)} from ${fPct(currentRate)} to ${fPct(effNewRate)} and sell in 3 years, am I ahead or behind?`,
                paramOverrides: {
                    earlySaleBalance:      balance,
                    earlySaleCurrentRate:  currentRate,
                    earlySaleNewRate:      effNewRate,
                    earlySaleClosingCosts: effCosts,
                    earlySaleYears:        3,
                } as Record<string, number>,
                changedKeys: ['earlySaleYears'],
            };

        // Chip 4: 20yr vs 30yr comparison — dedicated card
        const rate20yrEst = parseFloat((effNewRate - 0.25).toFixed(2));
        const chip4 = {
            label: `Compare 20yr at ${fPct(rate20yrEst)} vs 30yr at ${fPct(effNewRate)} — which wins?`,
            seed: `Compare 20-year refi at ${fPct(rate20yrEst)} vs 30-year refi at ${fPct(effNewRate)} on ${f$(balance)}`,
            paramOverrides: { rate20yr: rate20yrEst, rate30yr: parseFloat(effNewRate.toFixed(2)), balance20vs30: balance },
            changedKeys: ['rate20yr', 'rate30yr'],
        };

        // Only show no-cost chip when the no-cost rate is still below the current rate
        const showNoCostChip = noCostRefiRate < currentRate;
        let refiChips: Array<{ label: string; seed: string; paramOverrides?: Record<string, any>; changedKeys?: string[] }> = [
            ...(showNoCostChip ? [{
                label: `No-cost at ${fPct(noCostRefiRate)} — lender covers closing costs`,
                seed: `No-cost refi on ${f$(balance)} from ${fPct(currentRate)} to ${fPct(noCostRefiRate)} — lender covers all closing costs`,
                paramOverrides: { newRatePct: noCostRefiRate, currentBalance: balance, currentRatePct: currentRate, closingCosts: 0 },
                changedKeys: ['newRatePct', 'closingCosts'],
            }] : []),
            chip2,
            chip3,
            chip4,
        ];

        // Override chips for special refi types
        if (isFHAtoConv) {
            refiChips = [
                { label: `FHA→conventional at same rate — MIP removal alone worth it?`, seed: `If I refi my FHA to conventional at ${fPct(effNewRate)} on ${f$(balance)} just to remove MIP, what's the breakeven?` },
                { label: `How long until 20% equity at current paydown speed?`, seed: `At ${fPct(currentRate)} on ${f$(balance)}, how many months until I hit 20% equity? How does refi speed this up?` },
                { label: `What's my total MIP cost if I stay FHA vs refi now?`, seed: `Show me total MIP cost remaining on my ${f$(balance)} FHA loan at ${fPct(currentRate)} vs refinancing to conventional at ${fPct(effNewRate)}` },
            ];
        } else if (isARMtoFixed) {
            refiChips = [
                { label: "ARM worst-case payment at lifetime cap — show me the number", seed: `My ARM balance is ${f$(balance)} at ${fPct(currentRate)} — what's my worst-case payment at the lifetime cap?` },
                { label: "Lock to fixed now vs ride the ARM — breakeven comparison", seed: `Should I lock my ${f$(balance)} ARM at ${fPct(currentRate)} to a 30yr fixed at ${fPct(effNewRate)} or ride it out? Show the math.` },
                { label: "What if my ARM resets to 2% higher — payment shock analysis", seed: `My ARM is ${f$(balance)} at ${fPct(currentRate)} — show me payment shock if it resets to ${fPct(currentRate + 2)}` },
            ];
        } else if (isCashOut) {
            refiChips = [
                { label: "HELOC vs cash-out refi — total cost comparison", seed: `Compare HELOC vs cash-out refi on my ${f$(balance)} home at ${fPct(currentRate)} — I need to pull out $100k` },
                { label: "Cash-out refi — what rate makes it worth the reset?", seed: `If I do a cash-out refi on my ${f$(balance)} from ${fPct(currentRate)} to ${fPct(effNewRate)}, what's the true cost of the equity I'm pulling out?` },
                { label: "Tax deductibility of cash-out — what's actually deductible?", seed: `I'm doing a cash-out refi on my ${f$(balance)} home — is the new mortgage interest tax deductible? What are the rules?` },
            ];
        }

        // HR-MEMORY:WRITE — store refi result so follow-ups stay on refi path
        if (supabase && (memoryThreadId || chatId)) {
            const resolvedThreadId = memoryThreadId ?? await (async () => {
                // look up memory_thread_id from chat_threads table using chatId
                const { data } = await supabase
                    .from('chat_threads')
                    .select('memory_thread_id')
                    .eq('chat_id', chatId)
                    .single();
                return data?.memory_thread_id ?? null;
            })();
            if (resolvedThreadId) try {
                await supabase.from('memory_items').insert({
                    memory_thread_id: resolvedThreadId,
                    kind: 'scenario_snapshot',
                    content_text: `Refi: ${f$(balance)} balance, ${fPct(currentRate)} → ${fPct(effNewRate)}. Monthly savings: ${f$(Math.round(save))}. Breakeven: ${beM ? Math.round(beM) + ' months' : 'n/a'}.`,
                    content_json: {
                        loan_amount: balance,
                        current_rate_pct: currentRate,
                        rate_used_pct: effNewRate,
                        term_years: Math.round(monthsLeft / 12),
                        monthly_payment: Math.round(newPI),
                        monthly_savings: Math.round(save),
                        break_even_months: beM ? Math.round(beM) : null,
                        question,
                        model: 'refi_advisor_v2',
                        userId,
                        chat_id: chatId,
                    },
                    tags: ['scenario', 'auto'],
                });
            } catch (memErr: any) {
                console.warn('[Refi] memory_items write failed:', memErr?.message);
            }
        }

        return noStore({
            ok: true, memory_thread_id: memoryThreadId, route: "answers", intent, path, tag,
            generatedAt, usedFRED, usedTavily, fred, topSources,
            grok: {
                answer: md,
                next_step: "",
                follow_up: refiChips[0].label,
                follow_up_chips: refiChips,
                confidence: `1.00 (refi calc: ${f$(balance)} @ ${fPct(currentRate)}→${fPct(effNewRate)}, ${(monthsLeft / 12).toFixed(0)}yr remaining, costs=${f$(effCosts)})`,
            },
            refiSlider: {
                balance,
                currentRate,
                newRate: effNewRate,
                termMonths: monthsLeft,
                closingCosts: effCosts,
            },
            lenderChecklist: (() => {
                const r = effNewRate / 100 / 12;
                const n = monthsLeft;
                const pow = Math.pow(1 + r, n);
                const newPI = r > 0 ? (balance * r * pow) / (pow - 1) : balance / n;
                return {
                    loanType: 'conventional' as const,
                    price: Math.round(balance * 1.25),
                    loanAmount: balance,
                    ltv: 0.75,
                    marketRate: effNewRate,
                    monthlyPITI: Math.round(newPI),
                    termYears: Math.round(monthsLeft / 12),
                    isInvestment: false,
                };
            })(),
            debug: {
                bypass: "refi_advisor_v2",
                refiType, verdict: vTitle,
                parsed: { balance, currentRate, newRate: effNewRate, monthsLeft, yearsIn, closingCosts: effCosts, monthlySavings: Math.round(save), beMonths: beM ? Math.round(beM) : null, triggerRates: { yr2: trig2yr, yr3: trig3yr, yr5: trig5yr } },
            },
            message: md, answerMarkdown: buildAnswerMarkdown(md),
            followUp: null, follow_up_chips: [],
        });

    }
    // HR-MEMORY:GROK-CALL
    // Inject prior conversation context + current user question into Grok

    // Generates guideline/explanation chips that stay in the UW oracle path — no calc seeds, no dollar amounts.
    function generateUWChips(q: string): Array<{ label: string; seed: string }> {
        const isMIP = /\bmip\b|ufmip|mortgage insurance premium/i.test(q);
        const isFHA = /\bfha\b/i.test(q);
        const isConv = /conventional|fannie|freddie/i.test(q);
        const isVA = /\bva\b|veteran|certificate of eligibility|\bcoe\b|entitlement|funding fee/i.test(q);
        const isUSDA = /\busda\b|rural/i.test(q);
        const isDSCR = /\bdscr\b|debt service/i.test(q);
        const isDTI = /\bdti\b|debt.to.income/i.test(q);
        const isCredit = /credit score|fico/i.test(q);
        const isDown = /down payment|ltv|loan.to.value/i.test(q);
        const isReserve = /reserve|months/i.test(q);
        const isGift = /gift fund/i.test(q);
        const isSelfEmp = /self.employ/i.test(q);
        const isJumbo = /jumbo|non.?conforming/i.test(q);
        const isPMI = /\bpmi\b/i.test(q);

        // Sub-topic detection — avoids repeating the chip that was just answered
        const isPMICancel = /cancel|remov|drop|stop|go away|78|80/i.test(q) && isPMI;
        const isConvDTI = isDTI && isConv;
        const isConvGift = isGift && isConv;
        const isFHARemove = /remov|cancel|get rid|eliminate/i.test(q) && isMIP;
        const isFHACredit = isCredit && isFHA;
        const isFHAvsConv = isFHA && isConv;

        if (isFHAvsConv) {
            return [
                { label: "What are FHA vs conventional loan limits in 2026?", seed: "Ask Underwriting: what are the FHA and conventional conforming loan limits for 2026?" },
                { label: "How does self-employed income differ for FHA vs conventional?", seed: "Ask Underwriting: how does self-employed income documentation differ between FHA and conventional?" },
                { label: "FHA gift funds vs conventional — which is more flexible?", seed: "Ask Underwriting: compare gift fund rules for FHA vs conventional loans" },
            ];
        }
        if (isPMICancel) {
            return [
                { label: "Can home appreciation help remove PMI early?", seed: "Ask Underwriting: can a new appraisal help me remove PMI before 78% LTV on a conventional loan?" },
                { label: "How does PMI cost compare to FHA MIP long-term?", seed: "Ask Underwriting: how does the total cost of conventional PMI compare to FHA MIP over time?" },
                { label: "What is lender-paid PMI and when does it make sense?", seed: "Ask Underwriting: what is lender-paid PMI and how does it compare to borrower-paid PMI?" },
            ];
        }
        if (isConvDTI) {
            return [
                { label: "What compensating factors allow DTI above 45%?", seed: "Ask Underwriting: what compensating factors allow a conventional loan to be approved above 45% DTI?" },
                { label: "How is DTI calculated for self-employed borrowers?", seed: "Ask Underwriting: how is DTI calculated differently for self-employed borrowers on conventional loans?" },
                { label: "How do FHA and VA DTI limits compare to conventional?", seed: "Ask Underwriting: compare DTI limits across FHA, VA, USDA, and conventional loans" },
            ];
        }
        if (isConvGift) {
            return [
                { label: "Can gift funds be used for investment properties?", seed: "Ask Underwriting: are gift funds allowed for investment property down payments on any loan type?" },
                { label: "What documentation is required for gift funds?", seed: "Ask Underwriting: what documentation is required to use gift funds for a conventional mortgage?" },
                { label: "How do FHA gift fund rules differ from conventional?", seed: "Ask Underwriting: how do FHA gift fund rules compare to conventional — which is more flexible?" },
            ];
        }
        if (isMIP || (isFHA && !isConv)) {
            if (isFHARemove) {
                return [
                    { label: "Can I refinance out of FHA MIP into conventional?", seed: "Ask Underwriting: when can I refinance from FHA to conventional to eliminate MIP permanently?" },
                    { label: "What LTV do I need to remove FHA MIP?", seed: "Ask Underwriting: what LTV is required to remove MIP on an FHA loan originated after 2013?" },
                    { label: "How does FHA MIP cost compare to conventional PMI?", seed: "Ask Underwriting: compare the total cost of FHA MIP vs conventional PMI over 5 and 10 years" },
                ];
            }
            if (isFHACredit) {
                return [
                    { label: "What happens to my FHA rate at 580 vs 620 vs 640?", seed: "Ask Underwriting: how does credit score affect FHA mortgage rate and terms at 580 vs 620 vs 640?" },
                    { label: "FHA after bankruptcy — what are the waiting periods?", seed: "Ask Underwriting: what are the FHA waiting period requirements after bankruptcy or foreclosure?" },
                    { label: "What is manual underwriting and when is it required?", seed: "Ask Underwriting: what is manual underwriting and when does FHA require it instead of AUS?" },
                ];
            }
            return [
                { label: "How does FHA MIP compare to conventional PMI?", seed: "Ask Underwriting: how does FHA MIP compare to conventional PMI — rates, duration, and cancellation?" },
                { label: "What credit score do I need for FHA?", seed: "Ask Underwriting: what credit score is required for FHA and how does it affect my down payment?" },
                { label: "When can I remove FHA MIP?", seed: "Ask Underwriting: when and how can I remove MIP on an FHA loan — what changed after 2013?" },
            ];
        }
        if (isPMI || (isConv && !isFHA)) {
            return [
                { label: "Can appreciation help me remove PMI early?", seed: "Ask Underwriting: can a new appraisal help me cancel PMI before 78% LTV on a conventional loan?" },
                { label: "What DTI limits apply to conventional loans?", seed: "Ask Underwriting: what are the DTI limits for conventional loans with Fannie Mae and Freddie Mac?" },
                { label: "How do conventional gift fund rules work?", seed: "Ask Underwriting: what are the gift fund rules for conventional loans?" },
            ];
        }
        if (isVA) {
            return [
                { label: "What is the VA funding fee — who is exempt?", seed: "Ask Underwriting: explain the VA funding fee — rates, exemptions, and when it applies" },
                { label: "How does VA entitlement work?", seed: "Ask Underwriting: how does VA loan entitlement work for first and subsequent use?" },
                { label: "VA vs conventional — key underwriting differences", seed: "Ask Underwriting: what are the main underwriting differences between VA and conventional loans?" },
            ];
        }
        if (isUSDA) {
            return [
                { label: "How do USDA income limits work?", seed: "Ask Underwriting: how are USDA income limits calculated and where do I check eligibility?" },
                { label: "USDA vs FHA — which has lower total costs?", seed: "Ask Underwriting: compare USDA and FHA loan costs, fees, and eligibility requirements" },
                { label: "What properties qualify for USDA?", seed: "Ask Underwriting: how do I determine if a property is eligible for a USDA loan?" },
            ];
        }
        if (isDSCR) {
            return [
                { label: "What DSCR ratio do most lenders require?", seed: "Ask Underwriting: what DSCR ratio is required and how does it change approval terms?" },
                { label: "How is DSCR calculated — what counts as income?", seed: "Ask Underwriting: how is DSCR calculated and what income counts toward the ratio?" },
                { label: "DSCR vs conventional investment loan — key differences", seed: "Ask Underwriting: what are the underwriting differences between DSCR and conventional investment loans?" },
            ];
        }
        if (isDTI) {
            return [
                { label: "How do FHA and conventional DTI limits compare?", seed: "Ask Underwriting: compare DTI limits for FHA, conventional, VA, and USDA loans" },
                { label: "What debts count in DTI calculation?", seed: "Ask Underwriting: what debts are included in DTI calculation for mortgage underwriting?" },
                { label: "Can compensating factors override DTI limits?", seed: "Ask Underwriting: what compensating factors can allow higher DTI approval for conventional loans?" },
            ];
        }
        if (isCredit) {
            return [
                { label: "How does credit score affect rate across loan types?", seed: "Ask Underwriting: how does credit score affect mortgage rate and terms across FHA, conventional, and VA?" },
                { label: "What is manual underwriting and when is it used?", seed: "Ask Underwriting: what is manual underwriting and when does a lender require it?" },
                { label: "Credit score minimums by loan type", seed: "Ask Underwriting: what are the minimum credit score requirements for FHA, conventional, VA, and USDA?" },
            ];
        }
        if (isJumbo) {
            return [
                { label: "What are jumbo loan reserve requirements?", seed: "Ask Underwriting: what are the reserve and documentation requirements for jumbo loans?" },
                { label: "How do jumbo DTI limits compare to conforming?", seed: "Ask Underwriting: how do jumbo loan DTI and credit score requirements differ from conforming?" },
                { label: "What is the jumbo loan limit in 2026?", seed: "Ask Underwriting: what are the conforming and jumbo loan limits for 2026?" },
            ];
        }
        if (isSelfEmp) {
            return [
                { label: "How is self-employed income calculated for mortgage?", seed: "Ask Underwriting: how do lenders calculate qualifying income for self-employed borrowers?" },
                { label: "What documents does a self-employed borrower need?", seed: "Ask Underwriting: what documentation is required for self-employed mortgage applicants?" },
                { label: "Can I use bank statements instead of tax returns?", seed: "Ask Underwriting: how does bank statement loan underwriting work for self-employed borrowers?" },
            ];
        }
        if (isReserve) {
            return [
                { label: "How do reserve requirements differ for investment vs primary?", seed: "Ask Underwriting: how do reserve requirements differ for primary, second home, and investment properties?" },
                { label: "What assets count as reserves?", seed: "Ask Underwriting: what types of assets count as mortgage reserves in underwriting?" },
                { label: "Do DSCR loans require more reserves than conventional?", seed: "Ask Underwriting: compare reserve requirements for DSCR vs conventional investment loans" },
            ];
        }
        if (isGift) {
            return [
                { label: "Can gift funds be used for investment properties?", seed: "Ask Underwriting: are gift funds allowed for investment property down payments?" },
                { label: "What documentation is needed for gift funds?", seed: "Ask Underwriting: what documentation is required to use gift funds for a mortgage down payment?" },
                { label: "Gift fund rules — FHA vs conventional vs VA", seed: "Ask Underwriting: compare gift fund rules across FHA, conventional, VA, and USDA loans" },
            ];
        }
        // Generic — broad guideline questions, no numbers, no calc seeds
        return [
            { label: "FHA vs conventional — key underwriting differences", seed: "Ask Underwriting: what are the main underwriting differences between FHA and conventional loans?" },
            { label: "What credit score minimums apply by loan type?", seed: "Ask Underwriting: what are the minimum credit score requirements for FHA, conventional, VA, and USDA?" },
            { label: "How do reserve requirements work for investment properties?", seed: "Ask Underwriting: what are the reserve requirements for investment property and DSCR loans?" },
        ];
    }

    // ========== UNDERWRITING GUIDELINES BYPASS ==========
    // Must run FIRST — before all calculator bypasses
    // Detects pure info/guideline questions and answers them directly from the database
    // Key distinction: "What credit score do I need?" (info) vs "FHA loan on $300k" (calculation)

    function isUnderwritingGuidelineQuestion(q: string): boolean {
        const text = q.toLowerCase();

        // Pure info signals — these phrases mean the user wants a guideline answer, not a calculation
        const infoSignals = [
            /^ask\s+underwriting[:\-]/i,
            /\b(?:explain|what\s+is|what\s+are|how\s+does|how\s+do|tell\s+me\s+about|walk\s+me\s+through)\b.{0,60}\b(?:mip|ufmip|fha|pmi|dti|ltv|dscr|va|usda|guideline|underwriting|mortgage\s+insurance)/i,
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
            /\b(?:explain|what\s+is|what\s+are|what\s+does|how\s+does|how\s+do|how\s+long|tell\s+me\s+about|walk\s+me\s+through|difference\s+between)\b.{0,80}\b(?:respa|trid|arm|heloc|escrow|amortization|closing\s+costs?|closing\s+take|closing\s+process|title\s+insurance|apr|preapproval|pre.approval|jumbo|buydown|buy.down|refinanc|mortgage|points?|origination|rate\s+lock|appraisal|underwriting|down\s+payment|equity|second\s+lien|piggyback|subordinat|forbearance|modification|assumption|deed|lien|hardship|hud|fannie|freddie|ginnie|conforming|non.qm|bank\s+statement|stated\s+income|asset\s+depletion|reserve)/i,
        ];

        // If any info signal matches, it's a guideline question
        // Negative signals — check FIRST before any positive match
        // Questions with a dollar amount + FHA/price context are calculations, not guidelines
        const hasDollarAmount = /\$\s*[\d,]+/i.test(q);
        if (hasDollarAmount && !/^ask\s+underwriting[:\-]/i.test(q)) return false;

        // "use my scenario", "run my numbers", "calculate for me" = calculation intent
        const isCalculationIntent = /use my scenario|run.{0,20}(?:numbers?|scenario|calc)|calculate.{0,20}for me|show me.{0,20}(?:fha|payment|cost)|what.{0,10}(?:would|will).{0,20}(?:payment|piti|cost)|can you.{0,20}(?:calc|run|show|use)|(?:use|apply|run).{0,20}(?:my|this|same|that).{0,20}(?:scenario|situation|numbers?|info|details?)|(?:use|apply|run|show|calc).{0,10}(?:for|with).{0,5}fha\b|fha.{0,20}(?:version|option|instead)|my scenario.{0,20}fha|can.{0,10}fha/i.test(q);
        if (isCalculationIntent) return false;

        // Live market/rate questions — always need FRED, never route to UW guidelines
        const isLiveRateQuestion = /(?:what|where|how).{0,30}(?:mortgage|30.?year|15.?year|interest).{0,20}rates?.{0,30}(?:today|now|this week|right now|current|lately|these days)/i.test(q)
            || /rates?.{0,20}(?:this week|today|right now|currently|as of)/i.test(q)
            || /(?:current|today'?s?|latest|live).{0,20}(?:mortgage|interest).{0,20}rates?/i.test(q);
        if (isLiveRateQuestion) return false;

        // About HomeRates.ai and UW starter — never route to UW bypass
        if (/homerates|about homerates|who built|who created|who made|founder of|this site|this app|this platform|makes.{0,20}different|open the homerates underwriting/i.test(q)) return false;

        // Income/affordability qualification questions — always route to affordability/qualify module
        if (/how\s+much\s+(?:income|money|salary|do\s+i\s+need)|what\s+income|what\s+salary|income\s+(?:do\s+i\s+need|required|needed|to\s+qualify)|how\s+much\s+(?:can\s+i\s+afford|home\s+can)/i.test(q)) return false;

        if (infoSignals.some(pattern => pattern.test(q))) return true;

        return false;
    }
    // ── SCENARIO COMPARISON CARD ──────────────────────────────────────────────
    // Exempt when the question is specifically asking FOR a buydown (2/1, 1/0, 3/2/1) — that
    // should go to the buydown analyzer, not the side-by-side comparison card.
    const _scenarioTool = !isBuydownQuestion(question) ? isScenarioComparisonQuestion(question) : null;
    if (_scenarioTool) {
        // Extract numbers from question (best-effort — card has defaults if not found)
        const _scPriceM = question.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[mM]\b/);
        const _scPriceK = question.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[kK]\b/);
        const _scPricePl = question.match(/\$\s*([\d,]{5,})/);
        const _scPrice = _scPriceM ? parseFloat(_scPriceM[1].replace(/,/g, '')) * 1_000_000
            : _scPriceK ? parseFloat(_scPriceK[1].replace(/,/g, '')) * 1_000
            : _scPricePl ? parseFloat(_scPricePl[1].replace(/,/g, ''))
            : undefined;
        const _scRateM = question.match(/(\d+\.?\d*)\s*%/);
        const _scRate = _scRateM ? parseFloat(_scRateM[1]) : undefined;
        const _scRentM = question.match(/rent(?:ing)?\s*(?:is|at|of|for)?\s*\$?\s*([\d,]+)/i);
        const _scRent = _scRentM ? parseFloat(_scRentM[1].replace(/,/g, '')) : undefined;
        const _scCreditM = question.match(/(?:seller\s*credit|credit|concession)\s*(?:of|is)?\s*\$?\s*([\d,]+)/i);
        const _scCredit = _scCreditM ? parseFloat(_scCreditM[1].replace(/,/g, '')) : undefined;
        const compCard = buildScenarioComparisonCard({
            tool: _scenarioTool,
            price: _scPrice,
            rate: _scRate && _scRate >= 3 && _scRate <= 12 ? _scRate : undefined,
            rent: _scRent,
            credit: _scCredit,
        });
        return noStore({
            ok: true,
            memory_thread_id: memoryThreadId,
            chat_id: chatId,
            project_id: projectId,
            chat_thread_id: null,
            route: 'answers',
            intent,
            path: 'scenario_comparison',
            tag,
            generatedAt,
            usedFRED: false,
            usedTavily: false,
            fred: { tenYearYield: null, mort30Avg: null, spread: null, asOf: null },
            topSources: [],
            // Top-level fields so chat/page.tsx render can access without scenarioToApiResponse
            answer: compCard.answer,
            message: compCard.answer,
            answerMarkdown: compCard.answer,
            follow_up_chips: compCard.follow_up_chips,
            scenarioComparisonCard: compCard.scenarioComparisonCard,
            grok: {
                answer: compCard.answer,
                next_step: compCard.next_step,
                follow_up: compCard.follow_up,
                follow_up_chips: compCard.follow_up_chips,
                confidence: compCard.confidence,
                scenarioComparisonCard: compCard.scenarioComparisonCard,
            },
            debug: {
                requestedModel: 'scenario-comparison',
                servedModel: 'scenario-comparison',
                promptChars: question.length,
                elapsedMs: 0,
                requestId: 'sc-' + Date.now(),
                parseMode: 'direct',
                repaired: false,
            },
        });
    }

    // ── DEEP ANALYSIS: residential comparison narrative ────────────────────────
    // [deep-analysis] seeds from ScenarioComparisonCard "Run deeper AI analysis" button.
    // Same /api/answers route as the card — returns a plain narrative (no card, no GrokCard).
    // FRED data (fred.mort30Avg) is available here; was fetched above before this intercept.
    const _isDeepAnalysis = /^\[deep-analysis\]/i.test(question);
    if (_isDeepAnalysis) {
        const _daMsg = question.replace(/^\[deep-analysis\]\s*/i, '');
        const _daRate0 = fred.mort30Avg ?? 7.0;
        const _fD = (n: number) => '$' + Math.round(n).toLocaleString();
        const _fkD = (n: number) => n >= 10_000 ? '$' + Math.round(n / 1_000) + 'k' : _fD(n);

        // Price extractor: prefer "on a $X home" pattern, then largest sensible amount
        function _daExtractPrice(msg: string, fallback: number): number {
            const m0 = msg.match(/on\s+(?:a\s+)?\$\s*([\d,]+(?:\.\d+)?)\s*([kKmM]?)\s*home/i);
            if (m0) { const r = parseFloat(m0[1].replace(/,/g,'')); const s = m0[2].toLowerCase(); return s==='m'?r*1e6:s==='k'?r*1e3:r; }
            const all: number[] = []; const re0 = /\$\s*([\d,]+(?:\.\d+)?)\s*([kKmM]?)/g; let m1: RegExpExecArray|null;
            while ((m1=re0.exec(msg))!==null){const r=parseFloat(m1[1].replace(/,/g,''));const s=m1[2].toLowerCase();const v=s==='m'?r*1e6:s==='k'?r*1e3:r;if(v>=150_000&&v<=5_000_000)all.push(v);}
            return all.length ? Math.max(...all) : fallback;
        }
        function _daExtractRate(msg: string, fallback: number): number {
            const ps = msg.match(/(\d+\.?\d*)\s*%/g);
            if (ps) { for (const p of ps) { const v=parseFloat(p); if(v>=3&&v<=12)return v; } }
            return fallback;
        }

        // ── 5% vs 20% down payment ──────────────────────────────────────────
        const _daIsDP = /5\s*%?\s*(?:vs|versus|or)\s*20\s*%?.*down|down\s*payment\s*compar|5.*vs.*20.*down|20.*vs.*5.*down|walk.*5.*20.*down/i.test(_daMsg);
        if (_daIsDP) {
            const _p = _daExtractPrice(_daMsg, 650_000);
            const _rt = _daExtractRate(_daMsg, _daRate0);
            const _lo = calculateMortgage({ price: _p, downPaymentPct: 5, rate: _rt, termYears: 30 });
            const _hi = calculateMortgage({ price: _p, downPaymentPct: 20, rate: _rt, termYears: 30 });
            const _pmiMo = (_lo.loanAmount * 0.0055) / 12;
            const _cash = _hi.downPayment - _lo.downPayment;
            let _bal = _lo.loanAmount; const _rr = _rt/100/12; let _pmiN = 0;
            while (_bal > _p*0.80 && _pmiN < 360) { _bal -= (_lo.monthlyPI - _bal*_rr); _pmiN++; }
            const _pmi7 = Math.min(_pmiN, 84) * _pmiMo;
            const _inv7 = _cash * (Math.pow(1.07, 7) - 1);
            const _totLo = _lo.monthlyPI + _pmiMo;
            const _diff = _totLo - _hi.monthlyPI;
            const _daPr = `You are a helpful, plain-spoken mortgage advisor. Return valid JSON: {"narrative":"...markdown..."}

Write a clear, visually rich residential down payment comparison. Use markdown with emoji icons on every stat line. Do NOT mention DSCR, vacancy, cap rate, or investment metrics — this is a primary residence.

Use EXACTLY these numbers (do not recalculate):
- Purchase price: ${_fD(_p)} at ${_rt}%
- **5% down**: ${_fD(_lo.downPayment)} down → ${_fD(_lo.loanAmount)} loan → ${_fD(_lo.monthlyPI)}/mo P&I + ${_fD(_pmiMo)}/mo PMI (drops ~month ${_pmiN}) = **${_fD(_totLo)}/mo total**
- **20% down**: ${_fD(_hi.downPayment)} down → ${_fD(_hi.loanAmount)} loan → **${_fD(_hi.monthlyPI)}/mo**, no PMI
- Monthly difference: ${_fD(_diff)}/mo more with 5% down
- Cash kept with 5% down: ${_fD(_cash)}
- ${_fD(_cash)} invested at 7%/yr for 7 years grows by: ${_fkD(_inv7)}
- Total PMI paid over 7 years: ${_fkD(_pmi7)}

Required format (use these section headers and emojis):
## 💵 5% vs 20% Down — ${_fD(_p)} at ${_rt}%
[1-sentence opener framing the core trade-off]

**💰 5% Down — ${_fD(_lo.downPayment)} upfront**
- 🏦 Loan: ${_fD(_lo.loanAmount)}
- 📅 Monthly P&I: ${_fD(_lo.monthlyPI)}/mo
- 🛡️ PMI: ${_fD(_pmiMo)}/mo (drops ~month ${_pmiN})
- **Total: ${_fD(_totLo)}/mo**

**💰 20% Down — ${_fD(_hi.downPayment)} upfront**
- 🏦 Loan: ${_fD(_hi.loanAmount)}
- 📅 Monthly P&I: ${_fD(_hi.monthlyPI)}/mo
- ✅ No PMI
- **Total: ${_fD(_hi.monthlyPI)}/mo**

**📊 The Numbers**
- ⬆️ Monthly cost difference: ${_fD(_diff)}/mo more with 5% down
- 💰 Cash you keep: ${_fD(_cash)}
- 📈 That ${_fD(_cash)} invested at 7%/7yr: +${_fkD(_inv7)} gain
- 🛑 Total PMI over 7 years: ${_fkD(_pmi7)}

**🎯 Break-Even & Recommendation**
[2-3 sentence analysis: when does 5% down pay off vs 20% down? Include the break-even point.]

**❓ Questions to Consider**
- [question 1 about their financial situation]
- [question 2 about their goals]`;
            const _daR = await callGrokOnce(_daPr, { maxTokens: 1200 });
            const _nar = (typeof _daR.grokFinal?.narrative === 'string' && _daR.grokFinal.narrative.length > 50)
                ? _daR.grokFinal.narrative
                : `**5% vs 20% Down — ${_fD(_p)} at ${_rt}%**\n\n- 5% down: ${_fD(_totLo)}/mo (incl. PMI) · Down: ${_fD(_lo.downPayment)}\n- 20% down: ${_fD(_hi.monthlyPI)}/mo · Down: ${_fD(_hi.downPayment)}\n- Monthly diff: ${_fD(_diff)}/mo · PMI drops month ${_pmiN}\n- ${_fD(_cash)} invested 7%/7yr → +${_fkD(_inv7)} vs PMI cost ${_fkD(_pmi7)}`;
            return noStore({ ok: true, path: 'down_payment_analysis', route: 'answers', answer: _nar, message: _nar, answerMarkdown: _nar, scenarioComparisonCard: null, grok: { answer: _nar, next_step: null, follow_up: null, follow_up_chips: [], confidence: 'high', scenarioComparisonCard: null }, fred: { tenYearYield: fred.tenYearYield, mort30Avg: fred.mort30Avg, spread: fred.spread, asOf: fred.asOf }, usedFRED: true, debug: { requestedModel: 'deep-analysis-dp', servedModel: _daR.debug.servedModel ?? 'grok', promptChars: _daMsg.length, elapsedMs: _daR.debug.elapsedMs, requestId: 'da-dp-'+Date.now(), parseMode: 'direct', repaired: false } });
        }

        // ── 15 vs 30 year term ──────────────────────────────────────────────
        const _daIsTerm = /15\s*(?:yr|year).*(?:vs|versus|or).*30\s*(?:yr|year)|30\s*(?:yr|year).*(?:vs|versus|or).*15\s*(?:yr|year)|walk.*15.*30.*year|15.*30.*compar/i.test(_daMsg);
        if (!_daIsDP && _daIsTerm) {
            const _p2 = _daExtractPrice(_daMsg, 500_000);
            const _rt2 = _daExtractRate(_daMsg, _daRate0);
            const _dpM2 = _daMsg.match(/(\d+)\s*%\s*down/i);
            const _dp2 = _dpM2 ? Math.min(Math.max(parseFloat(_dpM2[1]),3),50) : 20;
            const _t30 = calculateMortgage({ price: _p2, downPaymentPct: _dp2, rate: _rt2, termYears: 30 });
            const _t15 = calculateMortgage({ price: _p2, downPaymentPct: _dp2, rate: _rt2, termYears: 15 });
            const _moDiff2 = _t15.monthlyPI - _t30.monthlyPI;
            const _intSaved = _t30.totalInterest - _t15.totalInterest;
            const _daPr2 = `You are a helpful mortgage advisor. Return valid JSON: {"narrative":"...markdown..."}

Write a clear, visually rich residential 15-year vs 30-year mortgage comparison. Use markdown with emoji icons on every stat line. Do NOT mention DSCR or investment metrics — this is a primary residence.

Use EXACTLY these numbers (do not recalculate):
- Purchase price: ${_fD(_p2)} at ${_rt2}%, ${_dp2}% down, loan: ${_fD(_t30.loanAmount)}
- 30-year: ${_fD(_t30.monthlyPI)}/mo P&I · Total interest: ${_fkD(_t30.totalInterest)}
- 15-year: ${_fD(_t15.monthlyPI)}/mo P&I · Total interest: ${_fkD(_t15.totalInterest)}
- Monthly difference: ${_fD(_moDiff2)}/mo more with 15-year
- Interest saved with 15-year: ${_fkD(_intSaved)}

Required format:
## 📊 15-Year vs 30-Year — ${_fD(_p2)} at ${_rt2}%
[1-sentence opener]

**📅 30-Year Mortgage**
- 💵 Monthly P&I: ${_fD(_t30.monthlyPI)}/mo
- 💸 Total interest paid: ${_fkD(_t30.totalInterest)}
- ✅ Lower monthly payment — more cash flow flexibility

**📅 15-Year Mortgage**
- 💵 Monthly P&I: ${_fD(_t15.monthlyPI)}/mo
- 💸 Total interest paid: ${_fkD(_t15.totalInterest)}
- ⬆️ Pay ${_fD(_moDiff2)}/mo more but save ${_fkD(_intSaved)} in interest
- 🏠 Builds equity ~2× faster in the first decade

**🎯 Break-Even & Recommendation**
[2-3 sentences: when does 15-year make sense vs 30-year? Cash flow vs total cost trade-off.]

**❓ Questions to Consider**
- [question 1 about monthly budget flexibility]
- [question 2 about long-term goals]`;
            const _daR2 = await callGrokOnce(_daPr2, { maxTokens: 1200 });
            const _nar2 = (typeof _daR2.grokFinal?.narrative === 'string' && _daR2.grokFinal.narrative.length > 50)
                ? _daR2.grokFinal.narrative
                : `**15-Year vs 30-Year — ${_fD(_p2)} at ${_rt2}%**\n\n- 30-year: ${_fD(_t30.monthlyPI)}/mo · Interest: ${_fkD(_t30.totalInterest)}\n- 15-year: ${_fD(_t15.monthlyPI)}/mo · Interest: ${_fkD(_t15.totalInterest)}\n- Pay ${_fD(_moDiff2)}/mo more but save ${_fkD(_intSaved)} in interest`;
            return noStore({ ok: true, path: 'term_analysis', route: 'answers', answer: _nar2, message: _nar2, answerMarkdown: _nar2, scenarioComparisonCard: null, grok: { answer: _nar2, next_step: null, follow_up: null, follow_up_chips: [], confidence: 'high', scenarioComparisonCard: null }, fred: { tenYearYield: fred.tenYearYield, mort30Avg: fred.mort30Avg, spread: fred.spread, asOf: fred.asOf }, usedFRED: true, debug: { requestedModel: 'deep-analysis-term', servedModel: _daR2.debug.servedModel ?? 'grok', promptChars: _daMsg.length, elapsedMs: _daR2.debug.elapsedMs, requestId: 'da-term-'+Date.now(), parseMode: 'direct', repaired: false } });
        }

        // ── Rent vs Buy ─────────────────────────────────────────────────────
        const _daIsRB = /rent.*(?:vs|versus|or).*buy|buy.*(?:vs|versus|or).*rent|should.*(?:rent|buy)|renting.*buying|buying.*renting|walk.*rent.*buy/i.test(_daMsg);
        if (!_daIsDP && !_daIsTerm && _daIsRB) {
            const _p3 = _daExtractPrice(_daMsg, 550_000);
            const _rt3 = _daExtractRate(_daMsg, _daRate0);
            const _rentM3 = _daMsg.match(/rent(?:ing)?\s*(?:is|at|of|for)?\s*\$?\s*([\d,]+)/i);
            const _rent3 = _rentM3 ? parseFloat(_rentM3[1].replace(/,/g,'')) : 2_800;
            const _dpM3 = _daMsg.match(/(\d+)\s*%\s*down/i);
            const _dp3 = _dpM3 ? Math.min(Math.max(parseFloat(_dpM3[1]),3),30) : 10;
            const _buy3 = calculateMortgage({ price: _p3, downPaymentPct: _dp3, rate: _rt3, termYears: 30 });
            const _pmiM3 = _dp3<20 ? (_buy3.loanAmount*0.0055)/12 : 0;
            const _taxM3 = (_p3*0.012)/12;
            const _insM3 = (_p3*0.005)/12;
            const _totBuy = _buy3.monthlyPI + _pmiM3 + _taxM3 + _insM3;
            const _futureVal = _p3 * Math.pow(1.04, 7);
            const _totalRent3 = _rent3 * 12 * 7;
            const _daPr3 = `You are a helpful mortgage advisor. Return valid JSON: {"narrative":"...markdown..."}

Write a clear, visually rich rent vs buy analysis. Use markdown with emoji icons on every stat line. Include both financial and lifestyle factors.

Use EXACTLY these numbers (do not recalculate):
- Home price: ${_fD(_p3)}, ${_dp3}% down (${_fD(_buy3.downPayment)}), loan ${_fD(_buy3.loanAmount)} at ${_rt3}%
- Buying total monthly: ${_fD(_totBuy)}/mo (P&I ${_fD(_buy3.monthlyPI)} + tax ${_fD(_taxM3)} + ins ${_fD(_insM3)}${_dp3<20?` + PMI ${_fD(_pmiM3)}`:''}))
- Renting: ${_fD(_rent3)}/mo
- Monthly diff to buy: ${_fD(_totBuy-_rent3)}/mo ${_totBuy>_rent3?'more':'less'}
- Over 7 years: total rent paid ${_fkD(_totalRent3)} · home at 4%/yr grows to ${_fkD(_futureVal)}

Required format:
## 🏠 Rent vs. Buy — ${_fD(_p3)} at ${_rt3}%
[1-sentence framing of the decision]

**❌ Renting**
- 💵 Monthly rent: ${_fD(_rent3)}/mo
- ✅ No maintenance, taxes, or upfront cash needed
- ❌ No equity built, rent rises ~3%/yr

**🏡 Buying (${_dp3}% down)**
- 💵 Down payment: ${_fD(_buy3.downPayment)}
- 📅 Monthly PITI${_dp3<20?' + PMI':''}: ${_fD(_totBuy)}/mo
- 🏠 Home value at 4%/yr over 7 years: ${_fkD(_futureVal)}
- 💸 Total rent over 7 years: ${_fkD(_totalRent3)}

**📊 The Decision**
- ↕️ Monthly difference: ${_fD(Math.abs(_totBuy-_rent3))}/mo ${_totBuy>_rent3?'more to own':'more to rent'}
- 🏡 Equity & appreciation work for you as an owner
- 🛑 Buying costs more upfront — breakeven typically 5–8 years

**🎯 Recommendation**
[2-3 sentences: when does buying make sense? Address both financial and lifestyle angles.]

**❓ Questions to Consider**
- [question 1 about timeline/stability]
- [question 2 about financial readiness]`;
            const _daR3 = await callGrokOnce(_daPr3, { maxTokens: 1200 });
            const _nar3 = (typeof _daR3.grokFinal?.narrative === 'string' && _daR3.grokFinal.narrative.length > 50)
                ? _daR3.grokFinal.narrative
                : `**Rent vs Buy — ${_fD(_p3)} home**\n\n- Buying: ${_fD(_totBuy)}/mo total PITI · ${_fD(_buy3.downPayment)} down\n- Renting: ${_fD(_rent3)}/mo\n- Monthly diff: ${_fD(Math.abs(_totBuy-_rent3))}/mo ${_totBuy>_rent3?'more to own':'more to rent'}`;
            return noStore({ ok: true, path: 'rent_buy_analysis', route: 'answers', answer: _nar3, message: _nar3, answerMarkdown: _nar3, scenarioComparisonCard: null, grok: { answer: _nar3, next_step: null, follow_up: null, follow_up_chips: [], confidence: 'high', scenarioComparisonCard: null }, fred: { tenYearYield: fred.tenYearYield, mort30Avg: fred.mort30Avg, spread: fred.spread, asOf: fred.asOf }, usedFRED: true, debug: { requestedModel: 'deep-analysis-rb', servedModel: _daR3.debug.servedModel ?? 'grok', promptChars: _daMsg.length, elapsedMs: _daR3.debug.elapsedMs, requestId: 'da-rb-'+Date.now(), parseMode: 'direct', repaired: false } });
        }
        // Seller credit / rate buydown — fall through to normal Grok with the stripped message
    }

    const _earlyLoanLimitsOverride = (body as any)?.paramOverrides?.loanLimitsCounty;
    if (!isLoanLimitsQuestion(question) && !_earlyLoanLimitsOverride && isUnderwritingGuidelineQuestion(question)) {
        console.log('[UW Guidelines] Detected guideline question in answers route — calling AI with database');

        const uwDatabase = `
=== UNDERWRITING GUIDELINES DATABASE (2026) ===

── FHA (Federal Housing Administration) ──────────────────────────────
Source: HUD Handbook 4000.1 | hud.gov/program_offices/housing/sfh
DTI: Front-end ≤31% guideline, up to 40%+ with AUS. Back-end ≤43%, up to 50% with compensating factors.
Credit Score: 580+ → 3.5% down. 500–579 → 10% down. Below 500 → not eligible.
LTV / Down Payment: 3.5% min (580+ FICO), 10% min (500–579 FICO). Max LTV 96.5%.
Loan Limits (2026 — EXACT HUD VALUES, do not interpolate):\nNational floor: 1-unit $541,287 | 2-unit $693,050 | 3-unit $837,700 | 4-unit $1,041,125.\nHigh-cost ceiling: 1-unit $1,249,125 | 2-unit $1,599,375 | 3-unit $1,933,200 | 4-unit $2,402,625.\nCA: most counties at FHA ceiling (match conforming). Low-cost CA counties at floor ($541,287 1-unit). AK/HI/Guam/USVI may exceed ceiling. Source: HUD No. 25-145, effective Jan 1 2026.
Mortgage Insurance: UFMIP 1.75% financed. Annual MIP 0.55% (>15yr, LTV >90%, loan >$150,400) — life of loan if <10% down; removed after 11 years if 10%+ down. Source: HUD Mortgagee Letter 2023-05, effective March 20 2023.
Reserves: Not required by FHA. Lender overlays may require 1–3 months.
Employment: 2-year history required. Gaps >6 months need explanation.
Gift Funds: 100% of down payment can be gift (family, employer, nonprofit).
Self-Employed: 2 years tax returns (1040), P&L, business bank statements. Income averaged over 2 years.

── CONVENTIONAL (Fannie Mae / Freddie Mac) ────────────────────────────
Source: Fannie Mae Selling Guide B3-6 | selling-guide.fanniemae.com. Freddie Mac SFSSG | freddiemac.com/singlefamily
DTI: Standard ≤45% back-end. DU/LP approval up to 50% with strong compensating factors.
Credit Score: Minimum 620. Best pricing 740+. Below 620 not eligible.
LTV / Down Payment: Primary 1-unit 3% min (HomeReady/Standard 97). Investment property 15% (1-unit), 25% (2–4 units). Second home 10% min. No PMI at 20%+ down.
Loan Limits (2026 — EXACT FHFA VALUES, do not interpolate):\nStandard (non-high-balance): 1-unit $832,750 | 2-unit $1,032,650 | 3-unit $1,248,150 | 4-unit $1,551,250.\nCA high-balance ceiling (e.g. LA, OC, SF, SB, SC, SM, SC, Alameda, Contra Costa, Marin, San Benito, Santa Clara): 1-unit $1,249,125 | 2-unit $1,599,375 | 3-unit $1,933,200 | 4-unit $2,402,625.\nCA mid-tier examples (1-unit / 2-unit / 3-unit / 4-unit):\n  San Diego: $1,104,000 / $1,413,400 / $1,708,050 / $2,123,900\n  Ventura: $1,035,000 / $1,325,000 / $1,601,600 / $1,990,450\n  Napa: $1,017,750 / $1,303,100 / $1,574,950 / $1,957,650\n  SLO: $1,000,500 / $1,280,800 / $1,548,350 / $1,923,950\n  Santa Barbara: $941,850 / $1,205,900 / $1,457,600 / $1,811,750\n  Sonoma: $897,000 / $1,148,400 / $1,388,200 / $1,725,350\n  All other CA counties: $832,750 / $1,066,250 / $1,288,900 / $1,601,950.\nSource: FHFA CY2026, effective Jan 1 2026.
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
Loan Limits (2026): Jumbo = above conforming for the county. Standard counties: above $832,750. CA high-balance counties: above county limit (e.g. LA/SF/OC above $1,249,125). No FHA or GSE backing — private lender only.
── MORTGAGE FORMS & TERMINOLOGY ────────────────────────────────────────
1003 / URLA: Uniform Residential Loan Application (Fannie Mae Form 1003). The standard mortgage application form used by all lenders. Collects borrower identity, employment, income, assets, liabilities, property info, and loan details. Required for every mortgage application regardless of loan type.
1004: Uniform Residential Appraisal Report — standard appraisal form for single-family homes.
1007: Single-Family Comparable Rent Schedule — used to establish market rent for DSCR/investment properties.
1008: Transmittal Summary — summarizes loan file data sent to Fannie/Freddie.
4506-C: IRS transcript request form — lenders use to verify tax returns directly with the IRS.
AUS: Automated Underwriting System. DU (Desktop Underwriter) = Fannie Mae. LP (Loan Product Advisor) = Freddie Mac. GUS = USDA. Provides Approve/Eligible or Refer findings.
CD / Closing Disclosure: TRID-required disclosure showing final loan terms, closing costs, and cash to close. Borrower must receive 3 business days before closing.
Clear to Close (CTC): Final underwriting approval — all conditions satisfied, loan is ready to fund.
Commitment Letter: Lender's conditional or final approval stating loan terms and any remaining conditions.
Compensating Factors: Strengths that offset a weakness (high DTI, thin credit). Examples: significant reserves, low LTV, large down payment, residual income, long employment history.
DSCR: Debt Service Coverage Ratio = Gross Monthly Rent ÷ PITIA. Measures whether rental income covers the mortgage payment.
DTI: Debt-to-Income Ratio. Front-end = housing payment ÷ gross income. Back-end = all monthly debts ÷ gross income.
Escrow: Account held by servicer to pay property taxes and insurance from borrower's monthly payment.
GFE: Good Faith Estimate — pre-TRID disclosure (replaced by Loan Estimate in 2015).
HUD-1: Settlement statement used before TRID (2015). Now replaced by Closing Disclosure.
LE / Loan Estimate: TRID-required 3-page disclosure of estimated loan terms and closing costs. Must be issued within 3 business days of application.
LTV: Loan-to-Value Ratio = Loan Amount ÷ Appraised Value. Drives PMI, MIP, and pricing.
PITIA: Principal + Interest + Taxes + Insurance + HOA. Full housing payment used in DTI and DSCR calculations.
PITI: Principal + Interest + Taxes + Insurance (no HOA).
QM / ATR: Qualified Mortgage / Ability-to-Repay rule. CFPB rule requiring lenders to verify borrower can repay. Most conventional/FHA/VA loans are QM loans.
Rate Lock: Agreement fixing the interest rate for a specified period (30, 45, 60 days). Protects borrower from rate increases before closing.
RESPA: Real Estate Settlement Procedures Act. Governs disclosure of settlement costs and prohibits kickbacks.
TILA: Truth in Lending Act. Requires disclosure of APR, total loan cost, and payment schedule.
TRID: TILA-RESPA Integrated Disclosure rule. Combines mortgage disclosures into Loan Estimate and Closing Disclosure.
Title Insurance: Protects lender (lender's policy) and/or owner (owner's policy) against title defects or liens.
UPB: Unpaid Principal Balance — remaining loan balance at any point.
=== END GUIDELINES ===`;

        const uwSystemPrompt = `You are HomeRates.AI Underwriting Guidelines Expert.

STRICT RULES — violations are not acceptable:
- NEVER introduce yourself or mention HomeRates.AI in your response
- NEVER say "Welcome" or any greeting
- Jump straight into the content with the headline
- For program guidelines (DTI, credit scores, LTV, MIP, reserves, loan limits, gift funds, employment): use ONLY the guidelines database below
- For standard mortgage industry terminology, forms, and concepts (1003, URLA, GFE, CD, AUS, DU, LP, appraisal, title, escrow, note, deed of trust, RESPA, TILA, QM, ATR, rate lock, commitment letter, clear to close, HUD-1, closing disclosure, etc.): answer from your expert knowledge — these are industry-standard and do not require the database
- Do NOT recommend Credit Karma, credit counseling services, apps, or any third-party tools
- Do NOT invent lender names, programs, or requirements not in the database
- Only say "Not specified in guidelines — verify with lender" for program-specific lender overlays, never for standard mortgage industry terminology or forms

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
                    model: 'grok-4-1-fast-non-reasoning',
                    messages: [
                        { role: 'system', content: uwSystemPrompt },
                        { role: 'user', content: question },
                    ],
                    max_tokens: 1200,
                    temperature: 0.15,
                }),
            });
            const xaiData = await xaiRes.json() as any;
            uwAnswerText = (xaiData?.choices?.[0]?.message?.content || 'Unable to retrieve guideline data.')
                .replace(/\*\*(\$[\d,]+(?:\.\d+)?%?)\*\*/g, '$1')  // strip ** around dollar amounts and percentages
                .replace(/\*\*(\d[\d,]*(?:\.\d+)?%?)\*\*/g, '$1'); // strip ** around plain numbers
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
            grok: (() => {
                const uwCard = buildUWCard({ question, answerMarkdown: uwAnswerText });
                return {
                    answer: uwCard.answer,
                    next_step: uwCard.next_step,
                    follow_up: uwCard.follow_up,
                    follow_up_chips: uwCard.follow_up_chips,
                    confidence: uwCard.confidence,
                };
            })(),
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
            answerMarkdown: buildAnswerMarkdown(uwAnswerText),
            followUp: null,
            follow_up_chips: [],
        });
    }
    // ========== END UNDERWRITING GUIDELINES BYPASS ==========

    // ============================================================
    // UNIFIED CALC ENGINE DISPATCH
    // Runs before module routing. Priority: refi > fha > dscr > conv > affordability
    // If matched: returns deterministic card, skips Grok entirely.
    // If no match or error: falls through to old system below.
    // ============================================================
    // HR-MEMORY:DISPATCH-CONTEXT — read last scenario_snapshot to lock loan type for follow-ups
    let dispatchHistory = recallTurnsText || conversationHistory || '';
    let snapshotLoanType: string | null = null;
    let snapshotJson: any = null;
    let snapshotText = '';
    if (supabase && memoryThreadId) {
        try {
            const { data: recentSnap } = await supabase
                .from('memory_items')
                .select('content_text, content_json')
                .eq('memory_thread_id', memoryThreadId)
                .eq('kind', 'scenario_snapshot')
                .eq('content_json->>chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (recentSnap?.content_json?.model) {
                snapshotLoanType = recentSnap.content_json.model; // e.g. "calcEngine-dscr"
                snapshotJson = recentSnap.content_json;
                snapshotText = recentSnap.content_text ?? '';
            }
        } catch { /* silent */ }
    }
    // PRIORITY: structured paramOverrides from chip click — bypasses all text parsing
    const paramOverrides = (body as any)?.paramOverrides ?? null;

    const calcDispatch = dispatch(question, dispatchHistory, fred?.mort30Avg ?? undefined);

    // Apply paramOverrides immediately after dispatch — chip params win over parsed params
    if (paramOverrides) {
        // If override carries grossMonthlyRent, this is a DSCR chip — force type and rebuild params
        if (paramOverrides.grossMonthlyRent != null) {
            (calcDispatch as any).type = 'dscr';
            (calcDispatch as any).params = {
                purchasePrice: paramOverrides.purchasePrice ?? (calcDispatch.params as any)?.purchasePrice,
                grossMonthlyRent: paramOverrides.grossMonthlyRent,
                downPaymentPct: paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 25,
                annualRatePct: paramOverrides.annualRatePct ?? (calcDispatch.params as any)?.annualRatePct ?? 6.5,
                vacancyRate: 0,
            };
            // Rebuild assumptions using changedKeys — only show what actually changed
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                grossMonthlyRent: `rent updated to $${paramOverrides.grossMonthlyRent?.toLocaleString()}/mo`,
                annualRatePct: `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice: `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if (paramOverrides.annualIncome != null && !(paramOverrides as any).loanType && paramOverrides.purchasePrice == null) {
            // Affordability branch: only when income is present AND no specific loan type is targeted
            // AND no purchase price — prevents conversation-context income from hijacking VA/FHA/jumbo chips
            (calcDispatch as any).type = 'affordability';
            (calcDispatch as any).params = {
                annualIncome: paramOverrides.annualIncome,
                savings: paramOverrides.savings ?? (calcDispatch.params as any)?.savings ?? 0,
                monthlyDebts: paramOverrides.monthlyDebts ?? (calcDispatch.params as any)?.monthlyDebts ?? 0,
                annualRatePct: paramOverrides.annualRatePct ?? (calcDispatch.params as any)?.annualRatePct ?? 6.5,
                downPctOverride: undefined,
                fhaLoanLimit: undefined,
                confLoanLimit: undefined,
                locationLabel: undefined,
            };
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                annualIncome: `income updated to $${paramOverrides.annualIncome?.toLocaleString()}/yr`,
                savings: `savings updated to $${paramOverrides.savings?.toLocaleString()}`,
                annualRatePct: `rate updated to ${paramOverrides.annualRatePct}%`,
                monthlyDebts: `monthly debts updated to $${paramOverrides.monthlyDebts?.toLocaleString()}/mo`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if ((paramOverrides as any).rate20yr != null && (paramOverrides as any).rate30yr != null) {
            (calcDispatch as any).type = 'refi_20vs30';
            (calcDispatch as any).params = {
                balance: (paramOverrides as any).balance20vs30,
                rate20yr: (paramOverrides as any).rate20yr,
                rate30yr: (paramOverrides as any).rate30yr,
            };
        } else if ((paramOverrides as any).extraPaymentBalance != null && (paramOverrides as any).extraPaymentRate != null) {
            (calcDispatch as any).type = 'extra_payment';
            (calcDispatch as any).params = {
                balance:     (paramOverrides as any).extraPaymentBalance,
                ratePct:     (paramOverrides as any).extraPaymentRate,
                targetYears: (paramOverrides as any).extraPaymentTargetYears ?? 20,
            };
        } else if ((paramOverrides as any).earlySaleBalance != null && (paramOverrides as any).earlySaleNewRate != null) {
            (calcDispatch as any).type = 'refi_early_sale';
            (calcDispatch as any).params = {
                balance:        (paramOverrides as any).earlySaleBalance,
                currentRatePct: (paramOverrides as any).earlySaleCurrentRate,
                newRatePct:     (paramOverrides as any).earlySaleNewRate,
                closingCosts:   (paramOverrides as any).earlySaleClosingCosts ?? 0,
                saleYears:      (paramOverrides as any).earlySaleYears ?? 3,
            };
        } else if ((paramOverrides as any).oneExtraPaymentBalance != null && (paramOverrides as any).oneExtraPaymentRate != null) {
            (calcDispatch as any).type = 'one_extra_payment_per_year';
            (calcDispatch as any).params = {
                balance: (paramOverrides as any).oneExtraPaymentBalance,
                ratePct: (paramOverrides as any).oneExtraPaymentRate,
            };
        } else if (paramOverrides.newRatePct != null && paramOverrides.currentBalance != null) {
            (calcDispatch as any).type = 'refi';
            (calcDispatch as any).params = {
                currentBalance: paramOverrides.currentBalance,
                currentRatePct: paramOverrides.currentRatePct ?? (calcDispatch.params as any)?.currentRatePct ?? null,
                newRatePct: paramOverrides.newRatePct,
                remainingMonths: (calcDispatch.params as any)?.remainingMonths ?? 360,
                ...((paramOverrides as any).closingCosts != null ? { closingCosts: (paramOverrides as any).closingCosts } : {}),
                ...((paramOverrides as any).refiTermMonths != null ? { refiTermMonths: (paramOverrides as any).refiTermMonths } : {}),
            };
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                newRatePct: `rate updated to ${paramOverrides.newRatePct}%`,
                currentBalance: `balance updated to $${paramOverrides.currentBalance?.toLocaleString()}`,
                closingCosts: `no closing costs (lender credit via rate)`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if ((paramOverrides as any).fhaEquityMode === true) {
            (calcDispatch as any).type = 'fha_equity_timeline';
            (calcDispatch as any).params = {
                homePrice: paramOverrides.purchasePrice,
                loanBalance: (paramOverrides as any).fhaTotalLoan,
                annualRatePct: paramOverrides.annualRatePct,
                monthlyPI: (paramOverrides as any).monthlyPI,
                monthlyMIP: (paramOverrides as any).monthlyMIP ?? 0,
            };
        } else if ((paramOverrides as any).isFHA === true && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            (calcDispatch as any).type = 'fha';
            (calcDispatch as any).params = {
                purchasePrice: paramOverrides.purchasePrice,
                downPaymentPct: paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 3.5,
                annualRatePct: paramOverrides.annualRatePct,
            };
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                annualRatePct: `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice: `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if ((paramOverrides as any).buydownType && (paramOverrides as any).buydownType !== 'none' && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            // Buydown slider "Run adjusted scenario" — must sit BEFORE VA so buydownType wins over loanType:'va'
            const _bdPrice    = paramOverrides.purchasePrice as number;
            const _bdDown     = (paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 0) as number;
            const _bdBaseLoan = _bdPrice * (1 - _bdDown / 100);
            const _bdIsVA     = (paramOverrides as any).loanType === 'va' || (paramOverrides as any).isVA === true;
            const _bdFfPct    = (_bdIsVA ? ((paramOverrides as any).vaFundingFeePct ?? 0) : 0) as number;
            const _bdLoan     = Math.round(_bdBaseLoan * (1 + _bdFfPct / 100));
            (calcDispatch as any).type = 'buydown';
            (calcDispatch as any).params = {
                purchasePrice:   _bdPrice,
                loanAmount:      _bdLoan,
                annualRatePct:   paramOverrides.annualRatePct,
                buydownType:     (paramOverrides as any).buydownType,
                isVA:            _bdIsVA,
                sellerCredit:    (paramOverrides as any).sellerCredit ?? 0,
                annualTax:       _bdPrice * 0.011,
                annualInsurance: _bdPrice * 0.005,
            };
            (calcDispatch as any).assumptions = [
                `${(paramOverrides as any).buydownType} buydown at ${paramOverrides.annualRatePct}%`,
                ...(_bdIsVA ? ['VA loan — no down payment required'] : []),
                ...((paramOverrides as any).sellerCredit > 0 ? [`seller credit $${Number((paramOverrides as any).sellerCredit).toLocaleString()}`] : []),
            ];
        } else if ((paramOverrides as any).loanType === 'va' && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            (calcDispatch as any).type = 'va';
            (calcDispatch as any).params = {
                purchasePrice:       paramOverrides.purchasePrice,
                downPaymentPct:      paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 0,
                annualRatePct:       paramOverrides.annualRatePct,
                fundingFeeExempt:    !!(paramOverrides as any).vaFundingFeeExempt,
                customFundingFeePct: (paramOverrides as any).customFundingFeePct ?? undefined,
                buydownPoints:       (paramOverrides as any).buydownPoints ?? 0,
            };
            const _changedKeysVA: string[] = (paramOverrides as any).changedKeys ?? [];
            const _vaLabelMap: Record<string, string> = {
                annualRatePct:  `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice:  `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
                buydownPoints:  `seller buying down ${(paramOverrides as any).buydownPoints} point(s)`,
            };
            (calcDispatch as any).assumptions = _changedKeysVA.filter(k => _vaLabelMap[k]).map(k => _vaLabelMap[k]);
        } else if ((paramOverrides as any).loanType === 'jumbo' && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            (calcDispatch as any).type = 'jumbo';
            (calcDispatch as any).params = {
                purchasePrice:  paramOverrides.purchasePrice,
                downPaymentPct: Math.max(20, paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 20),
                annualRatePct:  paramOverrides.annualRatePct,
                termYears:      30,
            };
            const _changedKeysJumbo: string[] = (paramOverrides as any).changedKeys ?? [];
            const _jumboLabelMap: Record<string, string> = {
                annualRatePct:  `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice:  `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _changedKeysJumbo.filter(k => _jumboLabelMap[k]).map(k => _jumboLabelMap[k]);
        } else if ((paramOverrides as any).loanLimitsCounty != null || isLoanLimitsQuestion(question)) {
            (calcDispatch as any).type = 'loan_limits';
            (calcDispatch as any).params = null;
        } else if ((paramOverrides as any).isConvHB === true && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            // ConvHBSliderCard "Run adjusted scenario" — stays conventional even for HB loan amounts
            (calcDispatch as any).type = 'conventional';
            (calcDispatch as any).params = {
                purchasePrice:  paramOverrides.purchasePrice,
                downPaymentPct: paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 20,
                annualRatePct:  paramOverrides.annualRatePct,
            };
            const _chbCK: string[] = (paramOverrides as any).changedKeys ?? [];
            const _chbLM: Record<string, string> = {
                annualRatePct:  `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice:  `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _chbCK.filter(k => _chbLM[k]).map(k => _chbLM[k]);
        } else if ((paramOverrides as any).isDSCR && paramOverrides.grossMonthlyRent == null) {
            // isDSCR flag without rent → context-aware needs_input card, not conventional
            (calcDispatch as any).type = 'dscr_needs_input';
            (calcDispatch as any).params = null;
        } else if (paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            // Auto-detect jumbo: if loan amount exceeds 2026 conforming limit, force jumbo not conventional
            const _poDownFB = paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 20;
            const _poLoanFB = paramOverrides.purchasePrice * (1 - _poDownFB / 100);
            const _isImplicitJumboFB = _poLoanFB > CONF_STANDARD;
            (calcDispatch as any).type = _isImplicitJumboFB ? 'jumbo' : 'conventional';
            (calcDispatch as any).params = {
                purchasePrice: paramOverrides.purchasePrice,
                downPaymentPct: _isImplicitJumboFB ? Math.max(20, _poDownFB) : _poDownFB,
                annualRatePct: paramOverrides.annualRatePct,
                ...(_isImplicitJumboFB ? { termYears: 30 } : {}),
            };
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                annualRatePct: `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice: `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if (calcDispatch.params) {
            const p = calcDispatch.params as any;
            if (paramOverrides.purchasePrice != null) p.purchasePrice = paramOverrides.purchasePrice;
            if (paramOverrides.annualRatePct != null) p.annualRatePct = paramOverrides.annualRatePct;
            if (paramOverrides.downPaymentPct != null) p.downPaymentPct = paramOverrides.downPaymentPct;
            if (paramOverrides.annualIncome != null) p.annualIncome = paramOverrides.annualIncome;
            if (paramOverrides.savings != null) p.savings = paramOverrides.savings;
            if (paramOverrides.currentBalance != null) p.currentBalance = paramOverrides.currentBalance;
            if (paramOverrides.currentRatePct != null) p.currentRatePct = paramOverrides.currentRatePct;
            if (paramOverrides.newRatePct != null) p.newRatePct = paramOverrides.newRatePct;
        }
    }

    // HR-MEMORY:FOLLOW-UP-LOCK — if dispatcher returned no_calc_match or wrong type,
    // and this looks like a follow-up, override with snapshot loan type
    // Extract changed params from the follow-up question itself — before any override
    const followUpPrice = (() => { try { return (dispatch(question, '', fred?.mort30Avg ?? undefined).params as any)?.purchasePrice; } catch { return null; } })();
    const followUpDown = question.match(/(\d+\.?\d*)\s*%\s*down/i) ? parseFloat(question.match(/(\d+\.?\d*)\s*%\s*down/i)![1]) : null;
    const followUpRate = question.match(/(?:rate|at)\s+(\d+\.?\d*)\s*%/i) ? parseFloat(question.match(/(?:rate|at)\s+(\d+\.?\d*)\s*%/i)![1]) : null;
    const followUpRent = question.match(/rent\s*(?:is\s*)?\$?\s*([\d,]+)k?/i) ? parseFloat(question.match(/rent\s*(?:is\s*)?\$?\s*([\d,]+)k?/i)![1].replace(/,/g, '')) * (question.match(/rent\s*(?:is\s*)?\$?\s*[\d,]+k/i) ? 1000 : 1) : null;

    // Extract BASELINE params from snapshot content_text — authoritative source
    const snapshotPrice = snapshotText.match(/\$([\d,]+(?:\.\d+)?k?)\s*purchase/i)
        ? parseFloat(snapshotText.match(/\$([\d,]+(?:\.\d+)?k?)\s*purchase/i)![1].replace(/,/g, '')) * (snapshotText.match(/k\s*purchase/i) ? 1000 : 1) : null;
    const snapshotDown = snapshotText.match(/([\d.]+)%\s*down/i)
        ? parseFloat(snapshotText.match(/([\d.]+)%\s*down/i)![1]) : null;
    const snapshotRate = snapshotText.match(/([\d.]+)%\s*·\s*\d+.year/i)
        ? parseFloat(snapshotText.match(/([\d.]+)%\s*·\s*\d+.year/i)![1]) : null;
    const snapshotTerm = snapshotText.match(/(\d+).year/i)
        ? parseInt(snapshotText.match(/(\d+).year/i)![1]) : 30;
    const snapshotRent = snapshotText.match(/rent[^\d$]*\$([\d,]+)/i)
        ? parseFloat(snapshotText.match(/rent[^\d$]*\$([\d,]+)/i)![1].replace(/,/g, '')) : null;

    // Extract ONLY what changed from the follow-up question
    const qLower = question.toLowerCase();
    const fuDown = question.match(/([\d]+\.?\d*)\s*%\s*down/i)
        ? parseFloat(question.match(/([\d]+\.?\d*)\s*%\s*down/i)![1]) : null;
    const fuRate = question.match(/(?:rate|at|to|drop(?:s)?\s+to|down\s+to)\s+([\d]+\.?\d*)\s*%/i)
        ? parseFloat(question.match(/(?:rate|at|to|drop(?:s)?\s+to|down\s+to)\s+([\d]+\.?\d*)\s*%/i)![1]) : null;
    const fuPrice = question.match(/\$([\d,]+(?:\.\d+)?k?)\b/i) ? (() => {
        const raw = parseFloat(question.match(/\$([\d,]+(?:\.\d+)?k?)\b/i)![1].replace(/,/g, '')) * (question.match(/\$[\d,]+k\b/i) ? 1000 : 1);
        // Reject if within 2% of snapshot loan amount — leakage from prior card
        const snapLoan = snapshotJson?.loan_amount ?? snapshotJson?.scenario_inputs?.loan_amount ?? null;
        return (snapLoan && Math.abs(raw - snapLoan) / snapLoan < 0.02) ? null : raw;
    })() : null;
    const fuRent = question.match(/rent\s*\$?([\d,]+)k?\b/i)
        ? parseFloat(question.match(/rent\s*\$?([\d,]+)k?\b/i)![1].replace(/,/g, '')) * (question.match(/rent\s*\$?[\d,]+k\b/i) ? 1000 : 1) : null;
    const fuNewRate = question.match(/(?:new rate|refi to|drop to|down to|rates?\s+(?:go|drop|fall|come)?\s*to)\s*([\d]+\.?\d*)\s*%/i)
        ?? question.match(/(?:at|to)\s+([\d]+\.?\d*)\s*%/i)
        ? parseFloat((question.match(/(?:new rate|refi to|drop to|down to|rates?\s+(?:go|drop|fall|come)?\s*to)\s*([\d]+\.?\d*)\s*%/i)
            ?? question.match(/(?:at|to)\s+([\d]+\.?\d*)\s*%/i))![1]) : null;

    const isFollowUp = /what if|what about|instead|same but|same scenario|same home|same fha|same property|same rental|same refi|same loan|show me|if rates?|rates? drop|rates? go|rates? fall|drop to|down to|how much income|what income|what salary|income.*(?:need|qualify|required)|do i qualify|can i qualify|monthly debt|car payment|student loan.*payment|\$\d+.*debt|debt.*\$\d+/i.test(question);
    // A fresh-context query carries full property/buying/owning context — never treat as follow-up,
    // even if phrasing accidentally matches isFollowUp tokens like "show me".
    const isFreshContextQuery =
        /\b(?:i'?m|i\s+am)\s+(?:looking\s+at\s+)?buy(?:ing)?\b/i.test(question) ||
        /\blisted\s+at\s+\$/i.test(question) ||
        /\bi\s+own\s+this\s+(?:home|property)\b/i.test(question) ||
        /\bi\s+own\s+(?:this\s+)?home\s+at\b/i.test(question);
    const isRefiHypothetical = /what if.*refinanc|refinanc.*later|refinanc.*future|refinanc.*\d+\s*year/i.test(question);
    // isDSCRFollowUp: fires when prior DSCR snapshot exists and dispatch couldn't extract full params
    // catches natural follow-ups like "run my numbers", "calculate", "try at 7%" that isFollowUp misses
    const isDSCRFollowUp = snapshotLoanType === 'calcEngine-dscr' &&
        snapshotJson?.scenario_inputs &&
        // conventional drift: dispatch saw price+down% and routed to conventional, but snapshot was DSCR
        (calcDispatch.type === 'dscr_needs_input' || calcDispatch.type === 'no_calc_match' || calcDispatch.type === 'conventional');
    const isSalaryFollowUp = /(?:qualify|afford|make|earn|salary|income)\s+(?:on\s+)?\$[\d,]+k?\b|\$[\d,]+k?\s+(?:salary|income|a year|\/year)/i.test(question);
    if ((isFollowUp || isDSCRFollowUp) && snapshotLoanType && !isSalaryFollowUp && !isFreshContextQuery &&
        calcDispatch.type !== 'uw_starter' && calcDispatch.type !== 'lab' && calcDispatch.type !== 'about' && calcDispatch.type !== 'how_it_works' &&
        !(calcDispatch.type === 'conventional' && calcDispatch.params && !isDSCRFollowUp) &&
        !(calcDispatch.type === 'refi' && isRefiHypothetical) &&
        (calcDispatch.type === 'no_calc_match' || calcDispatch.type !== snapshotLoanType.replace('calcEngine-', ''))) {
        if (snapshotLoanType === 'calcEngine-dscr' && snapshotJson?.scenario_inputs) {
            const si = snapshotJson.scenario_inputs;
            (calcDispatch as any).type = 'dscr';
            (calcDispatch as any).params = {
                purchasePrice: fuPrice ?? si.price ?? si.purchasePrice,
                grossMonthlyRent: fuRent ?? si.rent_monthly ?? si.grossMonthlyRent,
                downPaymentPct: fuDown ?? si.down_payment_pct ?? 25,
                annualRatePct: fuRate ?? si.rate_used_pct ?? 6.5,
                vacancyRate: 0,
            };
        } else if (snapshotLoanType === 'calcEngine-fha' && snapshotJson?.scenario_inputs) {
            const si = snapshotJson.scenario_inputs;
            (calcDispatch as any).type = 'fha';
            (calcDispatch as any).params = {
                purchasePrice: fuPrice ?? si.price ?? si.purchasePrice,
                downPaymentPct: fuDown ?? si.down_payment_pct ?? 3.5,
                annualRatePct: fuRate ?? si.rate_used_pct ?? 6.5,
            };
        } else if (snapshotLoanType === 'calcEngine-conventional' && snapshotJson?.scenario_inputs) {
            const si = snapshotJson.scenario_inputs;
            const isIncomeQuery = /how much income|what income do i need|what salary|income.*(?:need|qualify|required)|do i qualify|what income.*with.*(?:debts?|payment|car|student)/i.test(question);
            if (!isIncomeQuery) {
                (calcDispatch as any).type = 'conventional';
                (calcDispatch as any).params = {
                    purchasePrice: fuPrice ?? si.price ?? si.purchasePrice,
                    downPaymentPct: fuDown ?? si.down_payment_pct ?? 20,
                    annualRatePct: fuRate ?? si.rate_used_pct ?? 6.5,
                };
            } else {
                (calcDispatch as any).type = 'no_calc_match';
            }
        } else if (snapshotLoanType === 'refi_advisor_v2') {
            // Refi follow-up — re-run refi_advisor_v2 with changed rate
            // Force module = 'refi' so the refi bypass in route.ts fires
            (calcDispatch as any).type = 'refi';
            (calcDispatch as any).params = {
                currentBalance: snapshotJson?.loan_amount ?? null,
                currentRatePct: snapshotJson?.current_rate_pct ?? null,
                newRatePct: fuNewRate ?? snapshotJson?.rate_used_pct ?? null,
                remainingMonths: (snapshotJson?.term_years ?? 30) * 12,
            };
        } else if (snapshotLoanType === 'calcEngine-refi' && snapshotJson?.scenario_inputs) {
            const si = snapshotJson.scenario_inputs;
            (calcDispatch as any).type = 'refi';
            (calcDispatch as any).params = {
                currentBalance: si.loan_amount ?? null,
                currentRatePct: si.current_rate_pct ?? null,
                newRatePct: fuNewRate ?? fuRate ?? si.rate_used_pct ?? null,
                remainingMonths: (si.term_years ?? 30) * 12,
            };
        } else if (snapshotLoanType === 'calcEngine-affordability' && snapshotJson?.scenario_inputs) {
            const si = snapshotJson.scenario_inputs;
            (calcDispatch as any).type = 'affordability';
            (calcDispatch as any).params = {
                annualIncome: si.annual_income,
                savings: si.savings,
                monthlyDebts: si.monthly_debts ?? 0,
                annualRatePct: fuRate ?? si.rate_used_pct ?? 6.5,
                downPctOverride: undefined,
                fhaLoanLimit: undefined,
                confLoanLimit: undefined,
                locationLabel: undefined,
            };
        }
    }

    // paramOverrides second pass — re-apply after follow-up-lock block
    if (paramOverrides) {
        if (paramOverrides.grossMonthlyRent != null) {
            (calcDispatch as any).type = 'dscr';
            (calcDispatch as any).params = {
                purchasePrice: paramOverrides.purchasePrice ?? (calcDispatch.params as any)?.purchasePrice,
                grossMonthlyRent: paramOverrides.grossMonthlyRent,
                downPaymentPct: paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 25,
                annualRatePct: paramOverrides.annualRatePct ?? (calcDispatch.params as any)?.annualRatePct ?? 6.5,
                vacancyRate: 0,
            };
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                grossMonthlyRent: `rent updated to $${paramOverrides.grossMonthlyRent?.toLocaleString()}/mo`,
                annualRatePct: `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice: `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if (paramOverrides.annualIncome != null && !(paramOverrides as any).loanType && paramOverrides.purchasePrice == null) {
            // Affordability branch: only when income is present AND no specific loan type is targeted
            // AND no purchase price — prevents conversation-context income from hijacking VA/FHA/jumbo chips
            (calcDispatch as any).type = 'affordability';
            (calcDispatch as any).params = {
                annualIncome: paramOverrides.annualIncome,
                savings: paramOverrides.savings ?? (calcDispatch.params as any)?.savings ?? 0,
                monthlyDebts: paramOverrides.monthlyDebts ?? (calcDispatch.params as any)?.monthlyDebts ?? 0,
                annualRatePct: paramOverrides.annualRatePct ?? (calcDispatch.params as any)?.annualRatePct ?? 6.5,
                downPctOverride: undefined,
                fhaLoanLimit: undefined,
                confLoanLimit: undefined,
                locationLabel: undefined,
            };
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                annualIncome: `income updated to $${paramOverrides.annualIncome?.toLocaleString()}/yr`,
                savings: `savings updated to $${paramOverrides.savings?.toLocaleString()}`,
                annualRatePct: `rate updated to ${paramOverrides.annualRatePct}%`,
                monthlyDebts: `monthly debts updated to $${paramOverrides.monthlyDebts?.toLocaleString()}/mo`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if ((paramOverrides as any).rate20yr != null && (paramOverrides as any).rate30yr != null) {
            (calcDispatch as any).type = 'refi_20vs30';
            (calcDispatch as any).params = {
                balance: (paramOverrides as any).balance20vs30,
                rate20yr: (paramOverrides as any).rate20yr,
                rate30yr: (paramOverrides as any).rate30yr,
            };
        } else if ((paramOverrides as any).extraPaymentBalance != null && (paramOverrides as any).extraPaymentRate != null) {
            (calcDispatch as any).type = 'extra_payment';
            (calcDispatch as any).params = {
                balance:     (paramOverrides as any).extraPaymentBalance,
                ratePct:     (paramOverrides as any).extraPaymentRate,
                targetYears: (paramOverrides as any).extraPaymentTargetYears ?? 20,
            };
        } else if ((paramOverrides as any).earlySaleBalance != null && (paramOverrides as any).earlySaleNewRate != null) {
            (calcDispatch as any).type = 'refi_early_sale';
            (calcDispatch as any).params = {
                balance:        (paramOverrides as any).earlySaleBalance,
                currentRatePct: (paramOverrides as any).earlySaleCurrentRate,
                newRatePct:     (paramOverrides as any).earlySaleNewRate,
                closingCosts:   (paramOverrides as any).earlySaleClosingCosts ?? 0,
                saleYears:      (paramOverrides as any).earlySaleYears ?? 3,
            };
        } else if ((paramOverrides as any).oneExtraPaymentBalance != null && (paramOverrides as any).oneExtraPaymentRate != null) {
            (calcDispatch as any).type = 'one_extra_payment_per_year';
            (calcDispatch as any).params = {
                balance: (paramOverrides as any).oneExtraPaymentBalance,
                ratePct: (paramOverrides as any).oneExtraPaymentRate,
            };
        } else if (paramOverrides.newRatePct != null && paramOverrides.currentBalance != null) {
            (calcDispatch as any).type = 'refi';
            (calcDispatch as any).params = {
                currentBalance: paramOverrides.currentBalance,
                currentRatePct: paramOverrides.currentRatePct ?? (calcDispatch.params as any)?.currentRatePct ?? null,
                newRatePct: paramOverrides.newRatePct,
                remainingMonths: (calcDispatch.params as any)?.remainingMonths ?? 360,
                ...((paramOverrides as any).closingCosts != null ? { closingCosts: (paramOverrides as any).closingCosts } : {}),
                ...((paramOverrides as any).refiTermMonths != null ? { refiTermMonths: (paramOverrides as any).refiTermMonths } : {}),
            };
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                newRatePct: `rate updated to ${paramOverrides.newRatePct}%`,
                currentBalance: `balance updated to $${paramOverrides.currentBalance?.toLocaleString()}`,
                closingCosts: `no closing costs (lender credit via rate)`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if ((paramOverrides as any).fhaEquityMode === true) {
            (calcDispatch as any).type = 'fha_equity_timeline';
            (calcDispatch as any).params = {
                homePrice: paramOverrides.purchasePrice,
                loanBalance: (paramOverrides as any).fhaTotalLoan,
                annualRatePct: paramOverrides.annualRatePct,
                monthlyPI: (paramOverrides as any).monthlyPI,
                monthlyMIP: (paramOverrides as any).monthlyMIP ?? 0,
            };
        } else if ((paramOverrides as any).isFHA === true && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            (calcDispatch as any).type = 'fha';
            (calcDispatch as any).params = {
                purchasePrice: paramOverrides.purchasePrice,
                downPaymentPct: paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 3.5,
                annualRatePct: paramOverrides.annualRatePct,
            };
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                annualRatePct: `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice: `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if ((paramOverrides as any).buydownType && (paramOverrides as any).buydownType !== 'none' && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            // Buydown slider "Run adjusted scenario" — must sit BEFORE VA so buydownType wins over loanType:'va'
            const _bdPrice    = paramOverrides.purchasePrice as number;
            const _bdDown     = (paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 0) as number;
            const _bdBaseLoan = _bdPrice * (1 - _bdDown / 100);
            const _bdIsVA     = (paramOverrides as any).loanType === 'va' || (paramOverrides as any).isVA === true;
            const _bdFfPct    = (_bdIsVA ? ((paramOverrides as any).vaFundingFeePct ?? 0) : 0) as number;
            const _bdLoan     = Math.round(_bdBaseLoan * (1 + _bdFfPct / 100));
            (calcDispatch as any).type = 'buydown';
            (calcDispatch as any).params = {
                purchasePrice:   _bdPrice,
                loanAmount:      _bdLoan,
                annualRatePct:   paramOverrides.annualRatePct,
                buydownType:     (paramOverrides as any).buydownType,
                isVA:            _bdIsVA,
                sellerCredit:    (paramOverrides as any).sellerCredit ?? 0,
                annualTax:       _bdPrice * 0.011,
                annualInsurance: _bdPrice * 0.005,
            };
            (calcDispatch as any).assumptions = [
                `${(paramOverrides as any).buydownType} buydown at ${paramOverrides.annualRatePct}%`,
                ...(_bdIsVA ? ['VA loan — no down payment required'] : []),
                ...((paramOverrides as any).sellerCredit > 0 ? [`seller credit $${Number((paramOverrides as any).sellerCredit).toLocaleString()}`] : []),
            ];
        } else if ((paramOverrides as any).loanType === 'va' && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            (calcDispatch as any).type = 'va';
            (calcDispatch as any).params = {
                purchasePrice:       paramOverrides.purchasePrice,
                downPaymentPct:      paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 0,
                annualRatePct:       paramOverrides.annualRatePct,
                fundingFeeExempt:    !!(paramOverrides as any).vaFundingFeeExempt,
                customFundingFeePct: (paramOverrides as any).customFundingFeePct ?? undefined,
                buydownPoints:       (paramOverrides as any).buydownPoints ?? 0,
            };
            const _changedKeysVA: string[] = (paramOverrides as any).changedKeys ?? [];
            const _vaLabelMap: Record<string, string> = {
                annualRatePct:  `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice:  `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
                buydownPoints:  `seller buying down ${(paramOverrides as any).buydownPoints} point(s)`,
            };
            (calcDispatch as any).assumptions = _changedKeysVA.filter(k => _vaLabelMap[k]).map(k => _vaLabelMap[k]);
        } else if ((paramOverrides as any).loanType === 'jumbo' && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            (calcDispatch as any).type = 'jumbo';
            (calcDispatch as any).params = {
                purchasePrice:  paramOverrides.purchasePrice,
                downPaymentPct: Math.max(20, paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 20),
                annualRatePct:  paramOverrides.annualRatePct,
                termYears:      30,
            };
            const _changedKeysJumbo: string[] = (paramOverrides as any).changedKeys ?? [];
            const _jumboLabelMap: Record<string, string> = {
                annualRatePct:  `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice:  `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _changedKeysJumbo.filter(k => _jumboLabelMap[k]).map(k => _jumboLabelMap[k]);
        } else if ((paramOverrides as any).loanLimitsCounty != null || isLoanLimitsQuestion(question)) {
            (calcDispatch as any).type = 'loan_limits';
            (calcDispatch as any).params = null;
        } else if ((paramOverrides as any).isConvHB === true && paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            // ConvHBSliderCard "Run adjusted scenario" — stays conventional even for HB loan amounts
            (calcDispatch as any).type = 'conventional';
            (calcDispatch as any).params = {
                purchasePrice:  paramOverrides.purchasePrice,
                downPaymentPct: paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 20,
                annualRatePct:  paramOverrides.annualRatePct,
            };
            const _chbCK: string[] = (paramOverrides as any).changedKeys ?? [];
            const _chbLM: Record<string, string> = {
                annualRatePct:  `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice:  `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _chbCK.filter(k => _chbLM[k]).map(k => _chbLM[k]);
        } else if ((paramOverrides as any).isDSCR && paramOverrides.grossMonthlyRent == null) {
            // isDSCR flag without rent → context-aware needs_input card, not conventional
            (calcDispatch as any).type = 'dscr_needs_input';
            (calcDispatch as any).params = null;
        } else if (paramOverrides.purchasePrice != null && paramOverrides.annualRatePct != null) {
            // Auto-detect jumbo: if loan amount exceeds 2026 conforming limit, force jumbo not conventional
            const _poDownFB = paramOverrides.downPaymentPct ?? (calcDispatch.params as any)?.downPaymentPct ?? 20;
            const _poLoanFB = paramOverrides.purchasePrice * (1 - _poDownFB / 100);
            const _isImplicitJumboFB = _poLoanFB > CONF_STANDARD;
            (calcDispatch as any).type = _isImplicitJumboFB ? 'jumbo' : 'conventional';
            (calcDispatch as any).params = {
                purchasePrice: paramOverrides.purchasePrice,
                downPaymentPct: _isImplicitJumboFB ? Math.max(20, _poDownFB) : _poDownFB,
                annualRatePct: paramOverrides.annualRatePct,
                ...(_isImplicitJumboFB ? { termYears: 30 } : {}),
            };
            const _changedKeys: string[] = (paramOverrides as any).changedKeys ?? [];
            const _labelMap: Record<string, string> = {
                annualRatePct: `rate updated to ${paramOverrides.annualRatePct}%`,
                downPaymentPct: `down payment updated to ${paramOverrides.downPaymentPct}%`,
                purchasePrice: `price updated to $${paramOverrides.purchasePrice?.toLocaleString()}`,
            };
            (calcDispatch as any).assumptions = _changedKeys.filter(k => _labelMap[k]).map(k => _labelMap[k]);
        } else if (calcDispatch.params) {
            const p = calcDispatch.params as any;
            if (paramOverrides.purchasePrice != null) p.purchasePrice = paramOverrides.purchasePrice;
            if (paramOverrides.annualRatePct != null) p.annualRatePct = paramOverrides.annualRatePct;
            if (paramOverrides.downPaymentPct != null) p.downPaymentPct = paramOverrides.downPaymentPct;
            if (paramOverrides.annualIncome != null) p.annualIncome = paramOverrides.annualIncome;
            if (paramOverrides.savings != null) p.savings = paramOverrides.savings;
            if (paramOverrides.currentBalance != null) p.currentBalance = paramOverrides.currentBalance;
            if (paramOverrides.currentRatePct != null) p.currentRatePct = paramOverrides.currentRatePct;
            if (paramOverrides.newRatePct != null) p.newRatePct = paramOverrides.newRatePct;
        }
    }

    // ── Jumbo Affordability detection — fires before standard affordability ──
    // Trigger when: question contains jumbo + afford/income/qualify keywords
    //           OR  question mentions a price > $900k + afford/income/qualify keywords
    if (!paramOverrides && calcDispatch.type !== 'jumbo_affordability') {
        const _jqLower = question.toLowerCase();
        const _jAffordKeywords = /afford|income|qualify|how much|can i/i.test(question);
        const _jIsJumboKeyword = /\bjumbo\b/i.test(question);

        // Detect prices like $1.2M, $1,500,000, 1.5 million, $1.5m
        const _jHighPriceMatch = (() => {
            // "$1.5M" / "$1.5m" / "$1,500,000" / "1.5 million"
            const mM = question.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[mM]\b/);
            if (mM) {
                const v = parseFloat(mM[1].replace(/,/g, '')) * 1_000_000;
                if (v > 900_000) return v;
            }
            const mMillion = question.match(/([\d,]+(?:\.\d+)?)\s*million/i);
            if (mMillion) {
                const v = parseFloat(mMillion[1].replace(/,/g, '')) * 1_000_000;
                if (v > 900_000) return v;
            }
            const mPlain = question.match(/\$([\d,]{7,})/);
            if (mPlain) {
                const v = parseFloat(mPlain[1].replace(/,/g, ''));
                if (v > 900_000) return v;
            }
            void _jqLower;
            return null;
        })();

        if (_jAffordKeywords && (_jIsJumboKeyword || _jHighPriceMatch != null)) {
            // Also try to parse down payment % from question: "25% down", "25 percent down", "25% down payment"
            const _jDownMatch = question.match(/(\d{1,2})\s*%\s*(?:down(?:\s*payment)?|dp)\b/i)
                             ?? question.match(/(\d{1,2})\s*percent\s+down/i);
            const _jDownPct = _jDownMatch ? parseInt(_jDownMatch[1], 10) : undefined;

            (calcDispatch as any).type = 'jumbo_affordability';
            (calcDispatch as any).params = {
                purchasePrice: _jHighPriceMatch ?? 1_500_000,
                ...(_jDownPct != null && _jDownPct >= 5 && _jDownPct <= 50 ? { downPaymentPct: _jDownPct } : {}),
            };
        }
    }

    const fredRateForCard = fred?.mort30Avg != null ? `${fred.mort30Avg}% (FRED ${fred.asOf})` : undefined;

    // Helper: inject CMA chip onto any calc card.
    // Only runs when cmaAddress is present — no paste nudge on cards without CMA context.
    // Falls back to extracting address from plain-text buying seed (e.g. my-home Run My Numbers).
    function injectCmaChip(card: any): void {
        if (!card?.follow_up_chips) return;

        // Synthesize cma params from question text when no paramOverrides.cmaAddress is set.
        // Handles: "I'm looking at buying 12452 Altura, Rancho Cucamonga, CA 91739 listed at $1,325,000"
        let po: Record<string, any> = paramOverrides ?? {};
        if (!po.cmaAddress) {
            const buyMatch = question.match(/(?:buying|purchase|buy)\s+(.{10,80}?)\s+(?:listed at|at\s+\$)/i);
            if (buyMatch) {
                const rawAddr = buyMatch[1].replace(/^(this home at |home at )/i, '').trim();
                const parts   = rawAddr.split(',').map((s: string) => s.trim());
                const stateM  = (parts[parts.length - 1] ?? '').match(/([A-Z]{2})\s*\d{5}/);
                const priceM  = question.match(/listed at \$\s*([\d,]+)/i);
                const rateM   = question.match(/([\d]+\.[\d]+)\s*%/);
                po = {
                    cmaAddress:  rawAddr,
                    cmaCity:     parts.length >= 3 ? parts[parts.length - 2] : '',
                    cmaState:    stateM?.[1] ?? '',
                    cmaPrice:    priceM  ? Number(priceM[1].replace(/,/g, ''))  : undefined,
                    cmaLiveRate: rateM   ? parseFloat(rateM[1])                 : undefined,
                    cmaPhotoUrl: '',
                };
            }
        }
        if (!po.cmaAddress) return;

        const addr      = po.cmaAddress as string;
        const shortAddr = addr.split(',')[0].trim();
        const cmaPrice  = po.cmaPrice  as number | undefined;
        const cmaRate   = po.cmaLiveRate as number | undefined;
        const curPrice  = (paramOverrides?.purchasePrice ?? po.cmaPrice) as number | undefined;
        const curRate   = (paramOverrides?.annualRatePct ?? po.cmaLiveRate) as number | undefined;

        // Only show "Proposed Scenario" when numbers actually diverge from the original listing
        const priceDiff = !!(cmaPrice && curPrice && Math.abs(curPrice - cmaPrice) > 1000);
        const rateDiff  = !!(cmaRate  && curRate  && Math.abs(curRate  - cmaRate)  > 0.124);

        if ((priceDiff || rateDiff) && card.answer) {
            const _fd  = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
            const _fr  = (r: number) => parseFloat(r.toFixed(3)) + '%';
            const rows: string[] = [];

            if (priceDiff && cmaPrice && curPrice) {
                const delta = curPrice - cmaPrice;
                rows.push(`| Price | ${_fd(cmaPrice)} | **${_fd(curPrice)}** (${delta > 0 ? '+' : '−'}${_fd(Math.abs(delta))}) |`);
            }
            if (rateDiff && cmaRate && curRate) {
                const delta = curRate - cmaRate;
                rows.push(`| Rate | ${_fr(cmaRate)} | **${_fr(curRate)}** (${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(3)}%) |`);
            }

            const scenarioBlock =
                `📍 **${shortAddr}**\n\n` +
                `| | Listing | Your Scenario |\n|--|--|--|\n` +
                rows.join('\n') + '\n\n---\n\n';
            card.answer = scenarioBlock + card.answer;
        }

        const _cmaRerunSeed = `Property intelligence report: ${addr}${po.cmaCity ? ` in ${po.cmaCity}` : ''}`;
        const _cmaParams = { cmaAddress: po.cmaAddress, cmaCity: po.cmaCity, cmaState: po.cmaState, cmaPrice: po.cmaPrice, cmaBeds: po.cmaBeds, cmaBaths: po.cmaBaths, cmaSqft: po.cmaSqft, cmaTaxAnnual: po.cmaTaxAnnual, cmaTaxRate: po.cmaTaxRate, cmaLiveRate: po.cmaLiveRate, cmaPhotoUrl: po.cmaPhotoUrl };
        card.follow_up_chips = card.follow_up_chips.map((chip: any) =>
            chip.paramOverrides ? { ...chip, paramOverrides: { ...chip.paramOverrides, ..._cmaParams } } : chip
        );
        card.follow_up_chips.push({ label: `Full Property Intelligence Report`, seed: _cmaRerunSeed, paramOverrides: _cmaParams });
    }

    {
        let calcCard: any = null;
        let calcDebugModel = '';
        const calcAssumptions = calcDispatch.assumptions;

        // Never show needs_input form cards — Grok answers in prose when inputs are missing.
        // Needs_input cards were designed for cold zero-context questions but Grok handles those
        // better too, and chips from existing cards should NEVER trigger a data-collection form.
        if (typeof calcDispatch.type === 'string' && calcDispatch.type.endsWith('_needs_input')) {
            (calcDispatch as any).type = 'no_calc_match';
            (calcDispatch as any).params = null;
        }

        try {
            if (calcDispatch.type === 'refi_20vs30' && calcDispatch.params) {
                const result = calcRefi20vs30(calcDispatch.params as any);
                calcCard = buildRefi20vs30Card(result, fredRateForCard);
                calcDebugModel = 'calcEngine-refi_20vs30';

            } else if (calcDispatch.type === 'refi_early_sale' && calcDispatch.params) {
                const result = calcRefiEarlySale(calcDispatch.params as any);
                calcCard = buildRefiEarlySaleCard(result, fredRateForCard);
                calcDebugModel = 'calcEngine-refi_early_sale';

            } else if (calcDispatch.type === 'extra_payment' && calcDispatch.params) {
                const result = calcExtraPayment(calcDispatch.params as any);
                calcCard = buildExtraPaymentCard(result, fredRateForCard);
                calcDebugModel = 'calcEngine-extra_payment';

            } else if (calcDispatch.type === 'one_extra_payment_per_year' && calcDispatch.params) {
                const result = calcOneExtraPaymentPerYear(calcDispatch.params as any);
                calcCard = buildOneExtraPaymentPerYearCard(result, fredRateForCard);
                calcDebugModel = 'calcEngine-one_extra_payment_per_year';

            } else if (calcDispatch.type === 'refi' && calcDispatch.params) {
                const result = calcRefi(calcDispatch.params as any);
                // Estimate property value as balance / 0.8 (80% LTV default) so the LTV slider shows
                const _refiEstimatedValue = Math.round((calcDispatch.params as any).currentBalance / 0.8);
                calcCard = buildRefiCard(result, calcAssumptions, fredRateForCard,
                    (calcDispatch.params as any).isFHAtoConv ? 'fha_to_conv' : undefined,
                    _refiEstimatedValue);
                calcDebugModel = 'calcEngine-refi';

            } else if (calcDispatch.type === 'refi_needs_input') {
                calcCard = buildRefiNeedsInputCard(
                    calcDispatch.params as any,
                    fred?.mort30Avg ?? undefined,
                    fred?.asOf ?? undefined,
                    snapshotJson?.loan_amount ? Number(snapshotJson.loan_amount) : undefined,
                    snapshotJson?.current_rate_pct ? Number(snapshotJson.current_rate_pct) : undefined,
                );
                calcDebugModel = 'refi_needs_input';

            } else if (calcDispatch.type === 'fha_vs_conv' && calcDispatch.params) {
                const result = calcFHAvsConv(calcDispatch.params as any);
                calcCard = buildFHACard(result.fha, calcAssumptions, result, fredRateForCard);
                calcDebugModel = 'calcEngine-fha_vs_conv';
                injectCmaChip(calcCard);

            } else if (calcDispatch.type === 'fha' && calcDispatch.params) {
                const result = calcFHA(calcDispatch.params as any);
                calcCard = buildFHACard(result, calcAssumptions, undefined, fredRateForCard);
                calcDebugModel = 'calcEngine-fha';
                injectCmaChip(calcCard);

            } else if (calcDispatch.type === 'mip_duration_knowledge') {
                calcCard = buildMIPDurationCard(conversationHistory ?? '');
                calcDebugModel = 'mip_duration_knowledge';

            } else if (calcDispatch.type === 'fha_equity_timeline' && calcDispatch.params) {
                const p = calcDispatch.params as any;
                calcCard = buildFHAEquityTimelineCard(
                    p.homePrice, p.loanBalance, p.annualRatePct, p.monthlyPI, p.monthlyMIP,
                    fred?.mort30Avg ?? undefined,
                );
                calcDebugModel = 'calcEngine-fha_equity_timeline';

            } else if (calcDispatch.type === 'fha_needs_input') {
                calcCard = buildFHANeedsInputCard(calcDispatch.params as any, fred?.mort30Avg ?? undefined);
                calcDebugModel = 'fha_needs_input';

            } else if (calcDispatch.type === 'dscr' && calcDispatch.params) {
                const result = calcDSCR(calcDispatch.params as any);
                calcCard = buildDSCRCard(result, calcAssumptions, geoFeatures);
                calcDebugModel = 'calcEngine-dscr';
                injectCmaChip(calcCard);

            } else if (calcDispatch.type === 'dscr_needs_input') {
                const _knownPrice = paramOverrides?.purchasePrice ?? (calcDispatch.params as any)?.purchasePrice ?? undefined;
                const _knownDown  = paramOverrides?.downPaymentPct ?? undefined;
                const _knownRate  = paramOverrides?.annualRatePct ?? fred?.mort30Avg ?? undefined;
                calcCard = buildDSCRNeedsInputCard(fred?.mort30Avg ?? undefined, _knownPrice, _knownDown, _knownRate);
                calcDebugModel = 'dscr_needs_input';
                // Forward cma fields into rent chips so downstream DSCR result card also gets the chip
                if (paramOverrides?.cmaAddress && calcCard?.follow_up_chips) {
                    const _cmaParams = { cmaAddress: paramOverrides.cmaAddress, cmaCity: paramOverrides.cmaCity, cmaState: paramOverrides.cmaState, cmaPrice: paramOverrides.cmaPrice, cmaBeds: paramOverrides.cmaBeds, cmaBaths: paramOverrides.cmaBaths, cmaSqft: paramOverrides.cmaSqft, cmaTaxAnnual: paramOverrides.cmaTaxAnnual, cmaTaxRate: paramOverrides.cmaTaxRate, cmaLiveRate: paramOverrides.cmaLiveRate, cmaPhotoUrl: paramOverrides.cmaPhotoUrl };
                    calcCard.follow_up_chips = calcCard.follow_up_chips.map((chip: any) =>
                        chip.paramOverrides?.grossMonthlyRent != null
                            ? { ...chip, paramOverrides: { ...chip.paramOverrides, ..._cmaParams } }
                            : chip
                    );
                }
                injectCmaChip(calcCard);

            } else if (calcDispatch.type === 'va_entitlement_needs_input') {
                const _p = calcDispatch.params as any;
                calcCard = buildVAEntitlementNeedsInputCard(_p?.price ?? null, _p?.priorBalance ?? null);
                calcDebugModel = 'calcEngine-va-entitlement-needs-input';

            } else if (calcDispatch.type === 'va_entitlement' && calcDispatch.params) {
                const _ep = calcDispatch.params as any;
                // Resolve county limit — same logic as VA card
                let _entCountyLimit = NATIONAL_CONFORMING_BASELINE.units1;
                try {
                    const _eZip = extractZip(question);
                    if (_eZip && /^9[0-6]/.test(_eZip)) {
                        const _eCo = getCACountyByZip(_eZip);
                        if (_eCo) { const _eL = getCALoanLimits(_eCo); if (_eL) _entCountyLimit = _eL.conformingLimit; }
                    }
                    if (_entCountyLimit === NATIONAL_CONFORMING_BASELINE.units1) {
                        const _caM = question.match(/\b(nipomo|atascadero|paso robles|arroyo grande|pismo beach|grover beach|morro bay|cambria|san luis obispo|santa barbara|goleta|lompoc|monterey|carmel|seaside|king city|santa cruz|capitola|watsonville|scotts valley|los angeles|orange|irvine|anaheim|san diego|san francisco|san jose|sacramento|fresno|riverside|bakersfield|stockton|marin|napa|sonoma|ventura|santa clara|alameda|san mateo|thousand oaks|long beach|oakland|palo alto|mountain view|sunnyvale|santa rosa)\b/i);
                        if (_caM) { const _eL2 = getCALoanLimits(_caM[1]); if (_eL2) _entCountyLimit = _eL2.conformingLimit; }
                    }
                    if (_entCountyLimit === NATIONAL_CONFORMING_BASELINE.units1) {
                        const _stM = question.match(/\b([A-Z]{2})\b/);
                        const _coM = question.match(/\b(\w[\w\s]{2,25}?)\s+county\b/i);
                        if (_stM && _coM) {
                            const _nl = getNationalLimits(_stM[1], _coM[1].trim());
                            _entCountyLimit = _nl.conforming.units1;
                        }
                    }
                } catch (_e) { /* best-effort */ }
                const result = calcVAEntitlement({
                    purchasePrice:    _ep.purchasePrice,
                    priorLoanBalance: _ep.priorLoanBalance,
                    countyLimit:      (_ep.countyLimit as number | undefined) ?? _entCountyLimit,
                    annualRatePct:    _ep.annualRatePct,
                    isExempt:         _ep.isExempt ?? false,
                    annualTax:        _ep.annualTax,
                    annualInsurance:  _ep.annualInsurance,
                });
                calcCard = buildVAEntitlementCard(result);
                calcDebugModel = 'calcEngine-va-entitlement';

            } else if (calcDispatch.type === 'va' && calcDispatch.params) {
                const result = calcVA(calcDispatch.params as any);
                // Resolve county data for VA eligibility section (best-effort)
                let vaCountyData: import('../../../lib/cardBuilders').VACountyData | undefined;
                try {
                    const _vaZip = extractZip(question);
                    // CA: ZIP → county, then limits
                    if (_vaZip && /^9[0-6]/.test(_vaZip)) {
                        const _caCounty = getCACountyByZip(_vaZip);
                        if (_caCounty) {
                            const _caLimits = getCALoanLimits(_caCounty);
                            if (_caLimits) {
                                vaCountyData = { countyName: _caLimits.county, stateAbbr: 'CA', limit: _caLimits.conformingLimit, isHighBalance: _caLimits.conformingLimit > NATIONAL_CONFORMING_BASELINE.units1};
                            }
                        }
                    }
                    // CA: city name in question (no ZIP)
                    if (!vaCountyData) {
                        const _caMatch = question.match(/\b(nipomo|atascadero|paso robles|arroyo grande|pismo beach|grover beach|morro bay|cambria|san luis obispo|santa barbara|goleta|lompoc|monterey|carmel|seaside|king city|santa cruz|capitola|watsonville|scotts valley|los angeles|orange|irvine|anaheim|san diego|san francisco|san jose|sacramento|fresno|riverside|bakersfield|stockton|modesto|marin|napa|sonoma|ventura|santa clara|alameda|contra costa|san mateo|thousand oaks|long beach|oakland|berkeley|fremont|hayward|palo alto|mountain view|sunnyvale|cupertino|santa rosa|petaluma)\b/i);
                        if (_caMatch) {
                            const _caLimits = getCALoanLimits(_caMatch[1]);
                            if (_caLimits) {
                                vaCountyData = { countyName: _caLimits.county, stateAbbr: 'CA', limit: _caLimits.conformingLimit, isHighBalance: _caLimits.conformingLimit > NATIONAL_CONFORMING_BASELINE.units1};
                            }
                        }
                    }
                    // Non-CA: extract state abbreviation + county/city
                    if (!vaCountyData) {
                        const _stateMatch = question.match(/\b([A-Z]{2})\b/) ?? question.match(/\b(alabama|alaska|arizona|arkansas|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i);
                        if (_stateMatch) {
                            const _stateRaw = _stateMatch[1];
                            const _abbr = _stateRaw.length === 2 ? _stateRaw.toUpperCase() : (Object.entries({ alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY' }).find(([k]) => k === _stateRaw.toLowerCase())?.[1] ?? null);
                            if (_abbr && _abbr !== 'VA') { // skip VA (veteran) false match
                                const _countyMatch = question.match(/\b(\w[\w\s]{2,25}?)\s+(?:county|co\.)/i);
                                const _countyName = _countyMatch ? _countyMatch[1].trim() : '';
                                if (_countyName) {
                                    const _natLimits = getNationalLimits(_abbr, _countyName);
                                    vaCountyData = { countyName: _countyName, stateAbbr: _abbr, limit: _natLimits.conforming.units1, isHighBalance: _natLimits.isHighBalance };
                                }
                            }
                        }
                    }
                } catch (_e) { /* county lookup is best-effort */ }
                calcCard = buildVACard(result, calcAssumptions, fredRateForCard, vaCountyData);
                calcDebugModel = 'calcEngine-va';
                injectCmaChip(calcCard);

            } else if (calcDispatch.type === 'va_needs_input') {
                calcCard = buildVANeedsInputCard(fredRateForCard);
                calcDebugModel = 'va_needs_input';

            } else if (calcDispatch.type === 'buydown' && calcDispatch.params) {
                calcCard = buildBuydownCard(calcDispatch.params as any, calcAssumptions, fredRateForCard);
                calcDebugModel = 'calcEngine-buydown';

            } else if (calcDispatch.type === 'seller_credit' && calcDispatch.params) {
                calcCard = buildSellerCreditCard(calcDispatch.params as any, calcAssumptions, fredRateForCard);
                calcDebugModel = 'calcEngine-seller-credit';

            } else if (calcDispatch.type === 'jumbo' && calcDispatch.params) {
                const result = calcJumbo(calcDispatch.params as any);
                calcCard = buildJumboCard(result, calcAssumptions, fredRateForCard);
                calcDebugModel = 'calcEngine-jumbo';
                injectCmaChip(calcCard);
                // Also attach the jumbo affordability slider so the interactive zone card shows alongside the calc
                const _jp2 = calcDispatch.params as any;
                calcCard.jumboAffordabilitySlider = {
                    price:             _jp2.purchasePrice,
                    downPct:           _jp2.downPaymentPct ?? 20,
                    baseRate:          _jp2.annualRatePct ?? fred?.mort30Avg ?? 6.75,
                    countyLimit:       NATIONAL_CONFORMING_BASELINE.units1,
                    nationalBaseline:  NATIONAL_CONFORMING_BASELINE.units1,
                    county:            undefined,
                    taxRate:           _jp2.propertyTaxRate ?? 0.011,
                    insRate:           0.003,
                };

            } else if (calcDispatch.type === 'jumbo_needs_input') {
                calcCard = buildVANeedsInputCard(fredRateForCard); // reuse needs-input pattern — jumbo-specific card optional later
                calcDebugModel = 'jumbo_needs_input';

            } else if (calcDispatch.type === 'jumbo_affordability') {
                // ── Jumbo Affordability Slider Card ──
                const _jp = (calcDispatch.params ?? {}) as any;
                const _jCounty = _jp.county ?? null;
                const _jLimits = _jCounty ? getCALoanLimits(_jCounty) : null;
                const _jCountyLimit = _jLimits?.conformingLimit ?? NATIONAL_CONFORMING_BASELINE.units1;
                const _jTaxRate = _jp.taxRate ?? (_jLimits ? getCACountyTaxRate(_jLimits.county) : null) ?? 0.011;
                const _jInsRate = _jp.insRate ?? 0.003;
                calcCard = buildJumboAffordabilityCard({
                    purchasePrice: _jp.purchasePrice ?? 1_500_000,
                    downPaymentPct: _jp.downPaymentPct ?? 20,
                    annualRatePct: _jp.annualRatePct ?? (fred?.mort30Avg ?? 6.75),
                    countyLimit: _jCountyLimit,
                    nationalBaseline: NATIONAL_CONFORMING_BASELINE.units1,
                    county: _jLimits?.county,
                    taxRate: _jTaxRate,
                    insRate: _jInsRate,
                    fredRateStr: fredRateForCard,
                });
                calcDebugModel = 'calcEngine-jumbo-affordability';

            } else if (calcDispatch.type === 'loan_limits') {
                // ── Nationwide 2026 Loan Limits explorer ──
                // Resolve state + county from: paramOverrides > question text > fallback CA/LA
                const _llCountyOverride = (paramOverrides as any)?.loanLimitsCounty as string | undefined;
                const _llStateOverride  = (paramOverrides as any)?.loanLimitsState as string | undefined;

                // Detect state from question text
                const _qLower = question.toLowerCase();
                let _llState: string = _llStateOverride?.toUpperCase() ?? 'CA';

                // Only auto-detect state if no override supplied
                if (!_llStateOverride) {
                    // Priority 1: CA ZIP (9[0-6]xxxx) → always CA
                    const _caZipEarly = question.match(/\b(9[0-6]\d{3})\b/);
                    if (_caZipEarly) {
                        _llState = 'CA';
                    } else {
                        // Priority 2: full state name match (case-insensitive — safe, no false positives)
                        const _stateEntries = Object.entries(STATE_NAMES);
                        for (const [code, name] of _stateEntries) {
                            if (code === 'CA') continue;
                            if (_qLower.includes(name.toLowerCase())) { _llState = code; break; }
                        }
                        // Priority 3: UPPERCASE state code in original text (e.g. "Hayward, CA" or "TX" typed explicitly)
                        // Only match uppercase to avoid "me", "in", "or", "ok" false positives
                        if (_llState === 'CA') {
                            const _ucMatch = question.match(/\b([A-Z]{2})\b/g) ?? [];
                            for (const uc of _ucMatch) {
                                if (uc !== 'CA' && STATE_NAMES[uc]) { _llState = uc; break; }
                            }
                        }
                        // Priority 4: well-known city/region names that imply a state
                        if (_llState === 'CA') {
                            if (/\b(florida)\b/i.test(question)) _llState = 'FL';
                            else if (/\b(texas|dallas|houston|austin|san antonio)\b/i.test(question)) _llState = 'TX';
                            else if (/\b(new york|nyc|brooklyn|manhattan|queens|bronx)\b/i.test(question)) _llState = 'NY';
                            else if (/\b(seattle|washington state)\b/i.test(question)) _llState = 'WA';
                            else if (/\b(washington dc|district of columbia)\b/i.test(question)) _llState = 'DC';
                            else if (/\b(colorado|denver|boulder)\b/i.test(question)) _llState = 'CO';
                            else if (/\b(hawaii|honolulu|maui)\b/i.test(question)) _llState = 'HI';
                            else if (/\b(alaska|anchorage)\b/i.test(question)) _llState = 'AK';
                            else if (/\b(virginia|northern virginia|nova)\b/i.test(question) && !/\bwest virginia\b/i.test(question)) _llState = 'VA';
                            else if (/\b(massachusetts|boston|cambridge)\b/i.test(question)) _llState = 'MA';
                            else if (/\b(new jersey|jersey city|newark)\b/i.test(question)) _llState = 'NJ';
                            else if (/\b(maryland|bethesda|annapolis)\b/i.test(question)) _llState = 'MD';
                            else if (/\b(connecticut|greenwich|stamford)\b/i.test(question)) _llState = 'CT';
                            else if (/\b(utah|salt lake)\b/i.test(question)) _llState = 'UT';
                            else if (/\b(wyoming|jackson hole)\b/i.test(question)) _llState = 'WY';
                            else if (/\b(idaho|boise|sun valley)\b/i.test(question)) _llState = 'ID';
                            else if (/\b(arizona|phoenix|scottsdale|tucson)\b/i.test(question)) _llState = 'AZ';
                            else if (/\b(nevada|las vegas|reno)\b/i.test(question)) _llState = 'NV';
                            else if (/\b(oregon|portland|bend)\b/i.test(question)) _llState = 'OR';
                        }
                    }
                }

                const _isCA = _llState === 'CA';
                let _llCounty: string;
                let _llConforming: number;
                let _llTaxRate: number;
                let _llInsRate: number;

                if (_isCA) {
                    // CA path: use precise CA county data
                    _llCounty = 'LOS ANGELES';
                    if (_llCountyOverride && /^\d{5}$/.test(_llCountyOverride.trim())) {
                        // Override looks like a ZIP — resolve to county name
                        const _fromOverrideZip = getCACountyByZip(_llCountyOverride.trim());
                        if (_fromOverrideZip) _llCounty = _fromOverrideZip;
                    } else if (_llCountyOverride) {
                        _llCounty = _llCountyOverride.toUpperCase().replace(/\s+COUNTY$/i, '').trim();
                    } else {
                        // Try ZIP from question
                        const _zipMatch = question.match(/\b(9[0-6]\d{3})\b/);
                        if (_zipMatch) {
                            const _fromZip = getCACountyByZip(_zipMatch[1]);
                            if (_fromZip) _llCounty = _fromZip;
                        } else {
                            const _wordMatches = question.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) ?? [];
                            for (const w of _wordMatches) {
                                const _t = getCALoanLimits(w, 1);
                                if (_t) { _llCounty = _t.county; break; }
                            }
                        }
                    }
                    const _caLimits = getCALoanLimits(_llCounty, 1);
                    _llConforming = _caLimits?.conformingLimit ?? 832_750;
                    _llTaxRate    = getCACountyTaxRate(_llCounty);
                    _llInsRate    = getCACountyInsRate(_llCounty);
                } else {
                    // Non-CA path: use national limits data
                    const _stateCounties = HIGH_COST_COUNTIES[_llState] ?? [];
                    // Pick county from override or first high-cost county or generic name
                    if (_llCountyOverride) {
                        _llCounty = _llCountyOverride.toUpperCase().replace(/\s+COUNTY$/i, '').trim();
                    } else if (_stateCounties.length > 0) {
                        // Try to match county name from question
                        const _qWords = question.toUpperCase();
                        const _matched = _stateCounties.find(c => _qWords.includes(c.county.replace(/ COUNTY$/, '').replace(/ BOROUGH$/, '')));
                        _llCounty = _matched?.county ?? _stateCounties[0].county;
                    } else {
                        _llCounty = 'STANDARD';
                    }
                    const _natLimits = getNationalLimits(_llState, _llCounty);
                    _llConforming = _natLimits.conforming.units1;
                    _llTaxRate    = 0.011; // national average fallback
                    _llInsRate    = 0.003;
                }

                const _llBaseline  = NATIONAL_CONFORMING_BASELINE.units1;
                const _llBaseRate  = fred?.mort30Avg ?? 6.75;
                const _llParamPrice = (paramOverrides as any)?.purchasePrice;
                const _llPrice     = _llParamPrice ?? Math.round(_llConforming * 1.1 / 25000) * 25000;
                const _llDownPct   = (paramOverrides as any)?.downPaymentPct ?? 20;

                calcCard = buildLoanLimitsCard({
                    county:           _llCounty,
                    state:            _llState,
                    stateName:        STATE_NAMES[_llState] ?? _llState,
                    conformingLimit:  _llConforming,
                    nationalBaseline: _llBaseline,
                    price:            _llPrice,
                    downPct:          _llDownPct,
                    taxRate:          _llTaxRate,
                    insRate:          _llInsRate,
                    baseRate:         _llBaseRate,
                    zip:              (paramOverrides as any)?.zip,
                });
                calcDebugModel = 'calcEngine-loan-limits';

            } else if (calcDispatch.type === 'conventional' && calcDispatch.params &&
                !/how much income|what income|what salary|income.*(?:need|qualify|required?)|(?:need|qualify).{0,20}income/i.test(question)) {
                const result = calcConventional(calcDispatch.params as any);
                calcCard = buildConventionalCard(result, calcAssumptions, fredRateForCard);
                calcDebugModel = 'calcEngine-conventional';
                injectCmaChip(calcCard);

            } else if (calcDispatch.type === 'affordability' && calcDispatch.params) {
                const result = calcAffordability(calcDispatch.params as any);
                calcCard = buildAffordabilityCard(result, calcAssumptions, geoFeatures);
                calcDebugModel = 'calcEngine-affordability';
                injectCmaChip(calcCard);

            } else if (calcDispatch.type === 'affordability_needs_input') {
                calcCard = buildAffordabilityNeedsInputCard(fred?.mort30Avg ?? undefined);
                calcDebugModel = 'affordability_needs_input';

            } else if (calcDispatch.type === 'lab') {
                calcCard = buildLabCard();
                calcDebugModel = 'calcEngine-lab';
            } else if (calcDispatch.type === 'uw_starter') {
                calcCard = buildUWStarterCard();
                calcDebugModel = 'calcEngine-uw-starter';
            } else if (calcDispatch.type === 'about') {
                calcCard = buildAboutCard();
                calcDebugModel = 'calcEngine-about';
            } else if (calcDispatch.type === 'about_trust') {
                calcCard = buildAboutTrustCard();
                calcDebugModel = 'calcEngine-about-trust';
            } else if (calcDispatch.type === 'about_difference') {
                calcCard = buildAboutDifferenceCard();
                calcDebugModel = 'calcEngine-about-difference';
            } else if (calcDispatch.type === 'about_data') {
                calcCard = buildAboutDataCard();
                calcDebugModel = 'calcEngine-about-data';
            } else if (calcDispatch.type === 'about_founder') {
                calcCard = buildAboutFounderCard();
            } else if (calcDispatch.type === 'how_it_works') {
                calcCard = buildHowItWorksCard();
                calcDebugModel = 'calcEngine-about-founder';
            }

        } catch (calcErr: any) {
            console.error('[CalcEngine] Error:', calcDispatch.type, calcErr?.message);
            calcCard = null; // fall through to old system on error
        }

        if (calcCard) {
            const answerWithSources = calcCard.answer
                + (fred.mort30Avg != null
                    ? `\n\n**FRED snapshot**: 10y=${fred.tenYearYield}%, 30y mtg avg=${fred.mort30Avg}%, spread=${fred.spread} (${fred.asOf})`
                    : '');

            // HR-MEMORY:WRITE — store calc result to memory_items so follow-ups can read it
            if (supabase && memoryThreadId && calcCard.memoryPayload) {
                try {
                    await supabase.from('memory_items').insert({
                        memory_thread_id: memoryThreadId,
                        kind: 'scenario_snapshot',
                        content_text: calcCard.memoryPayload.plain_english_summary || question,
                        content_json: {
                            scenario_inputs: calcCard.memoryPayload.scenario_inputs ?? null,
                            computed_financials: calcCard.memoryPayload.computed_financials ?? null,
                            monthly_payment: calcCard.memoryPayload.monthly_payment ?? null,
                            question: question,
                            model: calcDebugModel,
                            userId,
                            chat_id: chatId,
                        },
                        tags: ['scenario', 'auto'],
                    });
                } catch (memErr: any) {
                    console.warn('[CalcEngine] memory_items write failed:', memErr?.message);
                }
            }

            // Skip calc engine return for CMA/Property Intelligence requests
            const _cmaEarlyCheck = paramOverrides?.cmaAddress && /intelligence report|property report|cma|market analysis/i.test(question);
            if (!_cmaEarlyCheck) {
            return noStore({
                ok: true,
                memory_thread_id: memoryThreadId,
                chat_id: chatId,
                project_id: projectId,
                chat_thread_id: chatThreadId,
                route: 'answers',
                intent,
                path,
                tag,
                generatedAt,
                usedFRED,
                usedTavily,
                fred,
                topSources,
                grok: {
                    answer: calcCard.answer,
                    next_step: calcCard.next_step,
                    follow_up: (calcCard as any).labModules ? null : calcCard.follow_up,
                    follow_up_chips: calcCard.follow_up_chips,
                    confidence: calcCard.confidence,
                },
                interactiveSlider: calcCard.interactiveSlider ?? null,
                convHBSlider: (calcCard as any).convHBSlider ?? null,
                incomeQualifySlider: (calcCard as any).incomeQualifySlider ?? null,
                fhaSlider: (calcCard as any).fhaSlider ?? null,
                affordabilitySlider: calcCard.affordabilitySlider ?? null,
                dscrSlider: calcCard.dscrSlider ?? null,
                refiSlider: calcCard.refiSlider ?? null,
                loanLimitsSlider: calcCard.loanLimitsSlider ?? null,
                jumboAffordabilitySlider: calcCard.jumboAffordabilitySlider ?? null,
                lenderChecklist: calcCard.lenderChecklist ?? null,
                labModules: (calcCard as any).labModules ?? null,
                debug: {
                    requestedModel: 'calcEngine',
                    servedModel: calcDebugModel,
                    promptChars: question.length,
                    elapsedMs: 0,
                    requestId: `calc-${Date.now()}`,
                    parseMode: 'deterministic',
                    repaired: false,
                },
                data_freshness: `Live (calcEngine-deterministic)`,
                message: calcCard.answer,
                answerMarkdown: (calcCard as any).labModules ? null : buildAnswerMarkdown(answerWithSources),
                followUp: null,
                follow_up_chips: [],
            });
            } // end !_cmaEarlyCheck
        }
    }
    // ============================================================
    // END UNIFIED CALC ENGINE DISPATCH — old system continues below
    // ============================================================

    // ========== MORTGAGE CALCULATOR BYPASS ==========
    // Guard: skip for CMA/Property Intelligence requests — seed text like
    // "Property intelligence report: ... $932k" would otherwise misroute to calcEngine-conventional.
    const _cmaEarlyParams = (body as any)?.paramOverrides;
    const _isCMAEarly = !!_cmaEarlyParams?.cmaAddress && /intelligence report|property report|cma|market analysis/i.test(question);
    let mortgageAnswer: any = null;
    let mortgageCalcContext = "";

    // Broad detection - any question with a price + mortgage context
    /**
     * Returns years until PMI can be requested for removal at 80% LTV of home value.
     * Uses actual amortization schedule — not a formula approximation.
     */
    function calcPMIRemovalYears(loanAmount: number, homePrice: number, annualRate: number, termYears: number): number {
        const target = homePrice * 0.80;
        const monthlyRate = annualRate / 100 / 12;
        const n = termYears * 12;
        const payment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
        let balance = loanAmount;
        for (let month = 1; month <= n; month++) {
            balance -= (payment - balance * monthlyRate);
            if (balance <= target) return Math.round(month / 12 * 10) / 10;
        }
        return termYears;
    }

    function isMortgageCalculation(q: string): boolean {
        // Follow-up phrasing without explicit loan type — let Grok handle with thread memory
        const isFollowUpPhrasing =
            /\bwhat\s+if\b/i.test(q) ||
            /\bprice\s+is\s+now\b/i.test(q) ||
            /\bnow\s+\$[\d,]+/i.test(q) ||
            /\binstead\b/i.test(q) ||
            /\bsame\s+(property|home|house|but|scenario)\b/i.test(q);
        const hasExplicitLoanType = /\bfha\b|\bconventional\b|\bva\b|\busda\b|\bjumbo\b|\bdscr\b/i.test(q);
        if (isFollowUpPhrasing && !hasExplicitLoanType) return false;

        const hasPrice = /\$\s*[\d,]+k?\b/i.test(q);
        const hasMortgageContext = /home|house|property|loan|mortgage|buying|purchase|condo|townhouse/i.test(q);
        const isFHA = /\bfha\b/i.test(q);
        const isAffordability = isAffordabilityQuestion(q);
        // Income qualification questions need income back-calculation, not payment breakdown
        const isIncomeQualify = /how much income|what income|what salary|income.*(?:need|qualify|required?)|(?:need|qualify).{0,20}income/i.test(q);
        // "Show me my monthly payment on a $Xk home" — specific-home payment lookup → fha-calculator
        // Without this, general AI recycles prior rate scenario numbers (e.g. Q14 5.5% numbers used at 5.98%)
        const isPaymentLookup = /(?:show me|what.?s|what is|calculate|tell me).{0,20}(?:monthly|payment).{0,30}\$\s*[\d,]+|monthly payment on.{0,20}\$\s*[\d,]+/i.test(q);
        const isDSCR = isDSCRQuestion(q);
        // DSCR/investment questions must never route to mortgage calc — they need their own handler
        return (hasPrice && hasMortgageContext && !isFHA && !isAffordability && !isIncomeQualify && !isDSCR) || isPaymentLookup;
    }

    // HARD OVERRIDE: "Ask Underwriting:" prefix bypasses ALL calculators
    const isAskUnderwriting = /^\s*ask\s+underwriting\s*:/i.test(question);

    // For mortgage follow-ups like "what if the home is $560k", check if conversation
    // has income/savings context. If so, flag for FHA reroute (processed in FHA block below).
    let mortgageRerouteToFHA: { price: number; income: number; savings: number } | null = null;
    if (!isAskUnderwriting && isMortgageCalculation(question)) {
        const histText = conversationHistory || '';
        const incMatch = question.match(/(?:make|earn|income|salary)[^\d]*\$?\s*([\d,]+)\s*k?\b/i) ||
            histText.match(/(?:make|earn|income|salary)[^\d]*\$?\s*([\d,]+)\s*k?\b/i);
        let ctxIncome = incMatch ? parseFloat(incMatch[1].replace(/,/g, '')) : 0;
        if (ctxIncome && ctxIncome < 1000) ctxIncome *= 1000;

        const savMatch = question.match(/\$?\s*([\d,]+)\s*k?\s*(?:saved|savings)\b/i) ||
            histText.match(/\$?\s*([\d,]+)\s*k?\s*(?:saved|savings)\b/i);
        let ctxSavings = savMatch ? parseFloat(savMatch[1].replace(/,/g, '')) : 0;
        if (ctxSavings && ctxSavings < 1000) ctxSavings *= 1000;

        const priceMatch2 = question.match(/\$\s*([\d,]+)\s*k?\b/i);
        let ctxPrice = priceMatch2 ? parseFloat(priceMatch2[1].replace(/,/g, '')) : 0;
        if (ctxPrice && ctxPrice < 10000) ctxPrice *= 1000;

        if (ctxIncome && ctxPrice) {
            console.log('[Mortgage->FHA] Will reroute to FHA calc:', { ctxPrice, ctxIncome, ctxSavings });
            mortgageRerouteToFHA = { price: ctxPrice, income: ctxIncome, savings: ctxSavings };
        }
    }

    if (!isAskUnderwriting && !mortgageRerouteToFHA && isMortgageCalculation(question)) {
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

${monthlyPMI > 0 ? `⚠️ **PMI applies** — less than 20% down. You can request removal once balance reaches 80% of home value (~${calcPMIRemovalYears(result.loanAmount, result.homePrice, params.rate!, params.termYears!)} years). Auto-cancels at 78% LTV per federal law.` : '✅ **No PMI** — 20%+ down payment.'}

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

                mortgageAnswer = null; // disabled — calcEngine-conventional handles all conventional questions

                // Keep context for Grok fallback (if mortgage answer somehow null)
                mortgageCalcContext = `MORTGAGE CALCULATION (PRE-CALCULATED):\n- Monthly P&I: $${result.monthlyPI}\n- Total Interest: $${result.totalInterest}\nCRITICAL: Use these numbers EXACTLY.`;

            } catch (err: any) {
                console.error('[Mortgage Calc] Error:', err.message, err.stack);
            }
        }
    }
    // ========== END MORTGAGE CALCULATOR BYPASS ==========

    // ========== PROPERTY INTELLIGENCE REPORT (CMA CARD) ==========
    const cmaParams = (body as any)?.paramOverrides;
    const isCMARequest = !!cmaParams?.cmaAddress && /intelligence report|property report|cma|market analysis/i.test(question);

    // ── Pro gate: Full CMA / Property Intelligence is a Pro-only feature ────────
    if (isCMARequest) {
        const [userPlanResult, adminBypass] = await Promise.all([
            userId ? getUserPlan(userId) : Promise.resolve(null),
            isAdminId(userId),                    // admins always bypass gate
        ]);
        const userPlan = userPlanResult?.plan ?? 'free';
        if (!adminBypass && (userPlan === 'free' || userPlan === 'plus')) {
            return noStore({
                ok: true,
                memory_thread_id: memoryThreadId,
                chat_id: chatId,
                project_id: projectId,
                chat_thread_id: chatThreadId,
                route: 'answers',
                intent,
                path: 'pro_gate',
                tag: null,
                generatedAt: new Date().toISOString(),
                usedFRED: false,
                usedTavily: false,
                fred,
                topSources: [],
                message: 'Property Intelligence Reports are a Pro feature.',
                proGate: {
                    feature: 'Property Intelligence Report',
                    featureKey: 'cma',
                    description: 'Instant rent estimates, cap rate, DSCR analysis, and investment cash flow — everything buyers and investors need in one report.',
                },
            } as any);
        }
    }

    if (isCMARequest && XAI_API_KEY) {
        const addr:     string = String(cmaParams.cmaAddress ?? '');
        const city:     string = String(cmaParams.cmaCity    ?? '');
        const state:    string = String(cmaParams.cmaState   ?? '');
        const beds:     number = Number(cmaParams.cmaBeds    ?? 0);
        const baths:    number = Number(cmaParams.cmaBaths   ?? 0);
        const sqft:     number = Number(cmaParams.cmaSqft    ?? 0);
        const taxAnnual:number = Number(cmaParams.cmaTaxAnnual ?? 0);
        const taxRate:  number = Number(cmaParams.cmaTaxRate ?? 0.011);
        const liveRate: number = Number(cmaParams.cmaLiveRate ?? fred?.mort30Avg ?? 6.5);
        const photoUrl: string = String(cmaParams.cmaPhotoUrl ?? '');

        // Price from chip params — no external AVM call
        const avmLow: number | null = null;
        const avmHigh: number | null = null;
        const rentMoEstimate: number | null = null;
        const rentMoLow: number | null = null;
        const rentMoHigh: number | null = null;
        const price: number = Number(cmaParams.cmaPrice ?? 0);

        const annualIns = Math.max(1200, Math.round(price * 0.005));

        // Deterministic PITI (20% down)
        const cmaConv = calcConventional({ purchasePrice: price, downPaymentPct: 20, annualRatePct: liveRate, termYears: 30, propertyTaxRate: taxRate * 100, annualInsurance: annualIns });
        const cmaPiti = Math.round(cmaConv.monthlyPI + cmaConv.monthlyTax + cmaConv.monthlyInsurance);
        const cmaLoan = Math.round(price * 0.80);
        const cmaDown = Math.round(price * 0.20);
        const psfStr  = sqft > 0 ? `$${Math.round(price / sqft).toLocaleString()}/sqft` : 'N/A';
        const priceFmtCMA = price >= 1_000_000 ? `$${(price / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(price / 1000)}k`;

        // Deterministic rate sensitivity (3 scenarios)
        const rateScenarios = [-0.625, 0, 0.625].map(delta => {
            const r = parseFloat((liveRate + delta).toFixed(3));
            const c = calcConventional({ purchasePrice: price, downPaymentPct: 20, annualRatePct: r, termYears: 30, propertyTaxRate: taxRate * 100, annualInsurance: annualIns });
            const piti = Math.round(c.monthlyPI + c.monthlyTax + c.monthlyInsurance);
            return { rate: r, piti, incomeNeeded: Math.round((piti / 0.43) * 12) };
        });

        // ── INVESTMENT INTELLIGENCE LAYER ─────────────────────────────────────────
        // Investor scenario: 25% down, DSCR rate (live + 1.25% premium — industry standard
        // for non-owner-occupied DSCR loans vs primary residence rates)
        const dscrRatePct    = parseFloat((liveRate + 1.25).toFixed(3));
        const dscrConv       = calcConventional({ purchasePrice: price, downPaymentPct: 25, annualRatePct: dscrRatePct, termYears: 30, propertyTaxRate: taxRate * 100, annualInsurance: annualIns });
        const dscrPI         = Math.round(dscrConv.monthlyPI);   // Principal + Interest only
        const dscrPITI       = Math.round(dscrConv.monthlyPI + dscrConv.monthlyTax + dscrConv.monthlyInsurance);
        const dscrDown       = Math.round(price * 0.25);
        const closingCostEst = Math.round(price * 0.02);         // ~2% standard investor closing cost estimate

        // Metrics — only computed when rent data is available
        const rentMo = rentMoEstimate as number | null;
        // Gross yield: raw rent income vs property value (pre-expense benchmark)
        const grossYield: number | null = rentMo && price > 0
            ? parseFloat(((rentMo * 12 / price) * 100).toFixed(2))
            : null;
        // Cap rate: NOI / value — using 35% expense ratio (industry standard for SFR:
        // property mgmt ~10%, vacancy ~5%, maintenance ~10%, insurance/misc ~10%)
        const capRate: number | null = rentMo && price > 0
            ? parseFloat(((rentMo * 12 * 0.65 / price) * 100).toFixed(2))
            : null;
        // DSCR ratio: gross rent / PI payment (lender convention — gross rent, not NOI)
        // Most DSCR lenders require ≥1.25; some accept ≥1.0 with stronger down
        const dscrRatio: number | null = rentMo && dscrPI > 0
            ? parseFloat((rentMo / dscrPI).toFixed(2))
            : null;
        // Monthly cash flow after full PITI (25% down investor scenario)
        const monthlyCashFlow: number | null = rentMo !== null
            ? Math.round(rentMo - dscrPITI)
            : null;
        // Cash-on-cash return: annualized cash flow / total cash deployed (down + closing costs)
        const cashOnCash: number | null = monthlyCashFlow !== null && dscrDown > 0
            ? parseFloat(((monthlyCashFlow * 12 / (dscrDown + closingCostEst)) * 100).toFixed(2))
            : null;
        // DSCR qualifier label for prompt context
        const dscrLabel = dscrRatio === null ? 'unavailable — rent data not available'
            : dscrRatio >= 1.25 ? `${dscrRatio} — strong (lender-eligible)`
            : dscrRatio >= 1.00 ? `${dscrRatio} — at threshold (some lenders accept)`
            : `${dscrRatio} — below threshold (higher rent or larger down needed)`;
        // ── END INVESTMENT INTELLIGENCE LAYER ─────────────────────────────────────

        // Tavily: city market + property listing details
        const [tavCity, tavAddress] = await Promise.all([
            askTavily(req, `${city} ${state} real estate market trends home prices inventory 2026`, { depth: 'basic', max: 5 }),
            askTavily(req, `${addr} listing details year built sqft lot size features amenities`, { depth: 'basic', max: 5 }),
        ]);
        console.log(`[CMA Tavily] city=${city} cityOk=${tavCity.ok} cityAnswer=${!!tavCity.answer} addrOk=${tavAddress.ok} addrAnswer=${!!tavAddress.answer}`);

        const tavilyCtx = [
            tavCity.answer    ? `CITY MARKET DATA:\n${tavCity.answer}`    : '',
            tavAddress.answer ? `PROPERTY LISTING DATA:\n${tavAddress.answer}` : '',
            ...(tavAddress.results.slice(0, 4).map(r => `- ${r.title}: ${r.content?.slice(0, 500)}`)),
            ...(tavCity.results.slice(0, 2).map(r => `- ${r.title}: ${r.content?.slice(0, 200)}`)),
        ].filter(Boolean).join('\n').slice(0, 2800);

        const isJumboCMA = cmaLoan > 832_750;

        const cmaPrompt = `You are HomeRates.ai's Property Intelligence Engine. Output ONLY valid JSON.

HARD RULES — violations destroy consumer trust:
1. Use ONLY the deterministic financials below — never recalculate math.
2. PROPERTY HIGHLIGHTS: Include a feature ONLY if it appears verbatim or near-verbatim in the LIVE DATA section below. If a feature (views, ADU, pool, guest house, ocean view, mountain view, or any amenity) is NOT explicitly stated in LIVE DATA, omit it entirely. Do not infer, assume, or embellish.
3. LISTING STATUS: Omit status entirely unless LIVE DATA explicitly states Active, Contingent, Pending, or Under Contract for this specific address.
4. Use ONLY observed market data; no forward projections or forecasts.
5. Strictly neutral language — no "you should", no "verify with agent", no "suits [buyer type]".
6. Frame as trade-offs only: "X means Y" not "you should do X".

PROPERTY (these are the ONLY facts about this property — treat as ground truth):
Address: ${addr}
Est. Value: $${price.toLocaleString()} (from chip params)
Listed: ${priceFmtCMA} | ${beds}bd / ${baths}ba / ${sqft.toLocaleString()} sqft | ${psfStr}
Taxes: $${taxAnnual.toLocaleString()}/yr (${(taxRate * 100).toFixed(2)}% effective)

DETERMINISTIC FINANCIALS (do not recalculate):
- Down payment (20%): $${cmaDown.toLocaleString()}
- Loan: $${cmaLoan.toLocaleString()}${isJumboCMA ? ' — JUMBO' : ''}
- Monthly PITI: $${cmaPiti.toLocaleString()}/mo at ${liveRate}% 30yr fixed
- Income required @ 43% DTI: $${Math.round((cmaPiti / 0.43) * 12).toLocaleString()}/yr

INVESTMENT METRICS (do not recalculate, use verbatim):
- Estimated monthly rent: ${rentMo ? `$${rentMo.toLocaleString()}/mo (range $${(rentMoLow as number | null)?.toLocaleString() ?? '?'} – $${(rentMoHigh as number | null)?.toLocaleString() ?? '?'})` : 'unavailable'}
- Gross yield: ${grossYield !== null ? `${grossYield}%` : 'N/A'}
- Cap rate (35% expense ratio): ${capRate !== null ? `${capRate}%` : 'N/A'}
- DSCR @ 25% down / ${dscrRatePct}% (investor rate): ${dscrLabel}
- Monthly cash flow after PITI: ${monthlyCashFlow !== null ? `$${monthlyCashFlow.toLocaleString()}/mo` : 'N/A'}
- Cash-on-cash return: ${cashOnCash !== null ? `${cashOnCash}%/yr` : 'N/A'}

LIVE DATA (Tavily — extract verbatim facts only; do not fabricate MLS numbers, sale prices, or amenities):
${tavilyCtx || 'No live data available — use general market knowledge for city/neighborhood context only; label any estimates as approximate.'}

Generate a markdown report with these exact ## sections in order:
1. ## Property Highlights — list ONLY features explicitly stated in LIVE DATA above (year built, lot size, garage, home type, and any amenities mentioned by name). If LIVE DATA is silent on a feature, omit that bullet. Do not mention views, ADU, or any amenity not found word-for-word in the data above.
2. ## Market Snapshot — observed price data, days on market, inventory trends from LIVE DATA. Observed facts only; no forecasts.
3. ## Value Insight — price/sqft context vs comps from LIVE DATA. CRITICAL: use ONLY the AVM value from the PROPERTY section as the authoritative price. Never include monthly/rental figures, or any per-sqft value below $100, as they are rental data contaminants from LIVE DATA.
4. ## Decision Considerations — one or two sub-sections. Always include **Primary Residence**. Only include **Investment** if rent data IS available in INVESTMENT METRICS above — if so, reference rent, DSCR, cap rate, and cash flow verbatim as trade-offs only. If rent data shows "unavailable", do NOT write an Investment sub-section header or any Investment content at all.
5. ## Key Trade-offs — 3-5 bullet points covering carrying cost, financing risk, liquidity, and property-specific factors found in LIVE DATA.

No Rate Sensitivity section (computed separately). 300-400 words total. Bullet points throughout.

Output JSON:
{
  "answer": "## 🏡 Property Intelligence Report\\n**${addr}**\\n\\n[markdown report — start directly with ## Property Highlights, do not repeat the title]",
  "follow_up": "single most relevant follow-up question a buyer would ask",
  "confidence": "Grok synthesis · Live market data ${new Date().toISOString().slice(0, 10)}",
  "follow_up_chips": [
    {"label": "Run DSCR rental analysis", "seed": "DSCR analysis on ${addr} at ${priceFmtCMA} — what rent covers the mortgage?"},
    {"label": "Rate sensitivity — payment at 5.75%", "seed": "What is the monthly payment on ${priceFmtCMA} at 5.75% with 20% down?"},
    {"label": "What income qualifies for this home?", "seed": "What income do I need to qualify for a ${priceFmtCMA} home?"}
  ]
}`;

        const cmaResult = await callGrokOnce(cmaPrompt, { maxTokens: 2000 });

        if (cmaResult.ok && cmaResult.grokFinal?.answer) {
            const cmaFinal = cmaResult.grokFinal;

            // Append deterministic rate sensitivity table to markdown (for PDF/share consistency)
            const rateTable = [
                `\n\n## 📈 Rate Sensitivity`,
                `| Rate | Monthly PITI | Income Needed |`,
                `|------|-------------|---------------|`,
                ...rateScenarios.map(s => {
                    const inc = s.incomeNeeded;
                    const incFmt = inc >= 1_000_000
                        ? `$${(inc / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M/yr`
                        : `$${Math.round(inc / 1000)}k/yr`;
                    return `| **${s.rate.toFixed(3)}%${s.rate === liveRate ? ' ◀' : ''}** | $${s.piti.toLocaleString()}/mo | ${incFmt} |`;
                }),
                `\n*20% down · 30yr fixed · 43% DTI · Calc engine verified*`,
            ].join('\n');
            cmaFinal.answer = cmaFinal.answer + rateTable;

            // Build structured chips with paramOverrides so downstream calcs pre-fill correctly
            // VA loans are only practical under ~$2M (no-down jumbo is portfolio, not VA)
            const _cmaBase = { cmaAddress: addr, cmaCity: city, cmaState: state, cmaPrice: price, cmaBeds: beds, cmaBaths: baths, cmaSqft: sqft, cmaTaxAnnual: taxAnnual, cmaTaxRate: taxRate, cmaLiveRate: liveRate, cmaPhotoUrl: photoUrl };
            const _cmaLoanType = isJumboCMA ? 'jumbo' : undefined;
            const _cmaDown = isJumboCMA ? 25 : 20;

            // DSCR chip: pre-fill rent estimate for downstream calc
            // Label dynamically shows coverage % when rent data is available
            const dscrCoverage = rentMo && dscrPITI > 0 ? Math.round((rentMo / dscrPITI) * 100) : null;
            const dscrChipLabel = rentMo && dscrCoverage !== null
                ? `DSCR — $${rentMo.toLocaleString()}/mo rent covers ${dscrCoverage}% of payment`
                : `DSCR — what rent covers this at ${priceFmtCMA}?`;
            const dscrChipSeed = rentMo
                ? `DSCR analysis — ${priceFmtCMA} at ${dscrRatePct}% with 25% down. Rent estimate: $${rentMo.toLocaleString()}/mo. DSCR ratio: ${dscrRatio ?? 'N/A'}. Run full DSCR breakdown.`
                : `DSCR rental analysis — what monthly rent covers ${priceFmtCMA} with 25% down at ${dscrRatePct}%?`;

            const cmaChips = [
                {
                    label: dscrChipLabel,
                    seed: dscrChipSeed,
                    paramOverrides: {
                        purchasePrice: price,
                        downPaymentPct: 25,
                        annualRatePct: dscrRatePct,
                        isDSCR: true,
                        ...(rentMo ? { grossMonthlyRent: rentMo } : {}),
                        ..._cmaBase,
                    },
                },
                {
                    label: `Rate sensitivity — payment at 5.75%`,
                    seed: `What is the monthly payment on ${priceFmtCMA} at 5.75% with ${_cmaDown}% down?`,
                    paramOverrides: { purchasePrice: price, downPaymentPct: _cmaDown, annualRatePct: 5.75, ...(_cmaLoanType ? { loanType: _cmaLoanType } : {}), ..._cmaBase },
                },
                {
                    label: `What income qualifies for this home?`,
                    seed: `What income do I need to qualify for a ${priceFmtCMA} home?`,
                    paramOverrides: { purchasePrice: price, downPaymentPct: _cmaDown, annualRatePct: liveRate, ...(_cmaLoanType ? { loanType: _cmaLoanType } : {}), ..._cmaBase },
                },
                isJumboCMA
                    ? {
                        label: `30% down — how does payment change?`,
                        seed: `Jumbo loan on a ${priceFmtCMA} home with 30% down at ${liveRate}%`,
                        paramOverrides: { purchasePrice: price, downPaymentPct: 30, annualRatePct: liveRate, loanType: 'jumbo', ..._cmaBase },
                    }
                    : {
                        label: `VA loan on this home — no down payment`,
                        seed: `VA loan on a ${priceFmtCMA} home with no down payment at ${liveRate}%`,
                        paramOverrides: { purchasePrice: price, downPaymentPct: 0, annualRatePct: liveRate, loanType: 'va', ..._cmaBase },
                    },
            ];
            // Use Grok chips if they exist, but always override with our structured chips
            cmaFinal.follow_up_chips = cmaChips;

            return noStore({
                ok: true,
                path: 'answers',
                tag: 'cma-intelligence-report',
                route: 'answers',
                usedFRED: !!(fred?.mort30Avg),
                usedTavily: tavCity.ok || tavAddress.ok,
                fred,
                grok: { ...cmaFinal, follow_up: null },
                debug: { ...cmaResult.debug, servedModel: 'cma-intelligence-report' },
                data_freshness: `Live (${XAI_MODEL}) · Tavily ${new Date().toISOString().slice(0, 10)}`,
                message: cmaFinal.answer,
                answerMarkdown: cmaFinal.answer,
                followUp: null,
                follow_up_chips: cmaChips,
                cmaCard: {
                    // ── Property identity ─────────────────────────────────────
                    address: addr,
                    beds,
                    baths,
                    sqft,
                    photoUrl: photoUrl || null,
                    // ── Valuation ─────────────────────────────────────────────
                    price,
                    priceSource: 'param',
                    estimatedValueLow:  avmLow,
                    estimatedValueHigh: avmHigh,
                    pricePerSqft: sqft > 0 ? Math.round(price / sqft) : 0,
                    // ── Purchase financing (20% down, primary) ────────────────
                    rate: liveRate,
                    piti: cmaPiti,
                    downAmt: cmaDown,
                    loanAmt: cmaLoan,
                    incomeNeeded: Math.round((cmaPiti / 0.43) * 12),
                    rateSensitivity: rateScenarios,
                    // ── Investment intelligence ────────────────────────────────
                    rentEstimate:    rentMoEstimate,
                    rentRangeLow:    rentMoLow,
                    rentRangeHigh:   rentMoHigh,
                    grossYield,       // % — annual rent / price
                    capRate,          // % — NOI (65% of gross rent) / price
                    dscrRatio,        // gross rent / PI payment (DSCR lender convention)
                    dscrRate:         rentMoEstimate ? dscrRatePct : null,
                    dscrPiti:         rentMoEstimate ? dscrPITI    : null,
                    dscrDown:         rentMoEstimate ? dscrDown    : null,
                    monthlyCashFlow,  // rent − full PITI (25% down investor scenario)
                    cashOnCash,       // % — annualized cash flow / (down + closing costs)
                    // ── Meta ──────────────────────────────────────────────────
                    answerMarkdown: cmaFinal.answer,
                    liveMarketData: tavCity.ok || tavAddress.ok,
                },
            });
        }
        // Fall through to standard Grok if CMA call failed
    }
    // ========== END PROPERTY INTELLIGENCE REPORT ==========

    // ========== AFFORDABILITY ADVISOR CHECK ==========
    // Guard: homeowner analysis queries must never be caught by affordability
    const isHomeownerAnalysisQuery = /homeowner analysis|run a complete.*analysis.*for|complete homeowner/i.test(question);
    let homeownerSnapshot: Record<string, any> | null = null;

    // ── HOMEOWNER ANALYSIS: fetch property data via lookup pipeline ──────────
    if (isHomeownerAnalysisQuery && !mortgageCalcContext) {
        const addrMatch = question.match(/(?:homeowner analysis|complete.*analysis)\s+for\s+(.+?)(?:\s*:|,\s*current|\s*—|\s*\u2014)/i);
        const hoAddr = addrMatch?.[1]?.trim();
        if (hoAddr) {
            try {
                const appBase = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';
                const lookupRes = await fetch(`${appBase}/api/property/lookup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: hoAddr }),
                    signal: AbortSignal.timeout(20_000),
                });
                if (lookupRes.ok) {
                    const lookupJson = await lookupRes.json();
                    const d = lookupJson?.data;
                    if (d) {
                        const estimatedValue     = d.estimatedValue ?? d.price ?? d.lastSalePrice ?? null;
                        const estimatedValueLow  = d.estimatedValueLow  ?? null;
                        const estimatedValueHigh = d.estimatedValueHigh ?? null;
                        const lastSalePrice: number | null = d.lastSalePrice ?? null;
                        const lastSaleDate: string | null  = d.lastSaleDate  ?? null;
                        const estimatedBalance   = d.estimatedBalance ?? null;
                        const estimatedEquity    = d.estimatedEquity  ?? null;
                        const purchaseRate       = d.purchaseRate     ?? null;
                        const remainingMonths    = d.remainingMonths  ?? null;
                        const beds  = d.beds  ?? null;
                        const baths = d.baths ?? null;
                        const sqft  = d.sqft  ?? null;
                        const liveRate = fred?.mort30Avg ?? 6.5;
                        const fmt = (n: number | null) => n != null ? `$${Math.round(n).toLocaleString()}` : 'N/A';
                        mortgageCalcContext =
`PROPERTY DATA (web lookup — use these numbers EXACTLY):
- Address: ${d.address ?? hoAddr}
- Beds/Baths/Sqft: ${beds ?? '?'} bd / ${baths ?? '?'} ba / ${sqft ? sqft.toLocaleString() : '?'} sqft
- Est. Value: ${fmt(estimatedValue)} (range: ${fmt(estimatedValueLow)} – ${fmt(estimatedValueHigh)})
- Last Sale: ${lastSaleDate ?? 'N/A'} at ${fmt(lastSalePrice)}
- Est. Purchase Rate (historical avg at sale year): ${purchaseRate ? purchaseRate.toFixed(2) + '%' : 'N/A'}
- Est. Remaining Mortgage Balance (20% down assumed): ${fmt(estimatedBalance)}
- Est. Equity: ${fmt(estimatedEquity)}
- Today's 30Y Fixed Rate (FRED): ${liveRate}%
CRITICAL: Use the estimated value (${fmt(estimatedValue)}) as the property value. Do NOT substitute generic market estimates from your training data.`;
                        homeownerSnapshot = {
                            address: d.address ?? hoAddr,
                            estimatedValue, estimatedValueLow, estimatedValueHigh,
                            estimatedBalance, estimatedEquity, purchaseRate, remainingMonths,
                            lastSalePrice, lastSaleDate, liveRate, beds, baths, sqft,
                        };
                    }
                }
            } catch (hoErr: any) {
                console.warn('[HomeownerAnalysis] lookup failed:', hoErr.message);
            }
        }
    }

    let affordabilityAnswer = null;

    // Detect debt/savings change follow-ups that should re-run the affordability calculator
    // e.g. "what if I have $800 in monthly debt", "what if I pay off my car"
    function isAffordabilityFollowUp(q: string): { isFollowUp: boolean; debtOverride?: number; savingsOverride?: number; useCurrentRate?: boolean; downPctOverride?: number } {
        const t = q.toLowerCase();

        const isPureRateInfoQuestion =
            /\b(30|15|20)\s*[- ]?year\s*(fixed|mortgage|rate|loan)?/i.test(q) ||
            /\b10\s*[- ]?year\s*(note|treasury|yield|bond)/i.test(q) ||
            /what\s*(are|is)\s*(current|today|mortgage|the)\s*rate/i.test(q) ||
            /where\s*(is|are)\s*(rate|rates|the\s*10|mortgage)/i.test(q) ||
            /\bfed\s+(rate|fund)/i.test(q) ||
            /what\s*.{0,20}(10|ten).{0,20}(note|treasury|yield)/i.test(q);
        if (isPureRateInfoQuestion) return { isFollowUp: false };

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

        // "what if 10% down", "put 20% down", "put down 20%", "20% down", "20 percent down"
        // 4 patterns cover all word orders including "put down 20%"
        const downPctFollowMatch =
            t.match(/(?:what\s*if|put|with|use|at|try|show)[\s\w]{0,20}?(\d+(?:\.\d+)?)\s*%\s*down/i) ||
            t.match(/(\d+(?:\.\d+)?)\s*%\s*down/i) ||
            t.match(/down\s*(\d+(?:\.\d+)?)\s*%/i) ||
            t.match(/(\d+(?:\.\d+)?)\s*percent\s*down/i);
        const downPctOverride = downPctFollowMatch ? parseFloat(downPctFollowMatch[1]) / 100 : undefined;

        // Self-contained guard: questions with income or affordability intent are NOT follow-ups
        const hasIncomeInQuestion = /\b(?:make|earn|income|salary|making|earning)\b/i.test(t);
        const hasAffordIntent = /how much|what can i afford|can i afford|max.*price|what.*home.*price/i.test(t);
        if (hasIncomeInQuestion || hasAffordIntent) { return { isFollowUp: false }; }

        const hasMutator = !!(debtOverride !== undefined || payOff || downPctOverride !== undefined);
        return { isFollowUp: hasMutator, debtOverride: payOff ? 0 : debtOverride, downPctOverride };
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
                // Prioritize canonical 'You have $Xk' line from affordability answers
                histSavings = line.match(/You have \$([\d,]+)k?/i) ||
                    line.match(/\$?([\d,]+)k?\s*(?:saved|savings|in the bank|in savings|available)/i) ||
                    line.match(/(?:have|saved|savings)\s*\$([\d,]+)k\b/i);
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

    // Skip affordability when question has a specific home price — route to FHA/mortgage calc instead
    // e.g. "Show me my monthly payment on a $460k home — I make $95k/year and have $40k saved"
    // GUARD: exclude income amounts like '$210K per year' from matching as a home price
    const hasNonIncomePrice = (() => {
        const priceMatches = [...question.matchAll(/\$\s*([\d,]+)\s*k?\b/gi)];
        return priceMatches.some(m => {
            const before = question.slice(Math.max(0, m.index! - 30), m.index!).toLowerCase();
            const isIncome = /make|earn|income|salary|gross|per year|a year|\/year/.test(before);
            return !isIncome;
        });
    })();
    // "what income do I need for a $500k home" is a REVERSE calc — it has a home price but
    // it's NOT a payment calc — it MUST go through the affordability path, not the mortgage calc.
    const isIncomeNeededQuery = /(?:what|how much)\s+income.{0,30}(?:need|qualify|required|to buy)/i.test(question) ||
        /(?:what|how much)\s+salary.{0,30}(?:need|qualify|required)/i.test(question) ||
        /income.{0,20}(?:need|required).{0,20}(?:qualify|home|house|mortgage)/i.test(question) ||
        /do i qualify|can i qualify/i.test(question);
    const isFHAIncomeQuery = isIncomeNeededQuery && /\bfha\b/i.test(question);
    const hasSpecificHomePrice = hasNonIncomePrice &&
        /\b(?:home|house|property|purchase|payment on|on a)\b/i.test(question) &&
        !isIncomeNeededQuery;  // income-needed queries have a home price but must use affordability
    const hasFHAWithPrice = (/\bfha\b/i.test(question) && !isIncomeNeededQuery) ? true : hasSpecificHomePrice;

    const isPureRateInfo =
        /\b(30|15|20)\s*[- ]?year\s*(fixed|mortgage|rate|loan)?/i.test(question) ||
        /\b10\s*[- ]?year\s*(note|treasury|yield|bond)/i.test(question) ||
        /what\s*(are|is)\s*(current|today|mortgage|the)\s*rate/i.test(question) ||
        /where\s*(is|are)\s*(rate|rates|the\s*10|mortgage)/i.test(question) ||
        /what\s*.{0,20}(10|ten).{0,20}(note|treasury|yield)/i.test(question);

    if (!isHomeownerAnalysisQuery && !hasFHAWithPrice && !isPureRateInfo && (isAffordabilityQuestion(question) || (affordFollowUp.isFollowUp && (priorAffordContext?.annualIncome || affordFollowUp.useCurrentRate)))) {
        console.log('[Affordability] Detected affordability question');

        // Income-needed queries are reverse calculations — force hasInfo:false so they always
        // reach the income-needed path below, regardless of what extractAffordabilityParams returns
        const affordParams = isIncomeNeededQuery ? ({ hasInfo: false } as any) : extractAffordabilityParams(question);

        // If it's a follow-up (debt change OR "use current rates"), merge prior context
        // Income-needed queries ("what income do I need for X home?") are reverse calculations —
        // never inject prior income context, they must reach the income-needed path below
        if (affordFollowUp.isFollowUp && priorAffordContext?.annualIncome && !affordParams.hasInfo && !isIncomeNeededQuery) {
            affordParams.annualIncome = priorAffordContext.annualIncome;
            const derivedFallback = priorAffordContext.annualIncome
                ? Math.round((priorAffordContext.annualIncome / 12) * 0.43 / 0.006 * 0.9 * 0.10)
                : 10000;
            affordParams.savings = priorAffordContext.savings || affordParams.savings || derivedFallback;
            affordParams.monthlyDebt = affordFollowUp.debtOverride ?? priorAffordContext.monthlyDebt ?? 0;
            // Apply down payment % override (e.g. "what if 10% down")
            if ((affordFollowUp as any).downPctOverride !== undefined) {
                (affordParams as any).downPctOverride = (affordFollowUp as any).downPctOverride;
            }
            (affordParams as any).hasInfo = true;
            // "base it on current rates" — use live FRED rate (already default, but log it)
            if (affordFollowUp.useCurrentRate) {
                console.log('[Affordability] Re-running with FRED rate:', fred?.mort30Avg || 6.01);
            }
            // Preserve any rate override from the follow-up question
            const followUpRate = extractAffordabilityParams(question).rateOverride;
            if (followUpRate) (affordParams as any).rateOverride = followUpRate;
            console.log('[Affordability] Follow-up override applied:', affordParams);
            console.log('[Affordability] priorAffordContext:', priorAffordContext);
        }

        if (affordParams.hasInfo && !isIncomeNeededQuery) {
            // User provided income and savings - generate scenarios
            console.log('[Affordability] Generating scenarios:', affordParams);

            const rateToUse = (affordParams as any).rateOverride || fred?.mort30Avg || 6.01;
            const scenarios = await generateAffordabilityScenarios({
                annualIncome: affordParams.annualIncome!,
                savings: affordParams.savings!,
                monthlyDebt: affordParams.monthlyDebt || 0,
                currentRate: rateToUse,
                downPctOverride: (affordParams as any).downPctOverride,
                question,
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
            const isIncomeQuery = /how much income|what income do i need|what salary|income.*(?:need|qualify|required)|do i qualify|what income.*with.*(?:debts?|payment|car|student)/i.test(question);
            const priorMonthlyPayment = snapshotJson?.computed_financials?.monthly_pitia
                ?? snapshotJson?.monthly_payment;

            if (isIncomeQuery && priorMonthlyPayment && snapshotLoanType) {
                const piti = Math.round(priorMonthlyPayment);
                const scenarioDesc = snapshotLoanType.replace('calcEngine-', '');
                const si = snapshotJson?.scenario_inputs ?? {};
                const siPrice = si.price ?? si.purchasePrice ?? snapshotPrice;
                const siDown = si.down_payment_pct ?? si.downPaymentPct ?? snapshotDown;
                const siRate = si.rate_used_pct ?? si.annualRatePct ?? snapshotRate;
                const siTerm = si.term_years ?? snapshotTerm ?? 30;
                const scenarioLineParts = [
                    siPrice ? `$${Math.round(Number(siPrice)).toLocaleString()} purchase` : null,
                    siDown != null ? `${siDown}% down` : null,
                    siRate != null ? `${siRate}%` : null,
                    `${siTerm}-year fixed`,
                ].filter(Boolean);
                const scenarioLine = scenarioLineParts.length > 1
                    ? scenarioLineParts.join(' · ') + '\n'
                    : snapshotText
                        ? snapshotText + '\n'
                        : '';
                const debtFromOverride = (body as any)?.paramOverrides?.monthlyDebt;
                const debtMatch = question.match(/\$\s*([\d,]+)\s*(?:\/mo|per month|month|monthly)\s*(?:in\s+)?(?:other\s+)?(?:debts?|payments?|car|student)/i)
                    ?? question.match(/(?:debts?|payments?)\s+of\s+\$\s*([\d,]+)/i);
                const monthlyDebt = debtFromOverride != null
                    ? Math.round(Number(debtFromOverride))
                    : debtMatch ? Math.round(parseFloat(debtMatch[1].replace(/,/g, ''))) : 0;
                const totalMonthly = piti + monthlyDebt;
                const scenarioHeader = `**${scenarioLine.trim()}**`;
                const debtNote = monthlyDebt > 0
                    ? `\n> 💡 Includes **$${monthlyDebt.toLocaleString()}/mo** in other debts added to housing payment.`
                    : '';
                const iqTaxRate = snapshotJson?.convHBSlider?.taxRate ?? snapshotJson?.interactiveSlider?.taxRate ?? 0.012;
                const iqInsRate = snapshotJson?.convHBSlider?.insRate ?? snapshotJson?.interactiveSlider?.insRate ?? 0.005;
                affordabilityAnswer = {
                    answer: `## 💰 Income to Qualify — ${scenarioDesc.charAt(0).toUpperCase() + scenarioDesc.slice(1)}\n\n${scenarioHeader}${debtNote}\n\n---\n\n## 📊 DTI Qualification Table\n\n| DTI threshold | Monthly income needed | Annual income needed |\n|---|---|---|\n| **43%** (standard max) | $${Math.round(totalMonthly / 0.43).toLocaleString()} | **$${Math.round((totalMonthly / 0.43) * 12).toLocaleString()}** |\n| **36%** (conservative) | $${Math.round(totalMonthly / 0.36).toLocaleString()} | **$${Math.round((totalMonthly / 0.36) * 12).toLocaleString()}** |\n| **28%** (front-end only) | $${Math.round(totalMonthly / 0.28).toLocaleString()} | **$${Math.round((totalMonthly / 0.28) * 12).toLocaleString()}** |\n\n---\n\n## 🏠 Payment Breakdown\n\n| Component | Amount |\n|---|---|\n| Monthly PITI | $${piti.toLocaleString()} |${monthlyDebt > 0 ? `\n| Other debts | $${monthlyDebt.toLocaleString()} |\n| **Total obligations** | **$${totalMonthly.toLocaleString()}** |` : ''}\n| Min income @ 43% DTI | $${Math.round(totalMonthly / 0.43).toLocaleString()}/mo |\n\n> Each additional $500/mo in debts adds ~**$${Math.round((500 / 0.43) * 12).toLocaleString()}**/yr to the income requirement.`,
                    next_step: monthlyDebt > 0 ? 'Compare against your actual income — if DTI is tight, consider paying down debts before applying.' : 'Share your monthly debts for a more precise income requirement.',
                    follow_up: 'What are your monthly debt payments?',
                    follow_up_chips: [
                        { label: 'I have $500/mo in other debts', seed: `What income do I need with $500/month in other debts for this scenario?`, paramOverrides: { monthlyDebt: 500 } },
                        { label: 'I have no other debts', seed: `Confirm — if I have no other monthly debts, what income qualifies me for this loan?`, paramOverrides: { monthlyDebt: 0 } },
                        { label: 'What income do I need to afford this home?', seed: `I want to buy a ${siPrice ? `$${Math.round(Number(siPrice)).toLocaleString()}` : 'this'} home — what annual income and savings do I need to qualify comfortably?` },
                    ],
                    confidence: '1.00 (calculated from prior scenario snapshot)',
                    incomeQualifySlider: siPrice ? {
                        price: Math.round(Number(siPrice)),
                        downPct: siDown ?? 20,
                        rate: siRate ?? (fred?.mort30Avg ?? 6.5),
                        term: siTerm ?? 30,
                        taxRate: iqTaxRate,
                        insRate: iqInsRate,
                    } : null,
                };
            } else {
                // Income-needed with price in question — compute locally, no snapshot required
                // e.g. "What income do I need to qualify for a $5M home in Laguna Beach?"
                const incomeForPriceMatch =
                    isIncomeQuery && (
                        question.match(/\$\s*(\d+(?:\.\d+)?)\s*[Mm]\b/) ||   // $5M, $4.9M
                        question.match(/\$\s*(\d+(?:\.\d+)?)\s*[Kk]\b/) ||   // $850k
                        question.match(/\$\s*([\d,]+)(?:\s+home|\s+house|\s+property|\s+purchase)/) // $4,995,000 home
                    );
                const incomeForPrice = (() => {
                    if (!incomeForPriceMatch) return snapshotPrice ?? null;
                    const raw = incomeForPriceMatch[1].replace(/,/g, '');
                    const isMillion = /[Mm]\b/.test(incomeForPriceMatch[0]);
                    const isThousand = /[Kk]\b/.test(incomeForPriceMatch[0]);
                    const val = parseFloat(raw);
                    if (isMillion) return Math.round(val * 1_000_000);
                    if (isThousand) return Math.round(val * 1_000);
                    return Math.round(val);
                })();

                if (isIncomeQuery && incomeForPrice && incomeForPrice >= 100_000) {
                    const _rateMatch = question.match(/(?:at|rate)\s*([\d]+\.[\d]+)\s*%/i) ?? question.match(/([\d]+\.[\d]+)\s*%/i);
                    const rate = _rateMatch ? parseFloat(_rateMatch[1]) : (fred?.mort30Avg ?? 6.5);
                    const _downMatch = question.match(/(\d+(?:\.\d+)?)\s*%\s*down/i);
                    // FHA default: 3.5% down; conventional default: 20%
                    const downPct = _downMatch ? parseFloat(_downMatch[1]) : (isFHAIncomeQuery ? 3.5 : (/10\s*%\s*down/i.test(question) ? 10 : /5\s*%\s*down/i.test(question) ? 5 : 20));
                    const taxRate = (snapshotJson?.interactiveSlider?.taxRate ?? snapshotJson?.scenario_inputs?.taxRate ?? 0.011) * 100;
                    // Scale insurance with price: 0.5% annually for jumbo, capped floor at $1,200/yr
                    const annualIns = Math.max(1200, Math.round(incomeForPrice * 0.005));
                    const conv = calcConventional({ purchasePrice: incomeForPrice, downPaymentPct: downPct, annualRatePct: rate, termYears: 30, propertyTaxRate: taxRate, annualInsurance: annualIns });

                    // For FHA: recompute PITI with UFMIP financed + monthly MIP (replaces PMI)
                    let piti = Math.round(conv.monthlyPI + conv.monthlyTax + conv.monthlyInsurance + (conv.monthlyPMI ?? 0));
                    let fhaMIPLine = '';
                    if (isFHAIncomeQuery) {
                        const fhaBaseLoan = incomeForPrice * (1 - downPct / 100);
                        const fhaUFMIP = fhaBaseLoan * 0.0175;
                        const fhaFinanced = fhaBaseLoan + fhaUFMIP;
                        const fhaLTV = (fhaBaseLoan / incomeForPrice) * 100;
                        const fhaMIPRate = fhaLTV > 90 ? 0.0055 : 0.0050;
                        const fhaMonthlyMIP = Math.round((fhaBaseLoan * fhaMIPRate) / 12);
                        const fhaR = rate / 100 / 12;
                        const fhaN = 30 * 12;
                        const fhaPI = (fhaFinanced * fhaR * Math.pow(1 + fhaR, fhaN)) / (Math.pow(1 + fhaR, fhaN) - 1);
                        piti = Math.round(fhaPI + fhaMonthlyMIP + conv.monthlyTax + conv.monthlyInsurance);
                        fhaMIPLine = `| Monthly MIP (${(fhaMIPRate * 100).toFixed(2)}%/yr) | $${fhaMonthlyMIP.toLocaleString()}/mo |\n`;
                    }
                    const priceFmt = incomeForPrice >= 1_000_000 ? `$${(incomeForPrice / 1_000_000).toFixed(incomeForPrice % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, '')}M` : `$${Math.round(incomeForPrice / 1000)}k`;
                    const downAmt = Math.round(incomeForPrice * downPct / 100);
                    console.log('[Affordability] Income-needed reverse calc for', priceFmt, isFHAIncomeQuery ? '(FHA)' : '(Conv)', 'PITI:', piti);
                    const isJumboLoan = !isFHAIncomeQuery && incomeForPrice * (1 - downPct / 100) > CONF_STANDARD;
                    const taxRateDecimal = taxRate / 100;
                    const insRateDecimal = annualIns / incomeForPrice;
                    const loanLabel = isFHAIncomeQuery ? 'FHA' : 'Conventional';
                    const pitiLabel = isFHAIncomeQuery ? 'PITI + MIP' : 'Total PITI';
                    const pmiLine = !isFHAIncomeQuery && conv.monthlyPMI ? `| PMI (~0.8%/yr) | $${Math.round(conv.monthlyPMI).toLocaleString()}/mo |\n` : '';
                    affordabilityAnswer = {
                        answer: `## 💰 Income to Qualify — ${priceFmt} ${loanLabel}\n\n**${priceFmt} purchase · ${downPct}% down ($${downAmt.toLocaleString()}) · ${rate}% · 30yr fixed${isFHAIncomeQuery ? ' · FHA' : ''}**\n\n---\n\n## 📊 Required Income by DTI Threshold\n\n| DTI threshold | Monthly income needed | **Annual income needed** |\n|---|---|---|\n| **43%** (standard max) | $${Math.round(piti / 0.43).toLocaleString()} | **$${Math.round((piti / 0.43) * 12).toLocaleString()}** |\n| **36%** (conservative) | $${Math.round(piti / 0.36).toLocaleString()} | **$${Math.round((piti / 0.36) * 12).toLocaleString()}** |\n| **28%** (front-end only) | $${Math.round(piti / 0.28).toLocaleString()} | **$${Math.round((piti / 0.28) * 12).toLocaleString()}** |\n\n---\n\n## 🏠 Payment Breakdown (${downPct}% down)\n\n| Component | Amount |\n|---|---|\n| Principal & Interest | $${Math.round(conv.monthlyPI).toLocaleString()}/mo |\n${fhaMIPLine}${pmiLine}| Property Tax (est.) | $${Math.round(conv.monthlyTax).toLocaleString()}/mo |\n| Insurance | $${Math.round(conv.monthlyInsurance).toLocaleString()}/mo |\n| **${pitiLabel}** | **$${piti.toLocaleString()}/mo** |\n\n> 💡 Each $500/mo in other debts adds ~**$${Math.round((500 / 0.43) * 12).toLocaleString()}**/yr to the income requirement.${isFHAIncomeQuery ? '\n\n> FHA MIP runs for the life of the loan with <10% down, adding to your income requirement permanently.' : ''}`,
                        next_step: 'Add your monthly debts for a precise income requirement.',
                        follow_up: 'What are your monthly debt payments?',
                        follow_up_chips: (() => {
                            const downChip = isJumboLoan
                                ? { label: `25% down — income threshold?`, seed: `What income do I need to qualify for a ${priceFmt} home with 25% down at ${rate}%?` }
                                : { label: `${downPct === 20 ? '10% down' : '20% down'} — income threshold?`, seed: `What income do I need to qualify for a ${priceFmt} home with ${downPct === 20 ? 10 : 20}% down at ${rate}%?` };
                            return [
                                downChip,
                                { label: `I have $2,000/mo in other debts`, seed: `What income do I need to qualify for a ${priceFmt} home with $2,000/month in other debts?` },
                                { label: `What rate qualifies at standard DTI?`, seed: `What mortgage rate would I need to qualify for a ${priceFmt} home at 43% DTI?` },
                            ];
                        })(),
                        confidence: '1.00 (calculated — no LLM)',
                        interactiveSlider: isJumboLoan ? {
                            price: incomeForPrice,
                            downPct,
                            rate,
                            term: 30,
                            taxRate: taxRateDecimal,
                            insRate: insRateDecimal,
                            loanType: 'jumbo' as const,
                        } : null,
                        convHBSlider: null,
                        incomeQualifySlider: {
                            price: incomeForPrice,
                            downPct,
                            rate,
                            term: 30,
                            taxRate: taxRateDecimal,
                            insRate: insRateDecimal,
                            loanType: isFHAIncomeQuery ? 'fha' as const : 'conventional' as const,
                        },
                        lenderChecklist: {
                            loanType: (isJumboLoan ? 'jumbo' : 'conventional') as 'jumbo' | 'conventional',
                            pdfType: 'conventional' as const,
                            price: incomeForPrice,
                            loanAmount: Math.round(incomeForPrice * (1 - downPct / 100)),
                            ltv: 1 - downPct / 100,
                            downPaymentPct: downPct,
                            marketRate: rate,
                            monthlyPITI: piti,
                            termYears: 30,
                            isInvestment: false,
                        },
                    };
                } else {
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
                    confidence: "1.00 (interactive advisor - ready to calculate)",
                    follow_up_chips: [
                        { label: "I make $95k/year and have $40k saved", seed: "I make $95k/year and have $40k saved" },
                        { label: "I make $120k, $20k saved, $300/mo car payment", seed: "I make $120k/year, have $20k saved, and pay $300/month in car payments" },
                        { label: "I make $75k/year and have $25k saved", seed: "I make $75k/year and have $25k saved" },
                    ]
                };
                } // end isIncomeQuery+price branch
            }
        }
    }
    // ========== END AFFORDABILITY CHECK ==========
    // ===== FHA CALCULATOR INTEGRATION =====
    // Add to app/api/answers/route.ts AFTER the affordability check (around line 1820)

    // ========== FHA CALCULATOR CHECK ==========
    let fhaAnswer = null;

    // Consume mortgage->FHA reroute flag (set before mortgageAnswer block above)
    if (mortgageRerouteToFHA && !affordabilityAnswer) {
        try {
            const { price: rPrice, income: rIncome, savings: rSavings } = mortgageRerouteToFHA;
            const rFHAParams = extractFHAParams(question);
            const rResult = calculateFHA({
                purchasePrice: rPrice,
                downPaymentPct: rFHAParams.downPaymentPct || 3.5,
                interestRate: rFHAParams.interestRate || fred?.mort30Avg || 6.5,
                creditScore: rFHAParams.creditScore || 580,
                loanTerm: 30,
                propertyTaxRate: rFHAParams.propertyTaxRate || 1.1,
                homeInsuranceAnnual: 1200,
                hoaMonthly: 0,
                annualIncome: rIncome,
                monthlyDebts: rFHAParams.monthlyDebts || 0,
            });
            const rMarkdown = buildFHAMarkdown(
                { ...rFHAParams, purchasePrice: rPrice, annualIncome: rIncome },
                rResult,
                null,
                { ambiguous10pct: false, rate: !rFHAParams.interestRate, incomeNeeded: false }
            );
            const priceK = Math.round(rPrice / 1000);
            const incK = Math.round(rIncome / 1000);
            const savK = Math.round(rSavings / 1000);
            fhaAnswer = {
                answer: rMarkdown,
                next_step: "Get FHA pre-approval from an FHA-approved lender.",
                follow_up: `Compare FHA vs conventional on this $${fmtPriceK(priceK)} home`,
                follow_up_chips: [
                    { label: `FHA vs conventional on $${fmtPriceK(priceK)} — side-by-side`, seed: `Compare FHA 3.5% down vs conventional 5% down on a $${fmtPriceK(priceK)} home — I make $${incK}k/year` },
                    { label: `What if I put 10% down instead?`, seed: `Show me FHA with 10% down on a $${fmtPriceK(priceK)} home — I make $${incK}k/year and have $${savK}k saved` },
                    { label: `What income do I need to qualify?`, seed: `What income do I need to qualify for a $${fmtPriceK(priceK)} home with FHA 3.5% down?` },
                ],
                confidence: "1.00 (calculated using FHA guidelines)",
                fhaSlider: {
                    price: rPrice,
                    downPct: rFHAParams.downPaymentPct || 3.5,
                    rate: rFHAParams.interestRate || fred?.mort30Avg || 6.5,
                    term: 30,
                    taxRate: rResult.purchasePrice > 0 ? (rResult.monthlyTax * 12) / rResult.purchasePrice : 0.012,
                    insRate: rResult.purchasePrice > 0 ? (rResult.monthlyInsurance * 12) / rResult.purchasePrice : 0.005,
                },
            };
            console.log('[Mortgage->FHA] Reroute successful, fhaAnswer set');
        } catch (e: any) {
            console.warn('[Mortgage->FHA] Reroute failed:', e.message);
        }
    }

    // History-aware FHA detection: if prior conversation mentions FHA and current question
    // is a down-payment follow-up ("show me 10% down", "what about 20% down"), treat as FHA question
    // GUARD: skip if we already produced an affordability answer (don't steal affordability down-pct follow-ups)
    const isFHAFollowUp = !isFHAQuestion(question) &&
        !affordabilityAnswer &&
        /\b(\d+)\s*%\s*down\b|show me.*down|down payment/i.test(question) &&
        /\bfha\b|\bmip\b|\bufmip\b/i.test(conversationHistory || '');

    // Detect compare FHA vs conventional — will run both calcs below
    const isCompareWithConv = /compare.{0,30}(?:fha.{0,30}conv|conv.{0,30}fha)|fha.{0,20}vs.{0,20}conv|vs.{0,20}conventional/i.test(question);

    // Standalone savings timeline: "$Xk gap, save $Y/month — how long?"
    const stGapMatch = question.match(/(?:need|short|gap|require)[^.]*?\$?\s*([\d,]+)k?\s*(?:more|short|gap)/i) ||
        question.match(/\$?\s*([\d,]+)k?\s*(?:more|short)\s*(?:for|to|until)/i);
    const stRateMatch = question.match(/save\s*\$?\s*([\d,]+)\s*(?:\/month|\/mo|per month|a month|month)/i) ||
        question.match(/saving\s*\$?\s*([\d,]+)\s*(?:\/month|\/mo|per month|a month|month)/i);
    const stHasHowLong = /how.{0,15}long|how.{0,10}many.{0,10}month|when.{0,15}(ready|buy|close)|months.{0,10}(until|to)/i.test(question);

    if (!isAskUnderwriting && !affordabilityAnswer && stGapMatch && stRateMatch && stHasHowLong) {
        const rawGap = stGapMatch[1].replace(/,/g, '');
        const gapAmt = parseFloat(rawGap) * (/k\b/i.test(stGapMatch[0]) ? 1000 : 1);
        const monthlyRate = parseFloat(stRateMatch[1].replace(/,/g, ''));
        if (gapAmt > 0 && monthlyRate > 0) {
            const months = Math.ceil(gapAmt / monthlyRate);
            const readyDate = new Date();
            readyDate.setMonth(readyDate.getMonth() + months);
            const readyStr = readyDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const half = Math.round(months / 2);
            const halfway = Math.round(monthlyRate * half);
            const interestEst = Math.round(gapAmt * 0.045 / 12 * months / 2);
            const stAnswer = {
                answer: `**Savings Timeline**\n\nSaving **$${monthlyRate.toLocaleString()}/month** to close a **$${Math.round(gapAmt / 1000)}k gap**:\n\n| Metric | Value |\n|--------|-------|\n| Cash gap | $${Math.round(gapAmt).toLocaleString()} |\n| Monthly savings | $${monthlyRate.toLocaleString()} |\n| **Months to close** | **${months}** |\n| Ready-to-buy | **${readyStr}** |\n\n**Milestones:**\n\n| Milestone | Month | Saved |\n|-----------|-------|-------|\n| Halfway | ${half} | $${halfway.toLocaleString()} |\n| **Done** | **${months}** | **$${Math.round(gapAmt).toLocaleString()}** |\n\n> 💡 In a 4.5% HYSA your savings earn ~$${interestEst} in interest over this period — can shave a month off the timeline.\n\n**[FHA Gift Funds — HUD 4000.1](https://www.hud.gov/handbook/4000-1)** | Can a family gift accelerate your timeline?`,
                next_step: `Open a high-yield savings account and automate $${monthlyRate.toLocaleString()}/mo transfers.`,
                follow_up: `What's your credit score? It determines FHA approval odds.`,
                follow_up_chips: [
                    { label: `What if I save $${Math.round(monthlyRate * 1.5).toLocaleString()}/mo instead?`, seed: `How long until I can buy if I save $${Math.round(monthlyRate * 1.5).toLocaleString()}/month? I need $${Math.round(gapAmt / 1000)}k more for FHA closing` },
                    { label: `Can gift funds cover my gap?`, seed: `Can gift funds cover my FHA down payment? I need $${Math.round(gapAmt / 1000)}k more` },
                    { label: `What if rates drop to 5.5%?`, seed: `What happens to my FHA payment if rates drop to 5.5%?` }
                ],
                confidence: `1.00 — $${Math.round(gapAmt).toLocaleString()} / $${monthlyRate.toLocaleString()}/mo = ${months} months`
            };
            affordabilityAnswer = stAnswer;
            console.log(`[SavingsTimeline] gap=${gapAmt} rate=${monthlyRate}/mo -> ${months} months`);
        }
    }

    if (!isAskUnderwriting && !affordabilityAnswer && (isFHAQuestion(question) || isFHAFollowUp)) {
        console.log('[FHA] Detected FHA question');

        const fhaParams = extractFHAParams(question);

        // Pull price + rate from history — price only if missing, rate only if missing (guards are independent)
        if ((isFHAFollowUp || isFHAQuestion(question)) && conversationHistory) {
            // Only pull price from history if price NOT found in current question
            if (!fhaParams.purchasePrice) {
                const histPriceCtx = conversationHistory.match(/\$\s*([\d,]+)\s*k?\s*(?:home|house|property|purchase price)/i) ||
                    conversationHistory.match(/(?:home|house|property|purchase price)[^$]*\$\s*([\d,]+)k?/i) ||
                    conversationHistory.match(/\$\s*([\d,]+(?:,\d{3})+)/i); // full $515,000 format
                // Bare $Xk only if value >= 100 (i.e. $100k+) to avoid matching MIP amounts like $84k, $26k
                const histPriceBare = conversationHistory.match(/\$\s*(\d+)k\b/gi)
                    ?.map((m: string) => parseFloat(m.replace(/[$k]/gi, '')))
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
            } // end if (!fhaParams.purchasePrice)
            if (!fhaParams.interestRate) {
                // Only pull rate from history USER questions, not assistant answers
                // Extract only "User:" lines to avoid matching example rates in our own notices
                const histUserLines = conversationHistory
                    .split('\n')
                    .filter((l: string) => /^(User:|Turn \d+\nUser:)/i.test(l.trim()) ||
                        (l.trim().startsWith('User:')))
                    .join(' ');
                const histRate = histUserLines.match(/(?:fha|at)\s+(\d+\.\d+)\s*%/i);
                if (histRate) {
                    const hVal = parseFloat(histRate[1]);
                    if (hVal >= 2 && hVal <= 15) fhaParams.interestRate = hVal;
                }
            }
            // Override down payment from current question (e.g. "show me 10% down")
            // Use decimal-aware regex; only override if it looks like an FHA-specific instruction
            // (i.e. "fha X% down" or "X% down" without "conventional" right before it)
            const followUpDownFHA = question.match(/fha\s+([\d.]+)\s*%\s*down/i) ||
                question.match(/^[^\n]*?([\d.]+)\s*%\s*down(?![^\n]*conventional)/i);
            if (followUpDownFHA) fhaParams.downPaymentPct = parseFloat(followUpDownFHA[1]);
        }

        if (fhaParams.hasInfo && fhaParams.purchasePrice) {
            console.log('[FHA] Calculating FHA loan:', fhaParams);

            try {
                // Calculate FHA loan
                // Resolve rate: explicit > FRED live > last-resort 6.5
                // Mutate fhaParams so buildFHAMarkdown template shows the real rate
                if (!fhaParams.interestRate) {
                    fhaParams.interestRate = fred?.mort30Avg || 6.5;
                }

                const fhaResult = calculateFHA({
                    purchasePrice: fhaParams.purchasePrice,
                    downPaymentPct: fhaParams.downPaymentPct || 3.5,
                    interestRate: fhaParams.interestRate,
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

                // Extract the conventional rate only from DECIMAL percentages (e.g. "FHA at 5.625% and conventional at 5.99%")
                // Whole-number % are almost always down payments, not rates — exclude them to avoid "10% down" being read as a rate
                const allRates = [...question.matchAll(/(\d+\.\d+)\s*%/gi)]
                    .map((m: RegExpMatchArray) => parseFloat(m[1])).filter((r: number) => r > 2 && r < 15);
                const fhaRate = fhaParams.interestRate || fred?.mort30Avg || 6.5;
                const convRate = allRates.length > 1 ? allRates[1] : allRates.length === 1 ? allRates[0] : fhaRate;

                // Extract conventional down payment from question — default to 5% if not specified
                const convDownMatch = question.match(/conventional\s+(\d+)\s*%\s*down/i) ||
                    question.match(/conv(?:entional)?\s+(\d+)\s*%\s*down/i);
                const convDownPctFromQ = convDownMatch ? parseFloat(convDownMatch[1]) : null;

                if (fhaParams.annualIncome) {
                    // Full comparison with DTI when income is known
                    // Only show comparison if DTI is within reason (< 55%) — otherwise redirect
                    const dtiCheck = fhaResult.totalDTI ?? 0;
                    if (dtiCheck < 55) {
                        comparison = compareFHAvsConventional(
                            fhaParams.purchasePrice,
                            convRate,
                            fhaParams.annualIncome,
                            fhaParams.monthlyDebts || 0,
                            fhaParams.propertyTaxRate || 1.1
                        );
                    }
                } else if (wantsComparison) {
                    // Build conventional numbers directly (no income needed — just payment math)
                    const price = fhaParams.purchasePrice;
                    const convDownPct = convDownPctFromQ ?? 5;
                    const convDown = price * (convDownPct / 100);
                    const convLoan = price - convDown;
                    const convMthRate = (convRate / 100) / 12;
                    const convPI = convLoan * (convMthRate * Math.pow(1 + convMthRate, 360)) / (Math.pow(1 + convMthRate, 360) - 1);
                    // PMI: 0 at 80% LTV (20%+ down), 0.5% at 85-90% LTV, 0.65% above 90%
                    const convLTV = (convLoan / price) * 100;
                    const convPMIRate = convLTV <= 80 ? 0 : convLTV <= 90 ? 0.005 : 0.0065;
                    const convPMI = (convLoan * convPMIRate) / 12;
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

                // Detect which assumptions were made
                const fhaAssumptions = {
                    // "at 10%" with no "down" keyword — ambiguous, defaulted to 3.5%
                    ambiguous10pct: !question.match(/(\d+\.?\d*)\s*%\s*down/i) &&
                        !!question.match(/at\s+(\d+)\s*%/i) &&
                        (fhaParams.downPaymentPct === 3.5 || !question.toLowerCase().includes('down')),
                    // No explicit rate in question — using FRED/default
                    rate: !fhaParams.interestRate || fhaParams.interestRate === (fred?.mort30Avg ?? 6.5),
                    // User asked "what income do I need" but didn't provide their income
                    incomeNeeded: !fhaParams.annualIncome &&
                        /what.*income|income.*need|qualify.*income|need.*earn|earn.*qualify|how much.*(?:make|earn|income)/i.test(question),
                };
                // Only surface rate assumption if it's the sole issue (not if already ambiguous)
                if (fhaAssumptions.ambiguous10pct) fhaAssumptions.rate = false;

                // Build markdown answer
                const fhaMarkdown = buildFHAMarkdown(fhaParams, fhaResult, comparison, fhaAssumptions);

                // If user asked "compare FHA vs conventional", append conventional side
                // Guard: skip if AI already generated a comparison table (avoids duplicates)
                let comparisonAppend = '';
                const aiAlreadyHasComparison = fhaMarkdown.includes('🆚') ||
                    /vs\.?\s*conventional comparison/i.test(fhaMarkdown) ||
                    fhaMarkdown.includes('Side-by-Side') ||
                    fhaMarkdown.includes('FHA vs Conventional');
                if (isCompareWithConv && fhaParams.purchasePrice && !aiAlreadyHasComparison) {
                    const convPrice = fhaParams.purchasePrice;
                    const convDown = /5\s*%/i.test(question) ? 0.05 : /10\s*%/i.test(question) ? 0.10 : /20\s*%/i.test(question) ? 0.20 : 0.05;
                    const convDownAmt = Math.round(convPrice * convDown);
                    const convLoan = convPrice - convDownAmt;
                    const convRate = fhaParams.interestRate / 100;
                    const r = convRate / 12; const n = 360;
                    const convPI = Math.round(convLoan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
                    const convPMI = convDown < 0.20 ? Math.round(convLoan * 0.006 / 12) : 0;
                    const convTax = Math.round(convPrice * 0.011 / 12);
                    const convIns = 150;
                    const convTotal = convPI + convPMI + convTax + convIns;
                    const convDTI = fhaParams.annualIncome ? ((convTotal / (fhaParams.annualIncome / 12)) * 100).toFixed(1) : '—';
                    const convCash = convDownAmt + Math.round(convPrice * 0.03);
                    comparisonAppend = `\n\n---\n\n## 🏛️ Conventional (${Math.round(convDown * 100)}% down) — Side-by-Side\n\n` +
                        `| Component | Amount |\n|-----------|--------|\n` +
                        `| Down Payment (${Math.round(convDown * 100)}%) | $${convDownAmt.toLocaleString()} |\n` +
                        `| Loan Amount | $${convLoan.toLocaleString()} |\n` +
                        `| Principal & Interest | $${convPI.toLocaleString()} |\n` +
                        `${convPMI ? `| PMI (~0.6%/yr) | $${convPMI.toLocaleString()}/mo |\n` : '| PMI | ❌ None (20%+ down) |\n'}` +
                        `| Property Taxes (est.) | $${convTax.toLocaleString()} |\n` +
                        `| Home Insurance | $${convIns} |\n` +
                        `| **Total Monthly** | **$${convTotal.toLocaleString()}** |\n\n` +
                        `- DTI: **${convDTI}%** of gross monthly income\n` +
                        `- Cash needed: $${convCash.toLocaleString()} (down + ~3% closing)\n` +
                        `${convPMI ? `- PMI cancels at 80% LTV (~\$${Math.round(convLoan * 0.0006 * 12).toLocaleString()}/yr savings)\n` : ''}` +
                        `\n> 💡 **FHA vs Conventional:** FHA has lower down (3.5% vs ${Math.round(convDown * 100)}%) but MIP lasts life of loan. Conventional PMI cancels at 80% LTV.\n` +
                        `\n**[Fannie Mae Selling Guide B3-6](https://selling-guide.fanniemae.com) | [HUD 4000.1](https://www.hud.gov/handbook/4000-1)**`;
                }

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
                        seed: `Show me FHA affordability on $${fmtPriceK(priceK)} with $0 monthly debt`
                    });
                    chips.push({
                        label: `Show me the price range where I'm safely under 43% DTI`,
                        seed: `What home price keeps my FHA DTI under 40% with my current income?`
                    });
                } else if (!fhaResult.meetsCreditRequirement) {
                    chips.push({
                        label: `Credit under 580 — show me FHA with 10% down instead`,
                        seed: `Show me FHA with 10% down on $${fmtPriceK(priceK)} — credit score is under 580`
                    });
                    chips.push({
                        label: `What credit score do I need to get the 3.5% down rate?`,
                        seed: `What credit score do I need for FHA 3.5% down on $${fmtPriceK(priceK)}?`
                    });
                    chips.push({
                        label: `Are there other low-down-payment loans I might qualify for?`,
                        seed: `What are my options besides FHA if my credit score is under 580?`
                    });
                } else if (fhaResult.mipDuration === 'Life of loan') {
                    const askedIncome35 = /income|qualify|earn|afford/i.test(question);
                    const askedCompare35 = /compare|vs\.?|conventional|conv\b/i.test(question);
                    const asked10pct35 = /10\s*%\s*down/i.test(question);

                    const pool35: Array<{ label: string; seed: string; skip: boolean }> = [
                        {
                            label: `Put 10% down — remove MIP after 11 years instead`,
                            seed: `Show me FHA with 10% down on a $${fmtPriceK(priceK)} home`,
                            skip: asked10pct35
                        },
                        {
                            label: `FHA 3.5% vs conventional 5% down — total cost comparison`,
                            seed: `Compare FHA 3.5% down vs conventional 5% down on a $${fmtPriceK(priceK)} home`,
                            skip: askedCompare35
                        },
                        {
                            label: `What income do I need to qualify at 3.5% down?`,
                            seed: `What annual income do I need to qualify for FHA on a $${fmtPriceK(priceK)} home at 3.5% down`,
                            skip: askedIncome35
                        },
                        {
                            label: `How much is MIP costing me over 30 years — is it worth it?`,
                            seed: `What's the total cost of FHA MIP on a $${fmtPriceK(priceK)} home over 30 years?`,
                            skip: false
                        },
                        {
                            label: `Add my income — tell me if I qualify for this payment`,
                            seed: `I make $${Math.round(priceK * 0.22)}k/year — do I qualify for FHA on a $${fmtPriceK(priceK)} home?`,
                            skip: askedIncome35
                        },
                    ];

                    for (const c of pool35) {
                        if (!c.skip && chips.length < 3) chips.push({ label: c.label, seed: c.seed });
                    }
                    for (const c of pool35) {
                        if (c.skip && chips.length < 3) chips.push({ label: c.label, seed: c.seed });
                    }
                } else if (fhaResult.mipDuration === '11 years') {
                    // Context-aware chips: detect what this question already answered
                    // and what comparisons are already visible, to avoid repeating chips
                    const qLower = question.toLowerCase();
                    const askedIncome = /income|qualify|earn|afford/i.test(question);
                    const askedCompare = /compare|vs\.?|conventional|conv\b/i.test(question);
                    const asked20pct = /20\s*%\s*down/i.test(question);
                    const asked10vs10 = /fha.*10.*conv|conv.*10.*fha|10.*down.*vs.*10.*down/i.test(question);

                    // Build a pool of candidate chips, then pick the ones NOT already answered
                    const chipPool: Array<{ label: string; seed: string; skip: boolean }> = [
                        {
                            label: `FHA 10% down vs conventional 10% down — side-by-side`,
                            seed: `Compare FHA 10% down vs conventional 10% down on a $${fmtPriceK(priceK)} home`,
                            skip: askedCompare && asked10vs10
                        },
                        {
                            label: `Conventional 20% down vs FHA 10% — monthly savings vs upfront cost`,
                            seed: `Show me conventional 20% down on a $${fmtPriceK(priceK)} home vs FHA 10% down`,
                            skip: asked20pct
                        },
                        {
                            label: `What income do I need to qualify at 10% down?`,
                            seed: `What annual income do I need to qualify for FHA on a $${fmtPriceK(priceK)} home at 10% down`,
                            skip: askedIncome
                        },
                        {
                            label: `What's the break-even point — when does conventional 10% beat FHA?`,
                            seed: `When does conventional 10% down become cheaper than FHA 10% down on a $${fmtPriceK(priceK)} home?`,
                            skip: false
                        },
                        {
                            label: `How much does a 680 vs 740 credit score change my rate?`,
                            seed: `How does my credit score affect FHA vs conventional on a $${fmtPriceK(priceK)} home?`,
                            skip: false
                        },
                        {
                            label: `Add my income — see if I actually qualify for this payment`,
                            seed: `I make $${Math.round(priceK * 0.22)}k/year — do I qualify for FHA on a $${fmtPriceK(priceK)} home at 10% down?`,
                            skip: askedIncome
                        },
                    ];

                    // Push non-skipped chips first, then skipped as backfill, up to 3
                    for (const c of chipPool) {
                        if (!c.skip && chips.length < 3) chips.push({ label: c.label, seed: c.seed });
                    }
                    for (const c of chipPool) {
                        if (c.skip && chips.length < 3) chips.push({ label: c.label, seed: c.seed });
                    }
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
                        seed: `I make $${Math.round(price / 5 / 1000) * 10}k/year — FHA or conventional on $${fmtPriceK(priceK)}?`
                    });
                }

                // Pad to 3 chips if needed
                if (!fhaParams.annualIncome && chips.length < 3) {
                    chips.push({
                        label: `Add my income — tell me if I actually qualify for this payment`,
                        seed: `I make $[income]/year — do I qualify for FHA on $${fmtPriceK(priceK)} home?`
                    });
                }

                const fhaFollowUp = chips[0]?.label ?? "Want to explore different down payment or loan scenarios?";

                fhaAnswer = null; // disabled — calcEngine-fha handles all FHA calculations

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

                fhaAnswer = null; // disabled — UW bypass handles MIP knowledge questions
                console.log('[FHA] Answered MIP duration knowledge question');
            } else {
                // Need more info
                console.log('[FHA] Asking for FHA info');

                fhaAnswer = null; // disabled — buildFHANeedsInputCard handles needs-input
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
            dscrAnswer = null; // disabled — calcEngine-dscr handles all DSCR questions
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
        debug = { requestedModel: "fha-calculator", servedModel: "fha-calculator", promptChars: question.length, elapsedMs: 0, requestId: "fha-" + Date.now(), parseMode: "direct", repaired: false };
        console.log('[FHA] Returning FHA analysis, skipping Grok');
    } else if (mortgageAnswer && !_isCMAEarly) {
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
${geoContext ? `\n${geoContext}` : ""}

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
- NEVER use your own formulas for amortization, DTI, UFMIP, MIP, or breakeven — these are always pre-calculated.
- If a calc result is provided, your ONLY job is to explain it in plain language, not recompute it.
- When user does NOT specify a rate, use the FRED 30Y fixed average rate shown above. Do NOT use rates from "Latest signals" unless user asks for current market rates.
- Markdown only inside the "answer" field. Never output HTML.
- Keep total length around 180–350 words unless asked for more.
- HOMEOWNER TONE: Never volunteer foreclosure, bankruptcy (Ch.7/11/13), deed-in-lieu, or short sale unless the user explicitly asks about those options by name. When a homeowner has negative equity, stay constructive — focus on appreciation over time, payment consistency, lender communication, and patience. Lead with what the homeowner CAN do, not worst-case exits.

Return valid JSON only:
{
  "answer": "${module === 'homeowner_payoff' ? 'IMPORTANT: Use ## markdown headings (not **bold**) for each section. Structure: ## Strategy Comparison (then table), ## Current Baseline, ## Extra Monthly Payments, ## 15-Year Refi, ## Biweekly Payments, ## Equity Trajectory. Each section is a ## heading followed by 1-2 sentences of explanation.' : 'Use sections: **Summary**, **Key Numbers**, **Comparison Table** (at least one markdown table), **What This Means For You**.'}",
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

    // When Grok completely fails (both attempts failed, repaired: true, grokFinal null),
    // return empty answerMarkdown so the UI suppresses the GrokCard instead of showing junk.
    const grokCompletelyFailed = !grokFinal && debug?.repaired === true;

    const finalMarkdown = grokFinal
        ? buildAnswerMarkdown(String(grokFinal.answer))
            + `\n\n**Confidence**: ${String(grokFinal.confidence)}\n`
            + (!sourcesInjected && topSources.length ? `\n**Sources**\n${sourcesMd}\n` : "")
            + (fredLine || "")
        : grokCompletelyFailed ? "" : legacyAnswerMarkdown;

    const message = grokFinal?.answer || legacyAnswer;

    mark("end (before return)");

    // Build refiSlider + propertyCard from homeownerSnapshot if present
    const hoRefiSlider = homeownerSnapshot?.estimatedBalance && homeownerSnapshot?.purchaseRate ? {
        balance:      homeownerSnapshot.estimatedBalance,
        currentRate:  homeownerSnapshot.purchaseRate,
        newRate:      homeownerSnapshot.liveRate,
        termMonths:   305,
        closingCosts: Math.round(homeownerSnapshot.estimatedBalance * 0.01),
        propertyValue: homeownerSnapshot.estimatedValue ?? undefined,
    } : null;

    const hoPropertyCard = homeownerSnapshot ? {
        source:           'web_lookup',
        url:              '',
        parsedBy:         'rentcast-api-v1',
        parseWarnings:    [],
        price:            homeownerSnapshot.estimatedValue ?? null,
        address:          homeownerSnapshot.address,
        city:             homeownerSnapshot.address?.split(',')[1]?.trim() ?? null,
        state:            homeownerSnapshot.address?.match(/,\s*([A-Z]{2})\s/)?.[1] ?? null,
        zip:              homeownerSnapshot.address?.match(/\b(\d{5})\b/)?.[1] ?? null,
        beds:             homeownerSnapshot.beds,
        baths:            homeownerSnapshot.baths,
        sqft:             homeownerSnapshot.sqft,
        annualTaxes:      null,
        taxRateEffective: 0.011,
        taxSource:        'table',
        photoUrl:         null,
        listingStatus:    'OFF_MARKET',
        daysOnMarket:     null,
        lastSaleDate:     homeownerSnapshot.lastSaleDate,
        lastSalePrice:    homeownerSnapshot.lastSalePrice,
        estimatedValue:   homeownerSnapshot.estimatedValue,
        estimatedValueLow:  homeownerSnapshot.estimatedValueLow,
        estimatedValueHigh: homeownerSnapshot.estimatedValueHigh,
        estimatedBalance: homeownerSnapshot.estimatedBalance,
        estimatedEquity:  homeownerSnapshot.estimatedEquity,
        purchaseRate:     homeownerSnapshot.purchaseRate,
        remainingMonths:  homeownerSnapshot.remainingMonths ?? null,
        hoaMonthly:       null,
        pricePerSqft:     null,
    } : null;

    const hoChips = homeownerSnapshot ? (() => {
        const addr  = homeownerSnapshot.address as string;
        const short = addr.split(',')[0];
        const bal   = homeownerSnapshot.estimatedBalance;
        const cur   = homeownerSnapshot.purchaseRate;
        const val   = homeownerSnapshot.estimatedValue;
        const live  = homeownerSnapshot.liveRate;
        return [
            { label: `← Back to Property Intelligence`, url: `/my-home`, seed: `` },
            { label: `15-year refi — payoff timeline?`, seed: `15-year refi at ${live}% on $${Math.round(bal/1000)}k balance`, paramOverrides: { currentBalance: bal, currentRatePct: cur, newRatePct: live } },
            { label: `Cash-out equity — what changes?`, seed: `Cash-out refi from ${short}` },
            { label: `Full Property Intelligence Report`, seed: `Property intelligence report: ${addr}`, paramOverrides: { cmaAddress: addr, cmaCity: homeownerSnapshot.address?.split(',')[1]?.trim() ?? '', cmaState: homeownerSnapshot.address?.match(/,\s*([A-Z]{2})\s/)?.[1] ?? '', cmaPrice: homeownerSnapshot.estimatedValue ?? homeownerSnapshot.lastSalePrice, cmaBeds: homeownerSnapshot.beds, cmaBaths: homeownerSnapshot.baths, cmaSqft: homeownerSnapshot.sqft, cmaTaxAnnual: Math.round((homeownerSnapshot.estimatedValue ?? 0) * 0.011), cmaTaxRate: 0.011, cmaLiveRate: live, cmaPhotoUrl: '' } },
        ];
    })() : null;

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
        data_freshness: affordabilityAnswer ? 'Live (calcEngine-deterministic)'
            : fhaAnswer ? 'Live (calcEngine-deterministic)'
            : grokFinal ? `Live (${XAI_MODEL})`
            : "Legacy stack",
        message,
        answerMarkdown: finalMarkdown,
        ...(hoPropertyCard && { propertyCard: hoPropertyCard }),
        ...(hoRefiSlider   && { refiSlider: hoRefiSlider }),
        // Sliders from affordability income-needed path
        interactiveSlider: (affordabilityAnswer as any)?.interactiveSlider ?? null,
        convHBSlider: (affordabilityAnswer as any)?.convHBSlider ?? null,
        incomeQualifySlider: (affordabilityAnswer as any)?.incomeQualifySlider ?? null,
        fhaSlider: (fhaAnswer as any)?.fhaSlider ?? null,
        lenderChecklist: (affordabilityAnswer as any)?.lenderChecklist ?? null,
        followUp: null,
        follow_up_chips: [],
    });
}

export async function POST(req: NextRequest) {
    return handle(req);
}

export async function GET(req: NextRequest) {
    const intent = req.nextUrl.searchParams.get("intent") || undefined;
    return handle(req, intent);
}// build: 2026-03-06-1500
// build: 2026-03-06-1501
// build: 2026-03-06-1600

// build: 2026-03-06-1620

// build: 2026-03-06-1640
// =============================================================================
// VERSION HISTORY
// =============================================================================
// v2026-03-06-1640  (base production build)
//   - hasNonIncomePrice: excludes income $ from home price routing
//   - statedDownPct / savingsWasAssumed: derives savings when only % given
//   - downPctOverride: follow-up "what if 10% down" re-runs affordability calc
//   - Loan limit enforcement in calcScenario
//   - Supabase chat_threads cross-session memory
//
// v2026-03-07  Session 2f (this build)
//   - FIX: "what if put down 20%" (down before %) now triggers follow-up
//     Upgraded to 4-pattern downPctFollowMatch regex
//   - FIX: self-contained guard in isAffordabilityFollowUp
//     Questions with income keywords or affordability intent never misrouted
//   - FIX: "what's my max home price with FHA?" routes to affordability
//     isAskingForMaxPrice guard on hasFHAWithPrice
//   - FIX: $10k savings fallback replaced with income-derived savings
//     Follow-up answers no longer show "You have $10k" for high-income users
// =============================================================================