// HR-Build: HRB-2025-11-10-d994b21 | File-Ref: HRF-0004-25F8FCE9 | SHA256: 25F8FCE98F4D90CE
// <HR-GUARD> Home chat = borrower mode only. Do NOT reintroduce Borrower/Public, Intent, or "Loan (optional)" controls.
// ==== REPLACE ENTIRE FILE: app/page.tsx ====
'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../components/Sidebar';
import MortgageCalcPanel from '../components/MortgageCalcPanel';
import MenuButton from '../components/MenuButton';
import { useMobileComposerPin } from '../hooks/useMobileComposerPin';
import { useAdminStatus } from '../hooks/useAdminStatus';
import { logAnswerToLibrary } from '../../lib/logAnswerToLibrary';
import './styles.css';
import GrokCard from "@/components/GrokCard";
import GrokAnswerBlock from '@/components/AnswerBlock';
import { ShareAnswerButton } from '@/components/ShareAnswerButton';
import {
    createProject,
    renameProject,
    deleteProject,
} from '../../lib/projectsClient';
import WelcomeScreen from '@/components/WelcomeScreen';
import ThemeToggle from '@/components/ThemeToggle';
import InteractiveSliderCard from '@/components/InteractiveSliderCard';
import ConvHBSliderCard from '@/components/ConvHBSliderCard';
import IncomeQualifySliderCard from '@/components/IncomeQualifySliderCard';
import FhaSliderCard from '@/components/FhaSliderCard';
import AffordabilitySliderCard from '@/components/AffordabilitySliderCard';
import DSCRSliderCard from '@/components/DSCRSliderCard';
import RefiSliderCard from '@/components/RefiSliderCard';
import RefiIntelligenceCard from '@/components/RefiIntelligenceCard';
import HelocSliderCard from '@/components/HelocSliderCard';
import PropertyPreviewCard from '@/components/PropertyPreviewCard';
import type { PropertyCardData } from '@/components/PropertyPreviewCard';
import PropertyIntelligenceCard from '@/components/PropertyIntelligenceCard';
import type { CMACardData } from '@/components/PropertyIntelligenceCard';
import ProUpgradeCard from '@/components/ProUpgradeCard';
import type { ProGatePayload } from '@/components/ProUpgradeCard';
import LoanLimitsSliderCard from '@/components/LoanLimitsSliderCard';
import JumboAffordabilitySliderCard from '@/components/JumboAffordabilitySliderCard';
import JumboSliderCard from '@/components/JumboSliderCard';
import VaSliderCard from '@/components/VaSliderCard';
import LenderChecklistCard from '@/components/LenderChecklistCard';
import ScenarioComparisonCard from '@/components/ScenarioComparisonCard';
import AlertBell from '@/components/AlertBell';
import AlertSetupCard from '@/components/AlertSetupCard';
import SettingsPanel from '@/components/SettingsPanel';



/* =========================
   Admin Debug Panel
   Only renders for ADMIN_USER_IDS. Shows raw API response JSON
   with math fields highlighted. Toggle with the bug button.
========================= */
function DebugPanel({ meta, raw }: { meta: any; raw: any }) {
    const [open, setOpen] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const [tab, setTab] = React.useState<'math' | 'raw'>('math');

    const copy = () => {
        navigator.clipboard.writeText(JSON.stringify(raw ?? meta, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // Extract the key math fields from wherever they live in the response
    const grok = meta?.grok ?? {};
    const fred = meta?.fred ?? {};
    const debug = meta?.debug ?? grok?.debug ?? {};
    const calc = grok?.calc ?? meta?.calc ?? {};

    const mathFields: [string, any][] = [
        ['path / route', meta?.path ?? meta?.route ?? '—'],
        ['confidence', grok?.confidence ?? meta?.confidence ?? '—'],
        ['intent', meta?.intent ?? '—'],
        ['usedFRED', String(meta?.usedFRED ?? '—')],
        ['usedTavily', String(meta?.usedTavily ?? '—')],
        ['10Y yield', fred.tenYearYield != null ? `${fred.tenYearYield}%` : '—'],
        ['30Y mtg avg', fred.mort30Avg != null ? `${fred.mort30Avg}%` : '—'],
        ['spread', fred.spread != null ? `${fred.spread}%` : '—'],
        ['fred.asOf', fred.asOf ?? '—'],
        ['requestedModel', debug.requestedModel ?? '—'],
        ['servedModel', debug.servedModel ?? '—'],
        ['parseMode', debug.parseMode ?? '—'],
        ['elapsedMs', debug.elapsedMs ?? '—'],
        ['promptChars', debug.promptChars ?? '—'],
        ['bypass', debug.bypass ?? '—'],
        // Affordability / calc fields
        ['homePrice', calc.homePrice ?? grok?.homePrice ?? '—'],
        ['downPct', calc.downPct ?? grok?.downPct ?? '—'],
        ['loanAmount', calc.loanAmount ?? grok?.loanAmount ?? '—'],
        ['rate', calc.rate ?? grok?.rate ?? '—'],
        ['monthlyPayment', calc.monthlyPayment ?? grok?.monthlyPayment ?? '—'],
        ['dti', calc.dti ?? grok?.dti ?? '—'],
        ['income', calc.income ?? grok?.income ?? grok?.annualIncome ?? '—'],
        ['savings', calc.savings ?? grok?.savings ?? '—'],
        ['memory_thread_id', meta?.memory_thread_id ?? '—'],
        ['chat_id', meta?.chat_id ?? '—'],
    ].filter((entry): entry is [string, any] => entry[1] !== '—');

    const panelStyle: React.CSSProperties = {
        marginTop: 8,
        borderRadius: 8,
        border: '1px solid #2a2a3a',
        background: '#0d0d14',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#a0a8c0',
        overflow: 'hidden',
    };
    const headerStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
        borderBottom: open ? '1px solid #2a2a3a' : 'none',
        cursor: 'pointer', userSelect: 'none',
        background: '#13131f',
    };
    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10,
        background: active ? '#2a2a5a' : 'transparent',
        color: active ? '#7090ff' : '#606080',
        border: active ? '1px solid #3a3a7a' : '1px solid transparent',
    });

    return (
        <div style={panelStyle}>
            <div style={headerStyle} onClick={() => setOpen(o => !o)}>
                <span style={{ fontSize: 13 }}>🐛</span>
                <span style={{ color: '#5060a0', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>
                    DEBUG
                </span>
                <span style={{ color: '#303050', fontSize: 10 }}>
                    {meta?.path ?? meta?.route ?? ''} · {debug.servedModel ?? debug.requestedModel ?? ''}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#404060' }}>
                    {open ? '▲' : '▼'}
                </span>
            </div>
            {open && (
                <div style={{ padding: 8 }}>
                    {/* Tab bar */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                        <span style={tabStyle(tab === 'math')} onClick={() => setTab('math')}>Math fields</span>
                        <span style={tabStyle(tab === 'raw')} onClick={() => setTab('raw')}>Raw JSON</span>
                        <span
                            style={{ marginLeft: 'auto', ...tabStyle(false), color: copied ? '#40c080' : '#606080' }}
                            onClick={copy}
                        >
                            {copied ? '✓ copied' : '⎘ copy'}
                        </span>
                    </div>

                    {tab === 'math' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                {mathFields.map(([k, v]) => (
                                    <tr key={k} style={{ borderBottom: '1px solid #1a1a2a' }}>
                                        <td style={{ padding: '2px 8px 2px 0', color: '#506080', whiteSpace: 'nowrap' }}>{k}</td>
                                        <td style={{ padding: '2px 0', color: '#c0d0ff', wordBreak: 'break-all' }}>
                                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {tab === 'raw' && (
                        <pre style={{
                            margin: 0, padding: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                            maxHeight: 400, overflowY: 'auto', color: '#8090b0', fontSize: 10,
                        }}>
                            {JSON.stringify(raw ?? meta, null, 2)}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}

/* =========================
   Small helpers
========================= */
const LS_KEY = 'hr.chat.v1';

// anonymous, non-signed-in usage meter (per browser, per day)
const ANON_METER_KEY = 'hr.anon.q.v1';
const ANON_DAILY_LIMIT = 10;

// signed-in usage meter (per user, per browser, per day)
const SIGNED_METER_KEY = 'hr.signed.q.v1';
const SIGNED_DAILY_LIMIT = 100; // signed-in, triggers Upgrade modal

// Admin status is managed via Supabase — see /admin → Manage Admins

const uid = () => Math.random().toString(36).slice(2, 10);
const fmtISOshort = (iso?: string) =>
    iso ? iso.replace('T', ' ').replace('Z', 'Z') : 'n/a';
const fmtMoney = (n: unknown) =>
    (typeof n === 'number' && Number.isFinite(n) ? n : 0).toLocaleString(
        undefined,
        { maximumFractionDigits: 2 }
    );

/**
 * Increment the anonymous (not signed-in) question counter.
 * Returns true if the user is allowed to ask this question,
 * false if they've already hit today's limit.
 */
function bumpAnonCounterOrBlock(): boolean {
    try {
        if (typeof window === 'undefined') return true;

        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const raw = window.localStorage.getItem(ANON_METER_KEY);

        if (!raw) {
            window.localStorage.setItem(
                ANON_METER_KEY,
                JSON.stringify({ d: today, c: 1 })
            );
            return true;
        }

        const parsed = JSON.parse(raw) as { d?: string; c?: number };
        const storedDay = parsed?.d;
        const storedCount = typeof parsed?.c === 'number' ? parsed.c : 0;

        // New day: reset count
        if (storedDay !== today) {
            window.localStorage.setItem(
                ANON_METER_KEY,
                JSON.stringify({ d: today, c: 1 })
            );
            return true;
        }

        // Same day: enforce limit
        if (storedCount >= ANON_DAILY_LIMIT) {
            return false;
        }

        window.localStorage.setItem(
            ANON_METER_KEY,
            JSON.stringify({ d: today, c: storedCount + 1 })
        );
        return true;
    } catch {
        // If anything goes wrong with localStorage, fail open
        return true;
    }
}

/**
 * Increment the signed-in question counter (per user, per day).
 * Returns true if allowed, false if daily limit reached.
 */
function bumpSignedCounterOrBlock(userId: string | null | undefined): boolean {
    try {
        // Admin check is handled by the caller — no ADMIN_USER_IDS needed here

        if (typeof window === 'undefined') return true;

        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const key = `${SIGNED_METER_KEY}:${userId ?? 'anon'}`;
        const raw = window.localStorage.getItem(key);

        if (!raw) {
            window.localStorage.setItem(
                key,
                JSON.stringify({ d: today, c: 1 })
            );
            return true;
        }

        const parsed = JSON.parse(raw) as { d?: string; c?: number };
        const storedDay = parsed?.d;
        const storedCount = typeof parsed?.c === 'number' ? parsed.c : 0;

        // New day: reset count
        if (storedDay !== today) {
            window.localStorage.setItem(
                key,
                JSON.stringify({ d: today, c: 1 })
            );
            return true;
        }

        // Same day: enforce limit
        if (storedCount >= SIGNED_DAILY_LIMIT) {
            return false;
        }

        window.localStorage.setItem(
            key,
            JSON.stringify({ d: today, c: storedCount + 1 })
        );
        return true;
    } catch {
        // Fail open if anything breaks
        return true;
    }
}

/* =========================
   Types
========================= */
type Role = 'user' | 'assistant';

type CalcAnswer = {
    loanAmount: number;
    monthlyPI: number;
    sensitivities: Array<{ rate: number; pi: number }>;
    monthlyTax?: number;
    monthlyIns?: number;
    monthlyHOA?: number;
    monthlyMI?: number;
    monthlyTotalPITI?: number;
};

type ApiResponse = {
    path: 'concept' | 'market' | 'dynamic' | 'error' | 'calc' | 'property_lookup';
    usedFRED: boolean;
    message?: string;
    summary?: string;
    tldr?: string[] | string;
    answer?: string | CalcAnswer;
    borrowerSummary?: string | null;
    fred?: {
        tenYearYield: number | null;
        mort30Avg: number | null;
        spread: number | null;
        asOf?: string | null;
        mort15Avg?: number | null;
        arm5Avg?: number | null;
        dgs2?: number | null;
        dgs30?: number | null;
        t10y2y?: number | null;
        fedFunds?: number | null;
        sofr?: number | null;
        cpi?: number | null;
        corePCE?: number | null;
        cpiShelter?: number | null;
        housingStarts?: number | null;
        existingHomeSales?: number | null;
        medianHomePrice?: number | null;
        monthsSupply?: number | null;
        caseShiller?: number | null;
        rentalVacancy?: number | null;
        unemployment?: number | null;
        hourlyEarnings?: number | null;
    };
    lockBias?: 'Mild Lock' | 'Neutral' | 'Float Watch';
    paymentDelta?: { perQuarterPt: number; loanAmount: number };
    watchNext?: string[];
    confidence?: 'low' | 'med' | 'high';
    status?: number;
    generatedAt?: string;

    // optional flags the backend might return for metering
    upgradeRequired?: boolean;
    limitHit?: boolean;
    credits_exhausted?: boolean;
    grace_remaining?: number;

    // ===== New fields for Grok + AnswerCard =====
    answerMarkdown?: string; // rich markdown answer we render in the card
    followUp?: string;       // camelCase version from backend (display text)
    follow_up?: string;      // snake_case version if Grok uses it (display text)
    follow_up_chips?: Array<{ label: string; seed: string; paramOverrides?: Record<string, any> }>; // clickable chips: label shown, seed fills pill
    grok?: any;              // full Grok JSON for confidence / next_step / follow_up
    data_freshness?: string; // e.g. "Live 2025–2026 (Grok 4.1)"
    topSources?: Array<{ title: string; url: string }>;
    interactiveSlider?: {
        price: number; downPct: number; rate: number; term: number;
        taxRate: number; insRate: number; loanType: 'conventional' | 'fha' | 'jumbo' | 'va';
        cmaAddress?: string; cmaCity?: string; cmaState?: string; cmaZip?: string;
        cmaPrice?: number; cmaBeds?: number; cmaBaths?: number; cmaSqft?: number;
        cmaTaxAnnual?: number; cmaTaxRate?: number; cmaLiveRate?: number; cmaPhotoUrl?: string;
    } | null;
    convHBSlider?: {
        price: number; downPct: number; rate: number; term: number;
        taxRate: number; insRate: number; county?: string; countyLimit?: number;
    } | null;
    incomeQualifySlider?: {
        price: number; downPct: number; rate: number; term: number;
        taxRate: number; insRate: number; loanType?: 'conventional' | 'fha' | 'jumbo' | 'va';
    } | null;
    vaSlider?: {
        price: number; downPct: number; rate: number; term: number;
        taxRate: number; insRate: number; vaFundingFeePct: number;
    } | null;
    fhaSlider?: {
        price: number; downPct: number; rate: number; term: number;
        taxRate: number; insRate: number;
    } | null;
    affordabilitySlider?: {
        annualIncome: number; monthlyDebts: number; savings: number;
        downPct: number; rate: number; term: number;
        taxRate: number; insRate: number; loanType: 'conventional' | 'fha';
    } | null;
    dscrSlider?: {
        price: number; rent: number; downPct: number; rate: number;
        vacancyRate: number; taxRate: number; insRate: number;
    } | null;
    refiSlider?: {
        balance: number; currentRate: number; newRate: number;
        termMonths: number; closingCosts: number; propertyValue?: number;
    } | null;
    refiIntelligenceCard?: {
        balance: number; currentRate: number; newRate: number;
        termMonths?: number; closingCosts?: number; remainingMonths?: number;
        address?: string; city?: string; state?: string; zip?: string;
        propertyValue?: number; origRateLabel?: string; fredDate?: string; sofr?: number;
    } | null;
    loanLimitsSlider?: {
        county: string; state?: string; stateName?: string;
        conformingLimit: number; nationalBaseline: number;
        price: number; downPct: number; taxRate: number; insRate: number; baseRate: number;
    } | null;
    jumboAffordabilitySlider?: {
        price: number; downPct: number; baseRate: number;
        countyLimit: number; nationalBaseline: number; county?: string;
        taxRate: number; insRate: number;
    } | null;
    jumboSlider?: {
        price: number; downPct: number; rate: number; term: number;
        taxRate: number; insRate: number;
    } | null;
    lenderChecklist?: {
        loanType: 'conventional' | 'fha' | 'va' | 'jumbo' | 'dscr';
        price: number; loanAmount: number; ltv: number;
        marketRate: number; monthlyPITI: number; termYears: number;
        isInvestment: boolean;
        rent?: number; vacancyRate?: number; taxRate?: number; insRate?: number;
        pdfType?: 'conventional' | 'fha' | 'va' | 'jumbo' | 'dscr' | 'refi' | 'affordability';
    } | null;
    scenarioComparisonCard?: {
        tool: 'down_payment' | 'seller_credit' | 'term' | 'rent_buy';
        price: number; rate: number;
        downPct?: number; years?: number; credit?: number; rent?: number;
    } | null;
    propertyCard?: {
        source: string; url: string; parsedBy: string; parseWarnings: string[];
        price: number | null; address: string | null;
        city: string | null; state: string | null; zip: string | null;
        beds: number | null; baths: number | null; sqft: number | null;
        annualTaxes: number | null; taxRateEffective: number | null; taxSource: string | null;
        photoUrl: string | null;
        // Extended
        listingStatus?: 'FOR_SALE' | 'OFF_MARKET' | 'PENDING' | 'SOLD' | 'UNKNOWN';
        daysOnMarket?: number | null; lastSaleDate?: string | null; lastSalePrice?: number | null;
        estimatedValue?: number | null; estimatedValueLow?: number | null; estimatedValueHigh?: number | null;
        estimatedBalance?: number | null; estimatedEquity?: number | null;
        purchaseRate?: number | null; remainingMonths?: number | null;
        hoaMonthly?: number | null; pricePerSqft?: number | null;
    } | null;
    cmaCard?: {
        address: string; price: number; photoUrl: string | null;
        piti: number; downAmt: number; loanAmt: number;
        incomeNeeded: number; pricePerSqft: number; rate: number;
        beds: number; baths: number; sqft: number;
        answerMarkdown: string; liveMarketData?: boolean;
        priceSource?: string; estimatedValueLow?: number | null; estimatedValueHigh?: number | null;
        rentEstimate?: number | null; rentRangeLow?: number | null; rentRangeHigh?: number | null;
        grossYield?: number | null; capRate?: number | null; dscrRatio?: number | null;
        dscrRate?: number | null; dscrPiti?: number | null; dscrDown?: number | null;
        monthlyCashFlow?: number | null; cashOnCash?: number | null;
    } | null;
    helocCard?: {
        homeValue: number; balance: number;
        drawAmount?: number; helocRate?: number; cashOutRate?: number;
        sofr?: number; address?: string;
    } | null;
    proGate?: ProGatePayload | null;
    labModules?: Array<{ icon: string; label: string; tag: string; desc: string; seed: string }> | null;
};


type ChatMsg =
    | { id: string; role: 'user'; content: string }
    | { id: string; role: 'assistant'; content: string; meta?: ApiResponse };

/* Result payload your MortgageCalcPanel returns */
export type CalcSubmitResult = {
    price: number;
    downPct: number;
    ratePct: number;
    termYears: number;
    zip?: string;
    hoa?: number;
    loanAmount: number;
    monthlyPI: number;
    sensitivities: Array<{ rate: number; pi: number }>;
};

/* =========================
   Listing URL detection
========================= */
function extractListingUrl(text: string): string | null {
    // Match with or without https:// (user may paste www.zillow.com/... without protocol)
    const m = text.match(
        /(?:https?:\/\/)?(?:www\.)?(?:zillow\.com|redfin\.com|redf\.in|realtor\.com|trulia\.com|homes\.com)[^\s]*/i
    );
    if (!m) return null;
    const url = m[0];
    // Ensure we return a full URL with protocol so fetch and detect both work
    return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}

/** Detect a plain US street address typed by the user (not a listing URL).
 *  Must START with the house number so chip seeds like "Property intelligence
 *  report: 3277 Main St..." are never mistaken for a standalone address. */
function extractPlainAddress(text: string): string | null {
    const t = text.trim();
    // Skip if text contains a URL or a known listing domain
    if (/https?:\/\//i.test(t) || /(?:redfin|zillow|realtor|trulia|homes)\.com/i.test(t)) return null;
    // Must START with a house number (digit) — rules out question/sentence inputs
    if (!/^\d/.test(t)) return null;
    // Must contain a street type keyword
    const ok = /\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9 ]{1,50}\s+(?:st(?:reet)?|ave(?:nue)?|blvd|boulevard|dr(?:ive)?|ln|lane|rd|road|way|ct|court|pl|place|ter(?:race)?|cir(?:cle)?|hwy|highway|pkwy|parkway|loop|trail|run|pass|grove|ridge|bend|crossing|heights|vista|walk|sq(?:uare)?)\b/i;
    if (!ok.test(t)) return null;
    return t;
}

/* =========================
   API helpers
========================= */
async function safeJson(r: Response): Promise<any> {
    const txt = await r.text();
    try {
        return JSON.parse(txt) as ApiResponse;
    } catch {
        return {
            path: 'error',
            usedFRED: false,
            answer: txt,
            status: r.status,
        } as any;
    }
}


/* =========================
   Scenario normalization (Scenario API → ApiResponse)
   This keeps the existing AnswerCard/GrokCard renderer working.
========================= */
function scenarioToApiResponse(s: any): ApiResponse {
    const result = s?.result || {};
    const marketData = s?.marketData || {};
    const meta = s?.meta || {};
    // TEMP: debug the scenario payload shape (remove after confirming)
    console.log('[scenarioToApiResponse] keys:', Object.keys(result || {}), 'top:', Object.keys(s || {}));

    const summary =
        // Common: result.plain_english_summary is a string
        (typeof result?.plain_english_summary === 'string' && result.plain_english_summary.trim())
            ? result.plain_english_summary.trim()

            // Sometimes: result.plain_english_summary is an object like { content: "..." }
            : (typeof result?.plain_english_summary?.content === 'string' && result.plain_english_summary.content.trim())
                ? result.plain_english_summary.content.trim()

                // Sometimes: result.summary is a string
                : (typeof result?.summary === 'string' && result.summary.trim())
                    ? result.summary.trim()

                    // Sometimes: result.answer is a string
                    : (typeof result?.answer === 'string' && result.answer.trim())
                        ? result.answer.trim()

                        // Sometimes: top-level answer/summary
                        : (typeof s?.answer === 'string' && s.answer.trim())
                            ? s.answer.trim()
                            : (typeof s?.summary === 'string' && s.summary.trim())
                                ? s.summary.trim()
                                : 'Scenario analysis completed.';


    const md: string[] = [];
    // For pure narrative responses (deep analysis), skip the Smart Scenario wrapper and tables
    // True only for deep-analysis narratives (no DSCR result data, no comparison card to render)
    const isNarrativeOnly = !result?.scenario_inputs && !result?.plain_english_summary && !result?.monthly_payment && !s?.scenarioComparisonCard;
    if (!isNarrativeOnly) {
        md.push('## Smart Scenario');
        md.push('');
    }
    md.push(summary);
    md.push('');

    // Sensitivity table, amortization, key risks — skip for pure narrative responses
    if (!isNarrativeOnly) {
    const sens = result?.sensitivity_table;
    if (sens && typeof sens === "object") {
        const order = ["current_rate", "plus_0_5pct", "plus_1pct", "minus_0_5pct"];

        const labelFor = (k: string) =>
            k === "current_rate"
                ? "Current Rate"
                : k === "plus_0_5pct"
                    ? "+0.5%"
                    : k === "plus_1pct"
                        ? "+1.0%"
                        : k === "minus_0_5pct"
                            ? "-0.5%"
                            : k.replace(/_/g, " ");

        const fmtMoney0 = (n: any) => {
            const x = typeof n === "number" ? n : Number(n);
            if (!isFinite(x)) return "-";
            const abs = Math.abs(x);
            return `$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
        };

        const fmtCF0 = (n: any) => {
            const x = typeof n === "number" ? n : Number(n);
            if (!isFinite(x)) return "-";
            const sign = x < 0 ? "-" : "";
            return `${sign}${fmtMoney0(x)}`;
        };

        const fmtDSCR = (n: any) => {
            const x = typeof n === "number" ? n : Number(n);
            if (!isFinite(x)) return "-";
            return `${x.toFixed(2)}x`;
        };

        // Collect valid rows first
        const rows: string[] = [];

        for (const k of order) {
            const v: any = (sens as any)[k];
            if (!v || typeof v !== "object") continue;

            const p = v.monthly_payment;
            const cf = v.monthly_cash_flow;
            const d = v.dscr;

            rows.push(`| ${labelFor(k)} | ${fmtMoney0(p)} | ${fmtCF0(cf)} | ${fmtDSCR(d)} |`);
        }

        // Only render the table if we have rows
        if (rows.length > 0) {
            md.push("### Rate Sensitivity (monthly payment)");
            md.push("");
            md.push("| Scenario | Payment | Cash Flow | DSCR |");
            md.push("| --- | ---: | ---: | ---: |");
            rows.forEach(row => md.push(row));
            md.push("");
        }
    }

    // Amortization Snapshot - Use API data if available, otherwise compute locally
    {
        const fmtMoney0 = (n: any) => {
            const x = typeof n === "number" ? n : Number(n);
            if (!isFinite(x)) return "-";
            const abs = Math.abs(x);
            return `$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
        };

        const parseMoney = (v: any): number => {
            if (typeof v === "number") return v;
            if (typeof v !== "string") return NaN;
            const cleaned = v.replace(/[^0-9.-]/g, "");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : NaN;
        };

        const parsePercent = (v: any): number => {
            if (typeof v === "number") return v;
            if (typeof v !== "string") return NaN;
            const cleaned = v.replace(/[^0-9.-]/g, "");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : NaN;
        };

        const parseYears = (v: any): number => {
            if (typeof v === "number") return v;
            if (typeof v !== "string") return NaN;
            const cleaned = v.replace(/[^0-9.-]/g, "");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : NaN;
        };

        // -------------------------------
        // Normalize scenario result shape
        // Some scenario responses place structured data under meta.grok.result
        // instead of `result`. Do NOT mutate `result`; use a normalized alias.
        // -------------------------------
        const scenarioResult =
            (result &&
                typeof result === "object" &&
                Object.keys(result).length > 0)
                ? result
                : ((meta as any)?.grok?.result &&
                    typeof (meta as any).grok.result === "object" &&
                    Object.keys((meta as any).grok.result).length > 0)
                    ? (meta as any).grok.result
                    : null;

        // =========================
        // STRATEGY 1: Use amortization_summary from API if present
        // =========================
        const amortSummary = scenarioResult?.amortization_summary;

        if (Array.isArray(amortSummary) && amortSummary.length > 0) {
            md.push("### Amortization Snapshot");
            md.push("");
            md.push("| Year | Principal Paid | Interest Paid | Ending Balance |");
            md.push("| - | -: | -: | -: |");

            for (const row of amortSummary) {
                const year = row?.year ?? '-';
                const prin = fmtMoney0(row?.principal_paid);
                const int = fmtMoney0(row?.interest_paid);
                const bal = fmtMoney0(row?.ending_balance);
                md.push(`| ${year} | ${prin} | ${int} | ${bal} |`);
            }

            md.push("");
        } else {
            // =========================
            // STRATEGY 2: Compute locally from scenario_inputs (fallback)
            // =========================
            const base: any = scenarioResult;

            const loanAmtRaw =
                base?.scenario_inputs?.loan_amount ??
                base?.scenario_inputs?.loanAmount ??
                base?.scenario?.loan_amount ??
                base?.scenario?.loanAmount ??
                base?.loan_amount ??
                base?.loanAmount;

            const rateRaw =
                base?.rate_context?.rate ??
                base?.rate_context?.current_rate ??
                base?.scenario_inputs?.rate ??
                base?.scenario_inputs?.rate_used ??
                base?.scenario_inputs?.rateUsed ??
                base?.scenario?.rate ??
                base?.rate_used;

            const termYearsRaw =
                base?.scenario_inputs?.term_years ??
                base?.scenario_inputs?.termYears ??
                base?.scenario?.term_years ??
                base?.scenario?.termYears ??
                30;

            let loanAmt = parseMoney(loanAmtRaw);
            let ratePct = parsePercent(rateRaw);
            let termYears = parseYears(termYearsRaw);

            // Fallback: parse from already-rendered Smart Scenario text in md[]
            const mdText = md.join("\n");

            if (!Number.isFinite(loanAmt)) {
                const m = mdText.match(/Loan amount:\s*\$?\s*([\d,]+)/i);
                if (m?.[1]) loanAmt = Number(m[1].replace(/,/g, ""));
            }

            if (!Number.isFinite(ratePct)) {
                const m = mdText.match(/Rate used:\s*([0-9.]+)\s*%/i);
                if (m?.[1]) ratePct = Number(m[1]);
            }

            if (!Number.isFinite(termYears)) {
                const m = mdText.match(/term\s*\(?\s*([0-9]+)\s*y/i);
                if (m?.[1]) termYears = Number(m[1]);
                if (!Number.isFinite(termYears)) termYears = 30;
            }

            const isInputsValid =
                Number.isFinite(loanAmt) &&
                loanAmt > 0 &&
                Number.isFinite(ratePct) &&
                ratePct > 0 &&
                Number.isFinite(termYears) &&
                termYears > 0;

            if (isInputsValid) {
                const r = ratePct / 100 / 12;
                const n = Math.round(termYears * 12);

                // Monthly P&I payment
                const pow = Math.pow(1 + r, n);
                const pmt = (loanAmt * r * pow) / (pow - 1);

                let bal = loanAmt;
                let cumPrin = 0;
                let cumInt = 0;

                const yearsToShow = new Set([1, 2, 3, 4, 5, 10, 15, 20, 25, 30]);

                md.push("### Amortization Snapshot");
                md.push("");
                md.push("| Year | Principal Paid | Interest Paid | Ending Balance |");
                md.push("| - | -: | -: | -: |");

                for (let m = 1; m <= n; m++) {
                    const interest = bal * r;
                    let principal = pmt - interest;

                    // Guard for final month rounding
                    if (principal > bal) principal = bal;

                    bal -= principal;
                    cumPrin += principal;
                    cumInt += interest;

                    if (m % 12 === 0) {
                        const y = m / 12;
                        if (yearsToShow.has(y)) {
                            md.push(`| ${y} | ${fmtMoney0(cumPrin)} | ${fmtMoney0(cumInt)} | ${fmtMoney0(bal)} |`);
                        }
                    }
                }

                md.push("");
            } else {
                md.push("### Amortization Snapshot");
                md.push("");
                md.push("Amortization snapshot unavailable for this scenario.");
                md.push("");
            }
        }
    }

    // Cash flow table (optional)
    if (Array.isArray(result?.cash_flow_table) && result.cash_flow_table.length) {
        md.push('### Cash Flow (net)');
        md.push('');
        md.push('| Year | Net Cash Flow |');
        md.push('|---:|---:|');
        for (const row of result.cash_flow_table) {
            md.push(`| ${row?.year ?? '—'} | ${row?.net_cash_flow ?? '—'} |`);
        }
        md.push('');
    }
    } // end if (!isNarrativeOnly) — skips sens table, amortization, key risks for narratives

    // Key risks
    if (!isNarrativeOnly && Array.isArray(result?.key_risks) && result.key_risks.length) {
        md.push('### Key Risks');
        md.push('');
        for (const r of result.key_risks) md.push(`- ${r}`);
        md.push('');
    }

    // Confidence mapping
    const conf: ApiResponse['confidence'] =
        typeof meta?.confidence === 'string'
            ? (meta.confidence === 'high' ? 'high' : meta.confidence === 'low' ? 'low' : 'med')
            : 'med';

    // Pass through chips — refi advisor stores them in multiple places depending on route version:
    // NEW shape (respond): result.follow_up_chips, meta.follow_up_chips, meta.grok.follow_up_chips
    // OLD shape (noStore):  s.grok.follow_up_chips, s.follow_up_chips, s.followUp
    const chips =
        result?.follow_up_chips ??
        meta?.follow_up_chips ??
        meta?.grok?.follow_up_chips ??
        (s as any)?.grok?.follow_up_chips ??
        (s as any)?.follow_up_chips ??
        undefined;
    const followUpLabel =
        meta?.followUp ??
        meta?.grok?.follow_up ??
        (s as any)?.grok?.follow_up ??
        (s as any)?.followUp ??
        undefined;

    // Narrative-only responses (deep analysis) render as plain chat bubbles, not GrokCard
    if (isNarrativeOnly) {
        return {
            path: 'dynamic',
            usedFRED: false,
            confidence: conf,
            message: summary,
            summary,
            answer: summary,
            answerMarkdown: undefined,
            data_freshness: undefined,
            followUp: undefined,
            follow_up_chips: undefined,
            scenarioComparisonCard: null,
            grok: null,
        } as any;
    }

    return {
        path: s?.scenarioComparisonCard ? 'scenario_comparison' as any : 'dynamic',
        usedFRED: marketData?.usedFallbacks === false || Boolean(marketData?.date),
        confidence: conf,
        message: summary,
        summary,
        answer: summary,
        answerMarkdown: md.join('\n'),
        data_freshness: marketData?.date ? `Live (FRED) as of ${marketData.date}` : undefined,
        followUp: followUpLabel,
        follow_up_chips: chips,
        scenarioComparisonCard: s?.scenarioComparisonCard ?? null,
        grok: {
            scenario: true,
            provider: s?.provider,
            model: meta?.model,
            build_tag: meta?.build_tag,
            marketData,
            meta,
            result,
            follow_up: followUpLabel,
            follow_up_chips: chips,
        },
    };
}
/* =========================
   Answer block
========================= */
function AnswerBlock({
    meta,
    friendly,
}: {
    meta?: ApiResponse;
    friendly?: string;
}) {
    if (!meta) return null;

    type NestedMeta = {
        meta?: { path?: ApiResponse['path']; usedFRED?: boolean; at?: string };
    };
    const m = meta as ApiResponse & NestedMeta;
    const headerPath = (m.path ?? m.meta?.path ?? '—') as
        | ApiResponse['path']
        | '—';
    const headerUsedFRED =
        typeof m.usedFRED === 'boolean' ? m.usedFRED : m.meta?.usedFRED ?? false;
    const headerAt: string | undefined = m.generatedAt ?? m.meta?.at ?? undefined;

    if (headerPath === 'calc' && m.answer && typeof m.answer === 'object') {
        const a = m.answer as CalcAnswer;
        return (
            <div className="answer-block" style={{ display: 'grid', gap: 10 }}>
                <div className="meta">
                    <span>
                        path: <b>{String(headerPath)}</b>
                    </span>
                    <span>
                        {' '}
                        | usedFRED: <b>{String(headerUsedFRED)}</b>
                    </span>
                    {headerAt && (
                        <span>
                            {' '}
                            | at: <b>{fmtISOshort(headerAt)}</b>
                        </span>
                    )}
                </div>
                {/* Share link footer – TODO: later wire real question/answer variables */}
                <div
                    style={{
                        marginTop: 4,
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >

                </div>
                <div>
                    <div>
                        <b>Loan amount:</b> ${fmtMoney(a.loanAmount)}
                    </div>
                    <div>
                        <b>Monthly P&I:</b> ${fmtMoney(a.monthlyPI)}
                    </div>
                </div>

                {typeof a.monthlyTotalPITI === 'number' &&
                    a.monthlyTotalPITI > 0 && (
                        <div className="panel">
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>
                                PITI breakdown
                            </div>
                            <ul style={{ marginTop: 0 }}>
                                <li>Taxes: ${fmtMoney(a.monthlyTax)}</li>
                                <li>Insurance: ${fmtMoney(a.monthlyIns)}</li>
                                <li>HOA: ${fmtMoney(a.monthlyHOA)}</li>
                                <li>MI: ${fmtMoney(a.monthlyMI)}</li>
                                <li>
                                    <b>Total PITI: ${fmtMoney(a.monthlyTotalPITI)}</b>
                                </li>
                            </ul>
                        </div>
                    )}

                {Array.isArray(a.sensitivities) && a.sensitivities.length > 0 && (
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>
                            ±0.25% Sensitivity
                        </div>
                        <ul style={{ marginTop: 0 }}>
                            {a.sensitivities.map((s, i) => (
                                <li key={i}>
                                    Rate:{' '}
                                    {(Number(s.rate) * 100).toFixed(2)}% → P&I $
                                    {fmtMoney(s.pi)}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {typeof m.tldr === 'string' && (
                    <div style={{ fontStyle: 'italic' }}>{m.tldr}</div>
                )}
            </div>
        );
    }

    const primary =
        m.message ??
        m.summary ??
        (m.fred &&
            m.fred.tenYearYield != null &&
            m.fred.mort30Avg != null &&
            m.fred.spread != null
            ? `As of ${m.fred.asOf ?? 'recent data'}: ${typeof m.fred.tenYearYield === 'number'
                ? m.fred.tenYearYield.toFixed(2)
                : m.fred.tenYearYield
            }%, 30Y ${typeof m.fred.mort30Avg === 'number'
                ? m.fred.mort30Avg.toFixed(2)
                : m.fred.mort30Avg
            }%, spread ${typeof m.fred.spread === 'number'
                ? m.fred.spread.toFixed(2)
                : m.fred.spread
            }%.`
            : typeof m.answer === 'string'
                ? m.answer
                : '');

    const lines = (typeof m.answer === 'string' ? m.answer : '')
        .split('\n')
        .map((s) => s.trim());

    // Use the streaming-friendly text if present, otherwise fall back
    const takeaway = friendly || primary || lines[0] || '';

    const bullets = lines
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2));
    const nexts = lines
        .filter((l) => l.toLowerCase().startsWith('next:'))
        .map((l) => l.slice(5).trim());

    return (
        <div className="answer-block" style={{ display: 'grid', gap: 10 }}>
            <div className="meta">
                <span>
                    path: <b>{String(m.path ?? '—')}</b>
                </span>
                <span>
                    {' '}
                    | usedFRED: <b>{String(headerUsedFRED)}</b>
                </span>
                {headerAt && (
                    <span>
                        {' '}
                        | at: <b>{fmtISOshort(headerAt)}</b>
                    </span>
                )}
            </div>

            {takeaway && <div>{takeaway}</div>}

            {Array.isArray(m.tldr) && m.tldr.length > 0 && (
                <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>TL;DR</div>
                    <ul style={{ marginTop: 0 }}>
                        {m.tldr.map((t, i) => (
                            <li key={i}>{t}</li>
                        ))}
                    </ul>
                </div>
            )}

            {bullets.length > 0 && (
                <ul style={{ marginTop: 0 }}>
                    {bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                    ))}
                </ul>
            )}

            {nexts.length > 0 && (
                <div style={{ display: 'grid', gap: 4 }}>
                    {nexts.map((n, i) => (
                        <div key={i}>
                            <b>Next:</b> {n}
                        </div>
                    ))}
                </div>
            )}

            {m.path === 'market' && headerUsedFRED && m.borrowerSummary && (
                <div className="panel">
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                        Borrower Summary
                    </div>
                    <ul style={{ marginTop: 0 }}>
                        {m.borrowerSummary.split('\n').map((l, i) => (
                            <li key={i}>{l.replace(/^\s*[-|*]\s*/, '')}</li>
                        ))}
                    </ul>
                </div>
            )}

            {m.paymentDelta && (
                <div style={{ fontSize: 13 }}>
                    Every 0.25% ~ <b>${m.paymentDelta.perQuarterPt}/mo</b> on $
                    {m.paymentDelta.loanAmount.toLocaleString()}.
                </div>
            )}
        </div>
    );
}

function Bubble({ role, children }: { role: Role; children: React.ReactNode }) {
    const isUser = role === 'user';
    return (
        <div
            className={`bubble ${isUser ? 'user' : 'assistant'}`}
            data-role={role}
        >
            <div className={`balloon ${isUser ? 'user' : 'assistant'}`}>
                {children}
            </div>
        </div>
    );
}
// --- HR helper: tighten markdown spacing & remove empty sections ---
function sanitizeMarkdown(md?: string): string {
    if (!md || typeof md !== 'string') return '';

    return md
        // Remove empty "Key Numbers" sections
        .replace(/\*\*Key Numbers\*\*\s*(\n\s*)+(?=\*\*|$)/gi, '')
        // Remove empty "Comparison Table" sections
        .replace(/\*\*Comparison Table\*\*\s*(\n\s*)+(?=\*\*|$)/gi, '')
        // Collapse excessive blank lines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/* =========================
   Page
========================= */
export default function Page() {
    useMobileComposerPin();

    const router = useRouter();
    const { isSignedIn, user } = useUser();
    const { isLoaded: clerkLoaded } = useAuth();

    const [messages, setMessages] = useState<ChatMsg[]>([
        {
            id: uid(),
            role: 'assistant',
            content: 'New chat. What do you want to figure out?',
        },
    ]);

    const [input, setInput] = useState('');
    const [priceCheckMode, setPriceCheckMode] = useState(false);
    const composerRef = useRef<HTMLTextAreaElement>(null);

    // Seed composer once if we came from a shared-link card
    const hasSeededFromShareRef = React.useRef<string | null>(null); // tracks last processed sq value
    const searchParams = useSearchParams();

    // borrower-only mode fixed
    const mode: 'borrower' = 'borrower';

    const { isAdmin } = useAdminStatus();
    const [loading, setLoading] = useState(false);
    const [typingId, setTypingId] = useState<string | null>(null);
    const [showUpgradeRequired, setShowUpgradeRequired] = useState(false);
    const [showAuthRequired, setShowAuthRequired] = useState(false);

    // Credit gate state — refreshed after each query
    const [creditState, setCreditState] = useState<{
        state: 'ok' | 'grace' | 'blocked';
        grace_remaining: number;
        balance: number;
    }>({ state: 'ok', grace_remaining: 0, balance: 0 });

    async function refreshCreditState() {
        if (!isSignedIn) return;
        try {
            const res = await fetch('/api/credits');
            if (!res.ok) return;
            const data = await res.json();
            setCreditState({
                state: data.credit_state ?? 'ok',
                grace_remaining: data.grace_remaining ?? 0,
                balance: data.balance ?? 0,
            });
        } catch { /* non-blocking */ }
    }

    // Load credit state on mount (signed-in only)
    useEffect(() => {
        if (isSignedIn) refreshCreditState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSignedIn]);

    const [history, setHistory] = useState<
        { id: string; title: string; updatedAt?: number }[]
    >([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    // Set to true when typewriter finishes — suppresses autoscroll so we can
    // scroll back to the TOP of the new message instead of leaving at bottom
    const suppressAutoScrollRef = React.useRef(false);
    // (autoscroll is handled by the effect below — single source of truth)

    // If the user came from a shared answer card, pre-fill the composer with that question
    // If sq param present without fromShare=1, auto-fire (SEO landing page seeds)
    const pendingSeedRef = React.useRef<string | null>(null);
    useEffect(() => {
        if (!searchParams) return;

        const from = searchParams.get('fromShare');
        const sq = searchParams.get('sq');

        if (!sq) return;
        // Only fire if this is a NEW sq value — prevents duplicate fires on re-renders
        // but allows re-firing when user navigates back with a different sq
        if (hasSeededFromShareRef.current === sq) return;
        hasSeededFromShareRef.current = sq;

        if (from === '1') {
            // fromShare: just pre-fill, don't auto-send
            setInput(sq);
        } else {
            // Landing page seed: always start a clean session so old context doesn't drift
            newChat();
            setInput(sq);
            pendingSeedRef.current = sq;
            // CMA URL params — if address present, inject paramOverrides so CMA card fires
            const cmaAddress = searchParams.get('cmaAddress');
            if (cmaAddress) {
                const cmaPrice = searchParams.get('cmaPrice');
                pendingParamOverridesRef.current = {
                    cmaAddress,
                    cmaCity:     searchParams.get('cmaCity')     ?? '',
                    cmaState:    searchParams.get('cmaState')    ?? '',
                    cmaPrice:    cmaPrice ? parseFloat(cmaPrice) : undefined,
                    cmaBeds:     searchParams.get('cmaBeds')     ? parseFloat(searchParams.get('cmaBeds')!)     : undefined,
                    cmaBaths:    searchParams.get('cmaBaths')    ? parseFloat(searchParams.get('cmaBaths')!)    : undefined,
                    cmaSqft:     searchParams.get('cmaSqft')     ? parseFloat(searchParams.get('cmaSqft')!)     : undefined,
                    cmaTaxAnnual: searchParams.get('cmaTaxAnnual') ? parseFloat(searchParams.get('cmaTaxAnnual')!) : undefined,
                    cmaTaxRate:  0.011,
                    cmaLiveRate: searchParams.get('cmaLiveRate') ? parseFloat(searchParams.get('cmaLiveRate')!) : undefined,
                    cmaPhotoUrl: searchParams.get('cmaPhotoUrl') ?? '',
                };
            }
        }
    }, [searchParams]);

    // Fires send() once input is set from SEO seed — send is in scope here
    useEffect(() => {
        if (!pendingSeedRef.current) return;
        const sq = pendingSeedRef.current;
        if (input !== sq) return; // wait until input state matches
        pendingSeedRef.current = null;
        const t = setTimeout(() => send(sq), 100);
        return () => clearTimeout(t);
    }, [input]);

    // Load shared thread from URL param ?shared=slug
    const hasLoadedSharedRef = React.useRef(false);

    useEffect(() => {
        if (hasLoadedSharedRef.current) return;
        const sharedSlug = searchParams?.get('shared');
        if (!sharedSlug) return;
        hasLoadedSharedRef.current = true;

        async function loadSharedThread() {
            try {
                const res = await fetch(`/api/share/load?slug=${sharedSlug}`);
                const data = await res.json();
                if (data.ok && Array.isArray(data.messages) && data.messages.length > 0) {
                    const newId = `shared-${sharedSlug}`;
                    setThreads(prev => ({ ...prev, [newId]: data.messages }));
                    setHistory(prev => [
                        {
                            id: newId,
                            title: `Shared: ${data.messages[0]?.content?.slice(0, 40) || 'Conversation'}…`,
                            updatedAt: Date.now()
                        },
                        ...prev.filter(h => h.id !== newId),
                    ]);
                    setActiveId(newId);
                    setMessages(data.messages);
                    console.log('[Share] Loaded shared thread:', sharedSlug);
                }
            } catch (err) {
                console.error('[Share] Failed to load shared thread:', err);
            }
        }

        void loadSharedThread();
    }, [searchParams]);

    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        setSidebarOpen(window.innerWidth >= 1024);
    }, []);

    // On mobile, navigating back from vault/library can restore bfcache state
    // with a stale filled input. Clear it on page show if nothing is in-flight.
    useEffect(() => {
        function onPageShow(e: PageTransitionEvent) {
            if (e.persisted && window.innerWidth < 1024) {
                setInput('');
            }
        }
        window.addEventListener('pageshow', onPageShow);
        return () => window.removeEventListener('pageshow', onPageShow);
    }, []);

    const toggleSidebar = () => setSidebarOpen((o) => !o);


    // threads + active
    const [threads, setThreads] = useState<Record<string, ChatMsg[]>>({});
    // Memory thread id per chat thread (ChatGPT-style: recall works only if we reuse the same memory_thread_id)
    const [memoryThreadByChatId, setMemoryThreadByChatId] = useState<Record<string, string>>({});
    const [activeId, setActiveId] = useState<string | null>(null);
    const [lastRouteByThread, setLastRouteByThread] = useState<Record<string, string>>({});
    // Structured param overrides from chip clicks — avoids parsing question text for numbers
    const [pendingParamOverrides, setPendingParamOverrides] = useState<Record<string, any> | null>(null);
    // Derived from messages — finds the most recent chip with cmaAddress across the conversation.
    // Works on page reload / restored sessions since messages are persisted.
    const activeCmaContext = React.useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const chip = (messages[i] as any).meta?.follow_up_chips?.find((c: any) => c.paramOverrides?.cmaAddress);
            if (chip) return chip.paramOverrides as Record<string, any>;
        }
        return null;
    }, [messages]);
    // Ref mirrors pendingParamOverrides so stale closures (slider setTimeout) always read the latest value
    const pendingParamOverridesRef = React.useRef<Record<string, any> | null>(null);
    const pendingChipSeedRef = React.useRef<string | null>(null);
    // CMA context persisted across slider re-runs — set imperatively when any API response has a chip with cmaAddress
    const cmaContextRef = React.useRef<Record<string, any> | null>(null);

    // overlays
    const [showSearch, setShowSearch] = useState(false);
    const [showLibrary, setShowLibrary] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showProject, setShowProject] = useState(false);
    const [showMortgageCalc, setShowMortgageCalc] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [projectName, setProjectName] = useState('');

    const [newProjectName, setNewProjectName] = React.useState('');
    const [isCreatingProject, setIsCreatingProject] = React.useState(false);


    // restore
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const data = JSON.parse(raw) as {
                threads?: Record<string, ChatMsg[]>;
                history?: { id: string; title: string; updatedAt?: number }[];
                activeId?: string | null;
                memoryThreadByChatId?: Record<string, string>;
            };
            if (data.threads) setThreads(data.threads);
            if (Array.isArray(data.history)) setHistory(data.history);
            if (data.memoryThreadByChatId) setMemoryThreadByChatId(data.memoryThreadByChatId);

            if (data.activeId && data.threads?.[data.activeId]) {
                // Don't restore previous thread if ?sq= is in the URL — newChat() will fire and win
                const hasSqParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sq');
                if (!hasSqParam) {
                    setActiveId(data.activeId);
                    setMessages(data.threads[data.activeId] || []);
                }
            }
        } catch (e) {
            console.warn('hr.chat load failed', e);
        }
    }, []);

    // ── Supabase hydration: restore history + memory thread map on login ──────
    // Runs once on sign-in. Only fills what localStorage is missing so an active
    // session is never clobbered. Makes follow-up memory survive across sessions.
    useEffect(() => {
        if (!isSignedIn || !user?.id) return;
        (async () => {
            try {
                const res = await fetch('/api/chat-threads');
                if (!res.ok) return;
                const data = await res.json();
                const rows: any[] = data?.threads ?? [];
                if (!rows.length) return;

                const dbMemMap: Record<string, string> = {};
                const dbHistory: { id: string; title: string; updatedAt: number }[] = [];
                const dbThreads: Record<string, any[]> = {};

                for (const row of rows) {
                    if (!row.chat_id) continue;
                    if (row.memory_thread_id) dbMemMap[row.chat_id] = row.memory_thread_id;
                    if (row.title) dbHistory.push({
                        id: row.chat_id,
                        title: row.title,
                        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
                    });
                    if (Array.isArray(row.messages) && row.messages.length) {
                        dbThreads[row.chat_id] = row.messages;
                    }
                }

                // localStorage wins if it already has data (active session takes priority)
                setMemoryThreadByChatId(prev =>
                    Object.keys(prev).length > 0 ? prev : dbMemMap
                );
                setHistory(prev =>
                    Array.isArray(prev) && prev.length > 0 ? prev : dbHistory
                );
                setThreads(prev => ({ ...dbThreads, ...prev }));

                console.log('[chat-threads] Hydrated from Supabase:', rows.length, 'threads');
            } catch (e) {
                console.warn('[chat-threads] Hydration failed:', e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSignedIn, user?.id]);

    // persist
    useEffect(() => {
        try {
            localStorage.setItem(
                LS_KEY,
                JSON.stringify({ threads, history, activeId, memoryThreadByChatId })
            );
        } catch (e) {
            console.warn('hr.chat save failed', e);
        }
    }, [threads, history, activeId, memoryThreadByChatId]);

    // snapshot into active thread
    useEffect(() => {
        if (!activeId) return;
        // Don't clobber an existing thread's messages with the WelcomeScreen placeholder.
        // This fires when activeId changes (before the new thread's messages load),
        // which would overwrite threads[id] with [{content:'New chat...'}].
        const INITIAL_MSG = 'New chat. What do you want to figure out?';
        if (messages.length === 1 && messages[0]?.content === INITIAL_MSG) return;

        setThreads((prev) => {
            const base = prev && typeof prev === 'object' ? prev : {};
            return { ...base, [activeId]: messages };
        });

        setHistory((prev) => {
            const arr = Array.isArray(prev) ? [...prev] : [];
            const idx = arr.findIndex((h) => h?.id === activeId);
            if (idx === -1) return arr;
            arr[idx] = { ...arr[idx], updatedAt: Date.now() };
            arr.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
            return arr;
        });
    }, [messages, activeId]);

    // autoscroll — suppressed when typewriter finishes (we scroll to top of message instead)
    useEffect(() => {
        if (suppressAutoScrollRef.current) return;
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages]);

    // hotkeys
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    (target as HTMLElement).isContentEditable)
            ) {
                return;
            }
            const k = e.key.toLowerCase();
            const meta = e.ctrlKey || e.metaKey;

            if (meta && k === 'k') {
                e.preventDefault();
                setShowSearch(true);
                return;
            }
            if (meta && k === 'n') {
                e.preventDefault();
                newChat();
                return;
            }
            if (meta && k === 'l') {
                e.preventDefault();
                setShowLibrary(true);
                return;
            }
            if (meta && k === 'p') {
                e.preventDefault();
                setShowProject(true);
                return;
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // history select
    async function onSelectHistory(id: string) {
        setActiveId(id);
        setShowLibrary(false);

        // Show cached thread immediately as a preview — but only if it has real content
        // (not the initial placeholder that the snapshot effect may have written when
        // activeId changed before the actual thread messages were loaded).
        const INITIAL_MSG = 'New chat. What do you want to figure out?';
        const cached = threads[id];
        const hasRealCache = Array.isArray(cached) && cached.length > 0 &&
            !(cached.length === 1 && (cached[0] as any)?.content === INITIAL_MSG);
        if (hasRealCache) setMessages(cached);

        // Always fetch from DB to get the authoritative snapshot
        try {
            const res = await fetch(`/api/chat-threads?chat_id=${id}`);
            if (res.ok) {
                const data = await res.json();
                const row = data?.threads?.[0];
                if (Array.isArray(row?.messages) && row.messages.length) {
                    setThreads(prev => ({ ...prev, [id]: row.messages }));
                    setMessages(row.messages);
                    return;
                }
            }
        } catch (e) {
            console.warn('[onSelectHistory] DB fetch failed:', e);
        }

        // Nothing in DB — keep cached version if we already showed it, otherwise show fallback
        if (!hasRealCache) {
            setMessages([
                {
                    id: uid(),
                    role: 'assistant',
                    content: 'Restored chat (no snapshot found). Start typing to continue.',
                },
            ]);
        }
    }

    const handleProjectAction = React.useCallback(
        async (action: 'rename' | 'delete', project: any) => {
            if (!project || !project.id) {
                console.warn('[ProjectAction] Missing project or id:', project);
                return;
            }

            if (action === 'rename') {
                const raw = window.prompt('Rename project:', project.name || '');
                const newName = raw?.trim();
                if (!newName || newName === project.name) {
                    return;
                }

                try {
                    const res = await renameProject(project.id, newName);
                    if (!res.ok) {
                        console.error('[ProjectAction] Rename failed:', res);
                        // later: show toast/UI message if you want
                        return;
                    }

                    console.log(
                        '[ProjectAction] Renamed project:',
                        project.id,
                        '->',
                        newName
                    );
                    // ProjectsPanel reads from /api/projects via fetchProjects().
                    // Click "Refresh" in the Projects list to pull updated names.
                } catch (err) {
                    console.error('[ProjectAction] Rename error:', err);
                }

                return;
            }

            if (action === 'delete') {
                const confirmed = window.confirm(
                    `Delete project "${project.name}" and its chat mappings?\n\nChats themselves will remain in the main list.`
                );
                if (!confirmed) return;

                try {
                    const res = await deleteProject(project.id);
                    if (!res.ok) {
                        console.error('[ProjectAction] Delete failed:', res);
                        return;
                    }

                    console.log('[ProjectAction] Deleted project:', project.id);
                    // Same as rename: use "Refresh" in Projects to update the list.
                } catch (err) {
                    console.error('[ProjectAction] Delete error:', err);
                }
            }
        },
        []
    );


    const handleMoveChatToProject = React.useCallback(
        async (threadId: string, projectId: string) => {
            try {
                console.log('[Move chat to project] begin', { threadId, projectId });

                const res = await fetch('/api/projects/move-chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ threadId, projectId }),
                });

                const json: any = await res.json().catch(() => null);

                if (!res.ok || !json?.ok) {
                    console.error('[Move chat to project] failed', {
                        status: res.status,
                        body: json,
                    });
                    window.alert(
                        json?.error ||
                        'There was a problem moving this chat to the project.'
                    );
                    return;
                }

                console.log('[Move chat to project] success', json);

                const mode = json?.mode || 'unknown';
                const mapping = json?.mapping;

                window.alert(
                    `Chat moved to project (${mode}).` +
                    (mapping?.thread_id
                        ? `\nthread_id: ${mapping.thread_id}\nproject_id: ${mapping.project_id}`
                        : '')
                );
            } catch (err) {
                console.error('[Move chat to project] exception', err);
                window.alert(
                    'Unexpected error while moving this chat. Please try again.'
                );
            }
        },
        []
    );

    function newChat() {
        const id = uid();
        setActiveId(id);
        setMessages([
            {
                id: uid(),
                role: 'assistant',
                content: 'New chat. What do you want to figure out?',
            },
        ]);
        setHistory((h) =>
            [{ id, title: 'New chat', updatedAt: Date.now() }, ...h].slice(0, 20)
        );
    }

    function handleHistoryAction(
        action: 'rename' | 'move' | 'archive' | 'delete',
        id: string
    ) {
        if (action === 'rename') {
            const current = history.find((h) => h.id === id)?.title ?? '';
            const name = prompt('Rename chat:', current);
            if (name && name.trim()) {
                setHistory((h) =>
                    h.map((x) =>
                        x.id === id
                            ? { ...x, title: name.trim(), updatedAt: Date.now() }
                            : x
                    )
                );
            }
            return;
        }
        if (action === 'move') {
            const rawName = prompt(
                'Move this chat to which project? (New or existing)'
            );
            if (!rawName) return;

            const projectName = rawName.trim();
            if (!projectName) return;

            // Fire-and-forget async call to Supabase via /api/projects
            (async () => {
                try {
                    const payload = {
                        threadId: id,
                        projectName,
                        // extra aliases in case the API expects a different field name
                        name: projectName,
                        title: projectName,
                    };

                    const res = await fetch('/api/projects', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });

                    const json = await res.json().catch(() => ({} as any));

                    console.log('projects POST response', {
                        status: res.status,
                        json,
                    });

                    if (!res.ok || !json?.ok) {
                        alert(
                            'Sorry, there was a problem saving this chat to a project.'
                        );
                        return;
                    }

                    // Later: toast + update local project state
                } catch (err) {
                    console.error('Project save error:', err);
                    alert('Network error while saving this chat to a project.');
                }
            })();

            return;
        }

        if (action === 'archive') {
            alert('Archive (coming soon)');
            return;
        }
        if (action === 'delete') {
            if (confirm('Delete this chat? This cannot be undone.')) {
                setHistory((h) => h.filter((x) => x.id !== id));
                setThreads((t) => {
                    const copy = { ...t };
                    delete copy[id];
                    return copy;
                });
                if (activeId === id) {
                    setActiveId(null);
                    setMessages([
                        {
                            id: uid(),
                            role: 'assistant',
                            content: 'New chat. What do you want to figure out?',
                        },
                    ]);
                }
            }
            return;
        }
    }

    // === Typewriter helper for a "streaming" feel ===
    const typeOutAssistant = React.useCallback(
        (id: string, full: string, charsPerTick = 24) => {
            if (!full) return;

            // Mark this message as actively typing — hides chips until done
            setTypingId(id);

            // Scroll so the start of the new message is visible
            requestAnimationFrame(() => {
                const el = document.querySelector(`[data-message-id="${id}"]`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });

            // Use Array.from to be safe with emoji / unicode
            const chars = Array.from(full);
            const total = chars.length;

            let index = 0;

            const step = () => {
                index += charsPerTick;
                if (index >= total) {
                    // Final update with full string — then clear typing state
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === id ? { ...m, content: full } : m
                        )
                    );
                    // Suppress autoscroll-to-bottom so we can scroll to top of this message.
                    // Keep suppressed for 2000ms — slider card + lenderChecklist render after
                    // typingId clears, and browser scroll-anchoring can fight us without this.
                    suppressAutoScrollRef.current = true;
                    setTypingId(null);
                    // Scroll to top of message — use 120ms delay so slider card has fully rendered
                    setTimeout(() => {
                        const el = document.querySelector(`[data-message-id="${id}"]`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 120);
                    // Release suppression after slider card settles
                    setTimeout(() => {
                        suppressAutoScrollRef.current = false;
                    }, 2000);
                    return;
                }

                const slice = chars.slice(0, index).join('');
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === id ? { ...m, content: slice } : m
                    )
                );

                window.setTimeout(step, 20); // ms between ticks
            };

            step();
        },
        [setMessages]
    );

    async function send(overrideValue?: string | React.MouseEvent<HTMLButtonElement>) {
        const q = (typeof overrideValue === 'string' ? overrideValue : input).trim();
        if (!q || loading) return;

        // Enforce simple daily limits before we send anything
        // Guard with clerkLoaded: isSignedIn is undefined while Clerk hydrates,
        // which makes !isSignedIn === true and incorrectly fires the anon wall.
        if (clerkLoaded && !isSignedIn) {
            const allowed = bumpAnonCounterOrBlock();
            if (!allowed) {
                setShowAuthRequired(true);
                return;
            }
        } else {
            if (!isAdmin) {
                const allowed = bumpSignedCounterOrBlock(user?.id);
                if (!allowed) {
                    setShowUpgradeRequired(true);
                    return;
                }
            }
        }

        const title = q.length > 42 ? q.slice(0, 42) + '...' : q;

        // ensure thread
        let tid = activeId;
        if (!tid) {
            tid = uid();
            setActiveId(tid);
            setHistory((h) =>
                [{ id: tid!, title, updatedAt: Date.now() }, ...h].slice(0, 20)
            );
        } else {
            setHistory((prev) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                const idx = next.findIndex((x) => x?.id === tid);
                if (idx >= 0) {
                    const current = next[idx] ?? { id: tid!, title: 'Untitled' };
                    const needsTitle =
                        typeof current.title === 'string' &&
                        (current.title === 'New chat' ||
                            current.title.startsWith('Untitled'));

                    next[idx] = {
                        ...current,
                        title: needsTitle ? title : current.title,
                        updatedAt: Date.now(),
                    };
                    return next;
                }
                next.unshift({ id: tid!, title, updatedAt: Date.now() });
                return next.slice(0, 20);
            });
        }
        // Resolve (and later persist) the server-side memory thread id for this chat thread.
        // If we don't reuse this id, the backend will create a new memory thread every request and recall will be empty.
        const existingMemoryThreadId = tid ? memoryThreadByChatId[tid] : undefined;

        // Create a placeholder assistant bubble immediately (no canned text)
        const answerId = uid();

        setMessages((m) => [
            ...m,
            { id: uid(), role: 'user', content: q },
            { id: answerId, role: 'assistant', content: '' },
        ]);

        setInput('');
        setPriceCheckMode(false);
        setLoading(true);

        // ── Property listing URL or plain address branch ─────────────────────
        const listingUrl   = extractListingUrl(q);
        const plainAddress = !listingUrl ? extractPlainAddress(q) : null;
        if (listingUrl || plainAddress) {
            // Zillow blocks server-side scraping — show a friendly nudge immediately
            if (listingUrl && /zillow\.com/i.test(listingUrl)) {
                typeOutAssistant(answerId, 'Zillow blocks automated lookups from our servers. For instant price data, paste the Redfin link for this property instead — Redfin works great.');
                setLoading(false);
                return;
            }
            const lookupBody = listingUrl ? { url: listingUrl } : { address: plainAddress! };
            try {
                // Fetch property data + live FRED rate in parallel
                const [lookupRes, tickerRes] = await Promise.all([
                    fetch('/api/property/lookup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(lookupBody),
                    }),
                    fetch('/api/ticker', { cache: 'no-store' }).catch(() => null),
                ]);
                const [lookupJson, tickerJson] = await Promise.all([
                    lookupRes.json(),
                    tickerRes ? tickerRes.json().catch(() => null) : Promise.resolve(null),
                ]);

                // Parse live 30Y rate from ticker — fall back to FRED national avg when unavailable
                let liveRate = 6.65; // matches FRED_FALLBACK in answers engine
                let liveRateIsLive = false;
                const thirtyYItem = tickerJson?.items?.find((i: any) => i.label === '30Y FIXED');
                if (thirtyYItem?.value) {
                    const parsed = parseFloat(String(thirtyYItem.value).replace('%', ''));
                    if (Number.isFinite(parsed) && parsed > 3 && parsed < 12) {
                        liveRate = parsed;
                        liveRateIsLive = true;
                    }
                }

                if (lookupJson.ok && lookupJson.data) {
                    const d = lookupJson.data;

                    const addressShort = d.address?.split(',')[0] ?? null;
                    const locationStr  = d.city && d.state ? `${d.city}, ${d.state}` : d.state ?? '';
                    const detailParts: string[] = [];
                    if (d.beds)  detailParts.push(`${d.beds} bd`);
                    if (d.baths) detailParts.push(`${d.baths} ba`);
                    if (d.sqft)  detailParts.push(`${d.sqft.toLocaleString()} sqft`);
                    const detailStr = detailParts.join(' · ');

                    const fmtK = (n: number) => { const k = Math.round(n / 1000); return k >= 1000 ? `$${(k / 1000).toFixed(1).replace(/\.0$/, '')}M` : `$${k}k`; };
                    const cityStr = d.city ? ` in ${d.city}` : '';

                    const isOffMarket = d.listingStatus === 'OFF_MARKET' || d.listingStatus === 'SOLD';

                    // ── OFF-MARKET / REFI path ─────────────────────────────────────────
                    if (isOffMarket) {
                        // Use parsed balance if available; fall back to 80% LTV of known value
                        const propVal = d.estimatedValue ?? d.lastSalePrice ?? d.price ?? null;
                        const bal = d.estimatedBalance
                            ?? (d.lastSalePrice ? Math.round(d.lastSalePrice * 0.80)
                            : d.estimatedValue  ? Math.round(d.estimatedValue  * 0.80)
                            : d.price           ? Math.round(d.price * 0.80)
                            : 600_000);
                        const curRate = d.purchaseRate ?? 5.5;
                        const termMo  = d.remainingMonths ?? 360;
                        const costs   = Math.round(bal * 0.01); // 1% default — industry norm for no/low-cost refi
                        const equity  = d.estimatedEquity ?? null;
                        const estVal  = d.estimatedValue  ?? null;

                        // Estimated current refi payment
                        const r = liveRate / 100 / 12;
                        const refiPmt = r > 0
                            ? Math.round((bal * r * Math.pow(1 + r, termMo)) / (Math.pow(1 + r, termMo) - 1))
                            : Math.round(bal / termMo);

                        const saleNote = d.lastSaleDate && d.lastSalePrice
                            ? ` Sold ${d.lastSaleDate} for ${fmtK(d.lastSalePrice)}.`
                            : '';
                        const headline = `${addressShort ?? locationStr} — off market.${saleNote}`;
                        const subline  = [detailStr, locationStr, estVal ? `Est. value ${fmtK(estVal)}` : null, equity ? `Est. equity ${fmtK(equity)}` : null].filter(Boolean).join(' · ');
                        const balNote  = d.estimatedBalance ? `~${fmtK(bal)} est. balance` : `~${fmtK(bal)} est. balance (adjust below)`;
                        const rateLabel = liveRateIsLive ? `${liveRate.toFixed(2)}%` : `~${liveRate.toFixed(2)}% (est.)`;
                        const cta      = `Est. refi payment at today's ${rateLabel}: $${refiPmt.toLocaleString()}/mo on ${balNote}. Adjust the sliders below.`;

                        const friendly = [headline, subline, cta].filter(Boolean).join('\n');

                        const refiSlider = {
                            balance:       bal,
                            currentRate:   curRate,
                            newRate:       liveRate,
                            termMonths:    termMo,
                            closingCosts:  costs,
                            propertyValue: propVal ?? undefined,
                        };

                        const refiChips = [
                            ...(liveRate < curRate - 0.25 ? [{
                                label: `Rate drop to ${(liveRate - 0.5).toFixed(2)}% — how much do I save?`,
                                seed:  `Refi from ${curRate.toFixed(2)}% to ${(liveRate - 0.5).toFixed(2)}% on ${fmtK(bal)} balance`,
                                paramOverrides: { currentBalance: bal, currentRatePct: curRate, newRatePct: Math.round((liveRate - 0.5) * 100) / 100 },
                            }] : [{
                                label: `Rates drop to 6% — what's the new payment?`,
                                seed:  `Refi from ${curRate.toFixed(2)}% to 6% on ${fmtK(bal)} balance`,
                                paramOverrides: { currentBalance: bal, currentRatePct: curRate, newRatePct: 6.0 },
                            }]),
                            {
                                label: `15-year refi — what's the payoff?`,
                                seed:  `15-year refi at ${liveRate.toFixed(2)}% on ${fmtK(bal)} balance${cityStr}`,
                                paramOverrides: { currentBalance: bal, currentRatePct: curRate, newRatePct: liveRate },
                            },
                            ...(equity && equity > 50_000 ? [{
                                label: `Cash-out ${fmtK(Math.min(equity * 0.8, 200_000))} — what changes?`,
                                seed:  `Cash-out refi ${fmtK(Math.min(equity * 0.8, 200_000))} from ${addressShort ?? 'this property'}${cityStr}`,
                            }] : []),
                            ...(d.lastSalePrice && d.address ? [{
                                label: `Full Property Intelligence Report`,
                                seed:  `Property intelligence report: ${d.address} last sold ${d.lastSaleDate ?? ''} for ${fmtK(d.lastSalePrice)}${cityStr}`,
                                paramOverrides: {
                                    cmaAddress:  d.address,
                                    cmaCity:     d.city    ?? '',
                                    cmaState:    d.state   ?? '',
                                    cmaZip:      d.zip     ?? '',
                                    cmaPrice:    d.lastSalePrice,
                                    cmaBeds:     d.beds    ?? 0,
                                    cmaBaths:    d.baths   ?? 0,
                                    cmaSqft:     d.sqft    ?? 0,
                                    cmaTaxAnnual: d.annualTaxes ?? 0,
                                    cmaTaxRate:  d.taxRateEffective ?? 0.011,
                                    cmaLiveRate: liveRate,
                                    cmaPhotoUrl: d.photoUrl ?? '',
                                } as Record<string, string | number>,
                            }] : []),
                        ];

                        const propertyMeta: ApiResponse = {
                            path: 'property_lookup',
                            usedFRED: false,
                            answer: friendly,
                            message: friendly,
                            answerMarkdown: friendly,
                            propertyCard: d,
                            refiSlider,
                            follow_up_chips: [],
                        };

                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === answerId && m.role === 'assistant'
                                    ? { ...m, meta: propertyMeta, content: '' }
                                    : m
                            )
                        );
                        typeOutAssistant(answerId, friendly);

                    } else {
                    // ── FOR-SALE / PURCHASE path ───────────────────────────────────────

                    // Compute estimated PITI (20% down, live rate, scraped taxes)
                    let pitiStr = '';
                    if (d.price) {
                        const principal = d.price * 0.80;
                        const r = liveRate / 100 / 12;
                        const n = 360;
                        const pi = r > 0
                            ? (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
                            : principal / n;
                        const monthlyTax = (d.annualTaxes ?? d.price * (d.taxRateEffective ?? 0.0076)) / 12;
                        const monthlyIns = d.price * 0.005 / 12;
                        const piti = Math.round(pi + monthlyTax + monthlyIns);
                        pitiStr = `$${piti.toLocaleString()}/mo`;
                    }

                    const priceStr = d.price ? `$${d.price.toLocaleString()}` : null;
                    const domNote  = d.daysOnMarket != null ? ` · ${d.daysOnMarket} days on market` : '';

                    const headline = pitiStr
                        ? `${pitiStr} estimated — that's your PITI on ${addressShort ?? locationStr}.`
                        : `${priceStr ?? 'Listing'} in ${locationStr}.`;
                    const subline = [priceStr, detailStr, locationStr + domNote].filter(Boolean).join(' · ');
                    const rateLabel = liveRateIsLive ? `${liveRate.toFixed(2)}%` : `~${liveRate.toFixed(2)}% (est.)`;
                    const cta = d.price
                        ? `Pre-loaded at today's ${rateLabel} with 20% down. Adjust the sliders to explore.`
                        : `Zillow blocked price data — enter the listing price below to run the numbers.`;

                    const friendly = [headline, subline, cta].filter(Boolean).join('\n');

                    // Detect loan tier — determines slider type and chip set
                    // $832,750 = 2026 FHFA national conforming baseline (up from $806,500 in 2025)
                    const defaultDown   = 20;
                    const loanAmt       = d.price ? d.price * (1 - defaultDown / 100) : 0;
                    const isJumboLoan   = loanAmt > 832_750;
                    const sliderLoanType: 'conventional' | 'jumbo' = isJumboLoan ? 'jumbo' : 'conventional';

                    // Pre-filled slider using live rate + scraped tax rate
                    const taxRate = d.taxRateEffective ?? 0.012;
                    const interactiveSlider = d.price ? {
                        price: d.price,
                        downPct: defaultDown,
                        rate: liveRate,
                        term: 30,
                        taxRate,
                        insRate: 0.0050,
                        loanType: sliderLoanType,
                        cmaAddress:  d.address    ?? undefined,
                        cmaCity:     d.city       ?? undefined,
                        cmaState:    d.state      ?? undefined,
                        cmaZip:      d.zip        ?? undefined,
                        cmaPrice:    d.price,
                        cmaBeds:     d.beds       ?? undefined,
                        cmaBaths:    d.baths      ?? undefined,
                        cmaSqft:     d.sqft       ?? undefined,
                        cmaTaxAnnual: d.annualTaxes ?? undefined,
                        cmaTaxRate:  d.taxRateEffective ?? undefined,
                        cmaLiveRate: liveRate,
                        cmaPhotoUrl: d.photoUrl   ?? undefined,
                    } : null;

                    // Keep the income-qualify chip — the 3 old-style chips were removed, this newer one stays
                    const priceFmt = d.price ? fmtK(d.price) : 'this home';
                    const chips: { label: string; seed: string; paramOverrides?: Record<string, any> }[] = d.price ? [
                        {
                            label: `What income do I need to qualify?`,
                            seed: `What income do I need to qualify for a ${priceFmt} home${cityStr}?`,
                            paramOverrides: {
                                purchasePrice: d.price,
                                downPaymentPct: defaultDown,
                                annualRatePct: liveRate,
                                propertyTaxRate: taxRate,
                                ...(isJumboLoan ? { loanType: 'jumbo' } : {}),
                            },
                        },
                    ] : [];

                    const propertyMeta: ApiResponse = {
                        path: 'property_lookup',
                        usedFRED: false,
                        answer: friendly,
                        message: friendly,
                        answerMarkdown: friendly,
                        propertyCard: d,
                        interactiveSlider,
                        follow_up_chips: chips,
                    };

                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === answerId && m.role === 'assistant'
                                ? { ...m, meta: propertyMeta, content: '' }
                                : m
                        )
                    );
                    typeOutAssistant(answerId, friendly);

                    // Persist property to user's account so My Properties shows the rich Redfin card
                    if (user?.id && d.address) {
                        void fetch('/api/homeowner/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ address: d.address }),
                        });
                    }
                    } // close FOR_SALE else
                } else {
                    // Lookup failed — surface the error as assistant text
                    const errMsg = lookupJson.error ?? 'Could not read that listing. Try pasting the price and address manually.';
                    const details = lookupJson.details ? ` ${lookupJson.details}` : '';
                    typeOutAssistant(answerId, errMsg + details);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                typeOutAssistant(answerId, `Could not fetch listing: ${msg}`);
            } finally {
                setLoading(false);
            }
            return;
        }
        // ── End property listing URL branch ───────────────────────────────────

        try {
            // borrower-only body (no intent/loanAmount passthrough)
            const body: {
                question: string;
                mode: 'borrower';
                chat_id?: string;
            } = {
                question: q,
                mode,
                chat_id: activeId || undefined,  // Send the current chat ID!
            };

            // === Scenario routing (12-18-25) ===
            // Force mode: if URL has ?scenario=1 (your sidebar button can add this)
            const sp =
                typeof window !== 'undefined'
                    ? new URLSearchParams(window.location.search)
                    : null;

            const forceScenario = sp?.get('scenario') === '1';

            // Smart detection: only flip to scenario when it smells like compare/projection + has numbers
            const t = q.toLowerCase();

            // Check if we have a previous route for this thread
            const lastRoute = tid ? lastRouteByThread[tid] : undefined;

            // Detect follow-up indicators — covers suggested follow-up clicks like
            // "show me 10% down scenario", "what if I put 10% down", "show me that option"
            const isFollowUp =
                t.includes('what if') ||
                t.includes('what about') ||
                t.includes('instead') ||
                t.includes('same property') ||
                t.includes('same home') ||
                t.includes('that property') ||
                t.includes('that home') ||
                t.includes('previous') ||
                t.includes('show me') ||
                t.includes('run that') ||
                t.includes('run it') ||
                // Refi follow-up patterns
                t.includes('break even') ||
                t.includes('breakeven') ||
                t.includes('break-even') ||
                t.includes('closing cost') ||
                t.includes('lender credit') ||
                t.includes('no cost') ||
                t.includes('no-cost') ||
                t.includes('trigger rate') ||
                t.includes('shorten') ||
                t.includes('15 year') ||
                t.includes('15-year') ||
                t.includes('20 year') ||
                t.includes('20-year') ||
                t.includes('extra pay') ||
                t.includes('principal pay') ||
                t.includes('sell in') ||
                t.includes('if i sell') ||
                t.includes('if we sell') ||
                t.includes('plan to sell') ||
                /^\s*(?:yes|yeah|yep|ok|okay|sure|do it|go ahead)\s*$/i.test(q);

            let useScenario = false;

            // [deep-analysis] seeds from the "Run deeper AI analysis" button go to /api/answers —
            // same route as the comparison card. The narrative intercept lives there.
            // Must be declared first so downstream guards (isDownPaymentFollowUp) can't override.
            const isDeepAnalysisSeed = /^\[deep-analysis\]/i.test(q);

            // Comparison questions always go to answers route — deterministic math card, same as DSCR/FHA
            // [deep-analysis] seeds are excluded — they need narrative AI, not the card again
            // NOTE: avoid \b(5.*20) patterns — "5" in "$1,500,000" triggers a false positive
            const isComparisonQuestion = !isDeepAnalysisSeed && (
                /(?:5\s*%|five\s*percent)\s*(?:vs|versus|or|compared\s*to)\s*(?:20\s*%|twenty\s*percent)/i.test(q) ||
                /(?:20\s*%|twenty\s*percent)\s*(?:vs|versus|or|compared\s*to)\s*(?:5\s*%|five\s*percent)/i.test(q) ||
                /compare\s+5\s*%?\s*(?:vs?|versus|or)\s*20\s*%/i.test(q) ||
                /\bdown\s*payment\s*(comparison|vs|versus)\b/i.test(q) ||
                /\brate\s*buydown\b.{0,30}\b(vs|versus|price\s*reduction)\b/i.test(q) ||
                /\bseller\s*credit\b.{0,30}\b(rate|buydown|reduction)\b/i.test(q) ||
                /\b15\s*(yr|year).{0,20}(vs|versus).{0,20}30\s*(yr|year)\b/i.test(q) ||
                /\b30\s*(yr|year).{0,20}(vs|versus).{0,20}15\s*(yr|year)\b/i.test(q) ||
                /\brent\s*(vs|versus)\s*buy\b/i.test(q) ||
                /\bshould\s*i\s*(rent|buy)\b/i.test(q)
            );

            // FHA questions (with or without conventional comparison) ALWAYS stay in answers route.
            // Also: if last route was FHA/answers and this looks like a down-payment follow-up,
            // keep it in answers (e.g. "show me 10% down scenario" after FHA analysis).
            const isFHAQuestion =
                /\bfha\b/i.test(q) ||
                /\bmip\b|\bufmip\b/i.test(q) ||
                /3\.5\s*%\s*down/i.test(q);

            // Follow-up that changes down payment % while in FHA/affordability context
            // Excluded: comparison questions and deep-analysis seeds have their own routing above
            const isDownPaymentFollowUp =
                !isDeepAnalysisSeed &&
                !isComparisonQuestion &&
                lastRoute === 'answers' &&
                /\b(\d+)\s*%\s*down\b/i.test(q);

            // Refi follow-ups ALWAYS go to answers — refi_advisor_v2 lives there, not in scenario route.
            // Also: cash-out equity questions belong in answers (not investment scenario analysis).
            // NOTE: "what if.*%" narrowed to rate-specific — avoids swallowing "what if I put 30% down?"
            // from a scenario context where isFollowUp+lastRoute should take precedence.
            const isRefiFollowUp =
                /rates?\s+(?:go|drop|fall|hit|come\s*down)|drop\s+to|down\s+to|what\s+if.*(?:rate|rates?|mortgage).*%|what\s+if.*%.*(?:rate|rates?|drop|fall|go|hit)|refi|refinanc|cash.?out/i.test(q);

            // Safety net: if the previous answer came from answers route, keep non-investment
            // follow-ups there. Prevents looksLikeScenario heuristic from drifting answer-route
            // conversations into the investment AI engine.
            // Exception: DSCR / investment / rental property signals that genuinely need scenario.
            const isAnswersRouteFollowUp =
                !isDeepAnalysisSeed &&
                !isComparisonQuestion &&
                lastRoute === 'answers' &&
                !/\b(dscr|cap\s*rate|vacancy|noi|gross\s*rent|net\s*operating|investment\s*property|rental\s*income|cash\s*flow|debt\s*service)\b/i.test(q);

            if (isDeepAnalysisSeed) {
                useScenario = false; // deep analysis → /api/answers, same as the comparison card
                console.log('[Routing] Deep-analysis seed — answers route (narrative intercept)');
            } else if (isComparisonQuestion) {
                useScenario = false; // comparison cards are deterministic — answers route, same as DSCR/FHA
                console.log('[Routing] Comparison question — answers route (deterministic card)');
            } else if (isFHAQuestion || isDownPaymentFollowUp || isRefiFollowUp || isAnswersRouteFollowUp) {
                useScenario = false;
                console.log('[Routing] FHA/down-payment/refi/answers-safety follow-up, forcing answers route');
            } else if (isFollowUp && lastRoute) {
                // Follow-up: stick with previous route
                useScenario = lastRoute === 'scenario';
                console.log('[Routing] Follow-up detected, using last route:', lastRoute);
            } else if (forceScenario) {
                // Forced via URL parameter
                useScenario = true;
            } else {
                // New question: detect route normally.
                // NOTE: bare 'scenario' word removed — too broad, fires on borrower follow-ups like
                // "show me a 10% down scenario". Real investment scenarios have DSCR/rent/cash flow context.

                // Rate/market questions ALWAYS go to answers (FRED) — never scenario
                // "30 year fixed", "10 year note/treasury", "current rates", "what are rates"
                const isRateMarketQuestion =
                    /\b(30|15|20)\s*[- ]?year\s*(fixed|mortgage|rate|loan)?/i.test(q) ||
                    /\b10\s*[- ]?year\s*(note|treasury|yield|bond|t-?note)/i.test(q) ||
                    /\b(current|today.?s?|what.?s?|where.?s?)\s+(mortgage\s+)?rate/i.test(q) ||
                    /\bfed\s+(rate|fund|funds)/i.test(q) ||
                    /\b(rate|rates)\s+(right now|today|currently)/i.test(q) ||
                    /what.{0,20}(10|ten).{0,20}(note|treasury|yield)/i.test(q);

                if (isRateMarketQuestion) {
                    useScenario = false;
                    console.log('[Routing] Rate/market question — forcing answers route');
                } else {

                    const looksLikeScenario =
                        t.includes('compare') ||
                        t.includes(' vs ') ||
                        t.includes('cash out') ||
                        t.includes('cash-out') ||
                        t.includes('projection') ||
                        t.includes('stress test');
                    // NOTE: removed '10-year'/'10 year'/'5-year'/'5 year' — these fire on
                    // rate questions like "30 year fixed" and "10 year note/treasury"
                    // NOTE: removed 'scenario' (too broad) and 'insurance' (too broad)
                    // NOTE: removed bare 'equity' — fires on "do I have enough equity in savings"

                    const hasNumbersContext = /\$\s?\d+|\d+%|\b\d+\s*(yr|yrs|year|years)\b/.test(t);

                    useScenario = looksLikeScenario && hasNumbersContext;
                } // end !isRateMarketQuestion
            }

            // Slider card "Run My Numbers" always needs answers route — paramOverrides are only
            // processed there. Seeds containing "15 year" / "20 year" would otherwise be flagged
            // as isFollowUp and inherit the scenario route, silently dropping the overrides.
            if (pendingParamOverridesRef.current) {
                useScenario = false;
            }

            // Endpoint + payload
            const answersEndpoint = useScenario ? '/api/answers/scenario' : '/api/answers';

            const payload = useScenario
                ? {
                    message: q,
                    userId: user?.id || 'anon',
                    chat_id: activeId || tid,
                    memory_thread_id: existingMemoryThreadId,
                }
                : {
                    ...body,
                    chat_id: activeId || tid,
                    memory_thread_id: existingMemoryThreadId,
                    // Structured overrides from chip/slider — read from ref (stale-closure safe)
                    ...(pendingParamOverridesRef.current ? { paramOverrides: pendingParamOverridesRef.current } : {}),
                };

            // Clear pending overrides — they're now in the payload, one-shot use
            pendingParamOverridesRef.current = null;
            setPendingParamOverrides(null);

            // === End scenario routing ===


            const r = await fetch(answersEndpoint, {

                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const raw = await safeJson(r);
            const meta: ApiResponse = useScenario
                ? scenarioToApiResponse(raw?.answer?.meta?.grok ?? raw?.answer?.grok ?? raw?.answer ?? raw?.grok ?? raw)
                : (raw as ApiResponse);

            // Detect and persist CMA context — set as soon as any response has a chip with cmaAddress.
            // Using a ref (not state/useMemo) ensures slider re-runs always see the latest value
            // regardless of stale closures or whether messages-array meta is populated yet.
            const _cmaChip = raw?.follow_up_chips?.find((c: any) => c.paramOverrides?.cmaAddress);
            if (_cmaChip?.paramOverrides) {
                const _po = _cmaChip.paramOverrides;
                cmaContextRef.current = {
                    cmaAddress:   _po.cmaAddress   ?? null,
                    cmaCity:      _po.cmaCity      ?? null,
                    cmaState:     _po.cmaState     ?? null,
                    cmaPrice:     _po.cmaPrice     ?? null,
                    cmaBeds:      _po.cmaBeds      ?? null,
                    cmaBaths:     _po.cmaBaths     ?? null,
                    cmaSqft:      _po.cmaSqft      ?? null,
                    cmaTaxAnnual: _po.cmaTaxAnnual ?? null,
                    cmaTaxRate:   _po.cmaTaxRate   ?? null,
                    cmaLiveRate:  _po.cmaLiveRate  ?? null,
                    cmaPhotoUrl:  _po.cmaPhotoUrl  ?? null,
                };
            }

            // Save memory_thread_id for future questions in this conversation
            const returnedMemoryThreadId =
                raw?.memory_thread_id ||
                raw?.answer?.memory_thread_id ||
                raw?.meta?.memory_thread_id ||
                raw?.grok?.meta?.memory_thread_id ||
                meta?.grok?.meta?.memory_thread_id;

            if (returnedMemoryThreadId && tid) {
                setMemoryThreadByChatId(prev => ({
                    ...prev,
                    [tid]: returnedMemoryThreadId
                }));
            }

            // Persist messages to Supabase on every response that has a thread ID.
            // This is the only place chat messages (including cmaCard meta) are saved.
            // Decoupled from memory_thread_id so CMA/early-return paths are also persisted.
            if (tid) {
                const chatTitle = history.find(h => h.id === tid)?.title ?? title;
                fetch('/api/chat-threads', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: tid,
                        title: chatTitle,
                        ...(returnedMemoryThreadId ? { memory_thread_id: returnedMemoryThreadId } : {}),
                        messages: [...(threads[tid] ?? []), ...messages],
                    }),
                }).catch(() => { /* non-fatal */ });
            }

            // Attach Grok metadata to the assistant message (under m.meta)
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === answerId && m.role === 'assistant'
                        ? {
                            ...m,
                            meta,      // <--- meta now lives under m.meta
                            raw,       // <--- full raw response for debug panel
                            content: '', // typewriter will fill summary, not markdown
                        }
                        : m
                )
            );



            const friendly =
                meta.message ??
                meta.summary ??
                (meta.fred &&
                    meta.fred.tenYearYield != null &&
                    meta.fred.mort30Avg != null &&
                    meta.fred.spread != null
                    ? `As of ${meta.fred.asOf ?? 'recent data'
                    }: ${typeof meta.fred.tenYearYield === 'number'
                        ? `${meta.fred.tenYearYield.toFixed(2)}%`
                        : meta.fred.tenYearYield
                    } 10Y, ${typeof meta.fred.mort30Avg === 'number'
                        ? `${meta.fred.mort30Avg.toFixed(2)}%`
                        : meta.fred.mort30Avg
                    } 30Y, spread ${typeof meta.fred.spread === 'number'
                        ? `${meta.fred.spread.toFixed(2)}%`
                        : meta.fred.spread
                    }.`
                    : typeof meta.answer === 'string'
                        ? meta.answer
                        : `path: ${meta.path} | usedFRED: ${String(
                            meta.usedFRED
                        )} | confidence: ${meta.confidence ?? '-'}`);

            // Fire-and-forget: log this Q&A to the user's library (signed-in only)
            try {
                if (isSignedIn) {
                    void logAnswerToLibrary(q, { friendly, meta });
                }
            } catch (err) {
                console.error('Library logging error:', err);
            }


            // Credits exhausted — hard block
            if (meta.credits_exhausted) {
                setCreditState({ state: 'blocked', grace_remaining: 0, balance: 0 });
                return;
            }

            // If the backend signals that a limit was hit, surface the right modal
            if (meta.upgradeRequired || meta.limitHit) {
                if (clerkLoaded && !isSignedIn) {
                    setShowAuthRequired(true);
                } else {
                    setShowUpgradeRequired(true);
                }
            }

            // Type out the actual answer text into the existing assistant bubble.
            // For affordability cards: use a short constructed summary so the typewriter
            // shows a brief sentence, not the full Grok answer with tables.
            const fullText = meta.affordabilitySlider
                ? (() => {
                    const sl = meta.affordabilitySlider as { annualIncome: number; savings: number; rate: number };
                    const incK = sl.annualIncome >= 1000
                        ? `$${Math.round(sl.annualIncome / 1000)}k`
                        : `$${sl.annualIncome.toLocaleString()}`;
                    const savK = sl.savings >= 1000
                        ? `$${Math.round(sl.savings / 1000)}k`
                        : `$${sl.savings.toLocaleString()}`;
                    return `Based on your ${incK}/yr income and ${savK} in savings, here are your affordability options across 3 programs.`;
                })()
                : meta.convHBSlider
                ? (() => {
                    const sl = meta.convHBSlider as { price: number; downPct: number; rate: number };
                    const prK = sl.price >= 1000000
                        ? `$${(sl.price / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.price / 1000)}k`;
                    return `Here's your conventional payment breakdown for a ${prK} home at ${sl.rate.toFixed(2)}% — ${sl.downPct}% down.`;
                })()
                : meta.incomeQualifySlider
                ? (() => {
                    const sl = meta.incomeQualifySlider as { price: number; downPct: number; rate: number };
                    const prK = sl.price >= 1000000
                        ? `$${(sl.price / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.price / 1000)}k`;
                    return `Here's the minimum income to qualify for a ${prK} home at ${sl.rate.toFixed(2)}% — ${sl.downPct}% down.`;
                })()
                : meta.fhaSlider
                ? (() => {
                    const sl = meta.fhaSlider as { price: number; downPct: number; rate: number };
                    const prK = sl.price >= 1000000
                        ? `$${(sl.price / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.price / 1000)}k`;
                    return `Here's your FHA payment breakdown for a ${prK} home at ${sl.rate.toFixed(2)}% — ${sl.downPct}% down.`;
                })()
                : meta.jumboSlider
                ? (() => {
                    const sl = meta.jumboSlider as { price: number; downPct: number; rate: number };
                    const prK = sl.price >= 1000000
                        ? `$${(sl.price / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.price / 1000)}k`;
                    return `Here's your jumbo loan breakdown for a ${prK} home at ${sl.rate.toFixed(2)}% — ${sl.downPct}% down.`;
                })()
                : meta.dscrSlider
                ? (() => {
                    const sl = meta.dscrSlider as { price: number; downPct: number; rate: number };
                    const prK = sl.price >= 1000000
                        ? `$${(sl.price / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.price / 1000)}k`;
                    return `Here's your DSCR investment analysis for a ${prK} property at ${sl.rate.toFixed(2)}% — ${sl.downPct}% down.`;
                })()
                : meta.vaSlider
                ? (() => {
                    const sl = meta.vaSlider as { price: number; downPct: number; rate: number };
                    const prK = sl.price >= 1000000
                        ? `$${(sl.price / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.price / 1000)}k`;
                    return `Here's your VA loan breakdown for a ${prK} home at ${sl.rate.toFixed(2)}% — ${sl.downPct}% down.`;
                })()
                : meta.refiIntelligenceCard
                ? (() => {
                    const sl = meta.refiIntelligenceCard as { balance: number; currentRate: number; newRate: number };
                    const refiRate = parseFloat((sl.newRate + 0.125).toFixed(3));
                    const balK = sl.balance >= 1000000
                        ? `$${(sl.balance / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.balance / 1000)}k`;
                    return `Here's your refi analysis — dropping from ${sl.currentRate.toFixed(2)}% to ${refiRate.toFixed(2)}% on a ${balK} balance.`;
                })()
                : meta.refiSlider
                ? (() => {
                    const sl = meta.refiSlider as { balance: number; currentRate: number; newRate: number };
                    const balK = sl.balance >= 1000000
                        ? `$${(sl.balance / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.balance / 1000)}k`;
                    return `Here's your refi breakdown — dropping from ${sl.currentRate.toFixed(2)}% to ${sl.newRate.toFixed(2)}% on a ${balK} balance.`;
                })()
                : meta.loanLimitsSlider
                ? (() => {
                    const sl = meta.loanLimitsSlider as { price: number; baseRate: number };
                    const prK = sl.price >= 1000000
                        ? `$${(sl.price / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.price / 1000)}k`;
                    return `Here's your loan limit breakdown for a ${prK} home at ${sl.baseRate.toFixed(2)}%.`;
                })()
                : meta.jumboAffordabilitySlider
                ? (() => {
                    const sl = meta.jumboAffordabilitySlider as { price: number; downPct: number; baseRate: number };
                    const prK = sl.price >= 1000000
                        ? `$${(sl.price / 1000000).toFixed(2)}M`
                        : `$${Math.round(sl.price / 1000)}k`;
                    return `Here's your jumbo affordability breakdown for a ${prK} home at ${sl.baseRate.toFixed(2)}% — ${sl.downPct}% down.`;
                })()
                : friendly;
            // Short constructed sentences use slow tick (3 chars/tick) so typewriter is visible
            typeOutAssistant(answerId, fullText, (meta.affordabilitySlider || meta.convHBSlider || meta.incomeQualifySlider || meta.fhaSlider || meta.jumboSlider || meta.dscrSlider || meta.vaSlider || meta.refiIntelligenceCard || meta.refiSlider || meta.loanLimitsSlider || meta.jumboAffordabilitySlider) ? 3 : 24);

            // Save which route we used for this thread
            // If the response was a refi intercept (from either route), always treat as 'scenario'
            const isRefiBypass =
                raw?.debug?.bypass === 'refi_advisor_v2' ||
                raw?.grok?.debug?.bypass === 'refi_advisor_v2' ||
                (raw?.grok?.confidence as string)?.includes('refi calc') ||
                (raw?.grok?.confidence as string)?.includes('refi:');
            if (tid) {
                setLastRouteByThread(prev => ({
                    ...prev,
                    [tid]: (useScenario && !isRefiBypass) ? 'scenario' : 'answers'
                }));
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setMessages((m) => [
                ...m,
                { id: uid(), role: 'assistant', content: `Error: ${msg}` },
            ]);
        } finally {
            setLoading(false);
            // Refresh credit state after every query (non-blocking)
            if (isSignedIn) refreshCreditState();
        }
    }

    function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    async function onShare() {
        if (messages.length === 0) {
            alert('No conversation to share yet.');
            return;
        }
        try {
            const res = await fetch('/api/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages }),
            });
            const data = await res.json();
            if (data.ok && data.url) {
                await navigator.clipboard.writeText(data.url).catch(() => { });
                alert(`Share link copied!\n\n${data.url}\n\nAnyone with this link can view and continue this conversation.`);
            } else {
                console.error('[Share] Failed:', data.error);
                alert('Failed to create share link. Please try again.');
            }
        } catch (err) {
            console.error('[Share] Error:', err);
            alert('Failed to create share link. Please try again.');
        }
    }

    function onSettings() {
        setShowSettings(true);
    }

    function onSearch() {
        setShowSearch(true);
    }

    function onLibrary() {
        setShowLibrary(true);
    }

    function onNewProject() {
        setShowProject(true);
    }

    function onLabSeed(seed: string) {
        newChat();
        setInput(seed);
        setTimeout(() => send(seed), 50);
    }

    // ASK UNDERWRITING: seeds the Ask pill with an underwriting-flavored prompt
    function onAskUnderwriting() {
        const seed = 'Show me Ask Underwriting';
        newChat();
        setInput(seed);
        setTimeout(() => send(seed), 50);
    }
    // ABOUT HOMERATES: seeds the composer to trigger the "about" module
    function onAboutHomeRates() {
        const seed =
            'What is HomeRates.ai and what makes this different from other mortgage & Ai Apps?';
        newChat();
        setInput(seed);
        setTimeout(() => send(seed), 50);
    }
    const onHowItWorks = () => {
        const seed = 'How does HomeRates.ai work?';
        newChat();
        setInput(seed);
        setTimeout(() => send(seed), 50);
    };

    // PRICE CHECK: opens a new chat, highlights the ask pill with a prompt placeholder
    function onPriceCheck() {
        newChat();
        setInput('');
        setPriceCheckMode(true);
        setTimeout(() => {
            if (composerRef.current) {
                composerRef.current.focus();
                composerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 80);
    }

    function closeAllOverlays() {
        setShowSearch(false);
        setShowLibrary(false);
        setShowSettings(false);
        setShowProject(false);
        setShowMortgageCalc(false);
    }



    return (
        <>
            {/* Sidebar */}
            <Sidebar
                id="hr-sidebar"
                history={history}
                activeId={activeId}
                isOpen={sidebarOpen}
                onToggle={toggleSidebar}
                onSelectHistory={onSelectHistory}
                onHistoryAction={handleHistoryAction}
                onNewChat={newChat}
                onSettings={onSettings}
                onShare={onShare}
                onSearch={onSearch}
                onLibrary={onLibrary}
                onNewProject={onNewProject}
                onLabSeed={onLabSeed}
                onAskUnderwriting={onAskUnderwriting}
                onAboutHomeRates={onAboutHomeRates}
                onHowItWorks={onHowItWorks}
                onPriceCheck={onPriceCheck}
                onProjectAction={handleProjectAction}
                onMoveChatToProject={handleMoveChatToProject}
            />




            {/* Main */}
            <section
                className="main"
                style={{
                    minHeight: '100dvh',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div className="header">
                    <div className="header-inner" style={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: '100%', margin: 0 }}>
                        {/* Logo zone — fixed 256px, centered above sidebar */}
                        <div className="header-logo-zone">
                            <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                                <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" style={{ height: 45, width: 'auto', display: 'block' }} />
                            </a>
                        </div>

                        {/* Nav — same as landing page */}
                        <nav className="app-nav">
                            <a href="/" className="app-nav-link">Home</a>
                            <button type="button" className="app-nav-link" onClick={() => newChat()}>Scenario Engine</button>
                            <a href="/lab" className="app-nav-link">HomeRates Lab</a>
                            {user && <a href="/library" className="app-nav-link">My Vault</a>}
                        </nav>

                        {/* Right controls */}
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertBell />
                            <SettingsPanel />
                            <MenuButton isOpen={sidebarOpen} onToggle={toggleSidebar} />
                        </div>
                    </div>
                </div>

                {/* ── Back bar — shown when chat was opened from another page ── */}
                {(() => {
                    const fromUrl  = searchParams?.get('from');
                    const rawLabel = searchParams?.get('fromLabel');
                    if (!fromUrl) return null;
                    const labelMap: Record<string, string> = {
                        '/':                          'Home',
                        '/my-home':                   'My Properties',
                        '/homeowner':                 'Home Value',
                        '/check-property':            'Property Search',
                        '/affordability-calculator':  'Affordability Calculator',
                        '/refinance-calculator':      'Refi Calculator',
                        '/fha-calculator':            'FHA Calculator',
                        '/dscr-calculator':           'DSCR Calculator',
                        '/va-calculator':             'VA Calculator',
                        '/loan-limits':               'Loan Limits',
                        '/knowledge-hub':             'Knowledge Hub',
                        '/market-news':               'Market News',
                    };
                    const label = rawLabel ?? labelMap[fromUrl.split('?')[0]] ?? 'Back';
                    return (
                        <div style={{
                            background: 'rgba(0,0,0,0.3)',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            padding: '7px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 12,
                            flexShrink: 0,
                        }}>
                            <a
                                href={fromUrl}
                                style={{ color: '#7ee3ff', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                            >
                                ← {label}
                            </a>
                            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>· tab still open</span>
                        </div>
                    );
                })()}

                <div
                    ref={scrollRef}
                    className="scroll"
                    style={{
                        flex: '1 1 auto',
                        minHeight: 0,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        overflowAnchor: 'none',
                    }}
                >
                    <div className="center">
                        <div className="messages">
                            {(messages.length === 0 || (messages.length === 1 && messages[0].content === 'New chat. What do you want to figure out?'))
                                ? <WelcomeScreen
                                    onSend={(s) => { newChat(); setTimeout(() => send(s as string), 50); }}
                                    onMount={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                                    onPriceCheck={onPriceCheck}
                                />
                                : (() => {
                                    // Index of the last assistant message that has follow-up chips —
                                    // chips are only shown on that message so stale chips from earlier
                                    // adjusted-scenario runs don't confuse the user.
                                    const lastChipIdx = messages.reduce((acc, msg, i) =>
                                        msg.role === 'assistant' && (msg as any).meta?.follow_up_chips?.length ? i : acc, -1);
                                    return messages.map((m, mIdx) => {
                                    const prevQuestion = m.role === 'assistant'
                                        ? messages.slice(0, mIdx).reverse().find((x) => x.role === 'user')?.content ?? ''
                                        : '';

                                    const saveToVault = (user && m.role === 'assistant') ? async () => {
                                        const assistantMeta = (m as Extract<ChatMsg, { role: 'assistant' }>).meta;
                                        const answer = assistantMeta?.answerMarkdown ?? (typeof m.content === 'string' ? m.content : '');
                                        await fetch('/api/library', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ question: prevQuestion, answer, tool_id: 'vault_save' }),
                                        });
                                    } : undefined;

                                    return (
                                    <div key={m.id} data-message-id={m.id}>
                                        <Bubble role={m.role}>
                                            {m.role === 'assistant' ? (
                                                // If this is a Grok-style answer with markdown, use GrokCard
                                                m.meta && (m.meta.grok || m.meta.answerMarkdown) ? (
                                                    <>
                                                        {/* GrokCard:
                                                            - For non-affordability: always shown
                                                            - For affordability while typing: shown with m.content only
                                                              (gives typewriter effect without flashing old table content)
                                                            - For affordability after typing: suppressed (card takes over)
                                                        */}
                                                        {((!m.meta.affordabilitySlider && !m.meta.convHBSlider && !m.meta.incomeQualifySlider && !m.meta.fhaSlider && !m.meta.jumboSlider && !m.meta.dscrSlider && !m.meta.vaSlider && !m.meta.refiIntelligenceCard && !m.meta.refiSlider && !m.meta.loanLimitsSlider && !m.meta.jumboAffordabilitySlider && !m.meta.helocCard) || (typingId === m.id && typeof m.content === 'string' && m.content.length > 0)) && (
                                                        <GrokCard
                                                            data={{
                                                                // When chips exist: strip follow_up out of grok entirely
                                                                // so GrokCard cannot render its own button at all.
                                                                grok: m.meta.follow_up_chips?.length
                                                                    ? { ...m.meta.grok, follow_up: undefined, followUp: undefined }
                                                                    : m.meta.grok,
                                                                // For slider cards during typing: only show m.content (the friendly summary),
                                                                // never m.meta.answerMarkdown (which contains the old full tables).
                                                                answerMarkdown: (m.meta.affordabilitySlider || m.meta.convHBSlider || m.meta.incomeQualifySlider || m.meta.fhaSlider || m.meta.jumboSlider || m.meta.dscrSlider || m.meta.vaSlider || m.meta.refiIntelligenceCard || m.meta.helocCard)
                                                                    ? sanitizeMarkdown(typeof m.content === 'string' ? m.content : '')
                                                                    : sanitizeMarkdown(
                                                                        (typeof m.content === 'string' && m.content.length > 0)
                                                                            ? m.content
                                                                            : (m.meta.answerMarkdown ?? '')
                                                                    ),
                                                                followUp: m.meta.follow_up_chips?.length
                                                                    ? undefined
                                                                    : ((m.meta.affordabilitySlider || m.meta.convHBSlider || m.meta.incomeQualifySlider || m.meta.fhaSlider || m.meta.jumboSlider || m.meta.dscrSlider || m.meta.vaSlider || m.meta.refiIntelligenceCard || m.meta.helocCard) ? undefined : (m.meta.followUp ?? undefined)),
                                                                data_freshness:
                                                                    m.meta.data_freshness ??
                                                                    m.meta.fred?.asOf ??
                                                                    '',
                                                            }}
                                                            onFollowUp={(q: string) => {
                                                                // When chips exist, ignore anything GrokCard fires —
                                                                // chips are the only follow-up mechanism.
                                                                if (!q || m.meta?.follow_up_chips?.length) return;
                                                                setInput(q);
                                                            }}
                                                            onSaveToVault={saveToVault}
                                                        />
                                                        )}
                                                        {/* Admin debug panel — shows raw JSON + math fields */}
                                                        {isAdmin && (
                                                            <DebugPanel meta={m.meta} raw={(m as any).raw} />
                                                        )}
                                                        {/* Property preview card — inside Bubble, above slider cards */}
                                                        {m.meta.propertyCard && (
                                                            <PropertyPreviewCard
                                                                data={m.meta.propertyCard as PropertyCardData}
                                                            />
                                                        )}
                                                        {/* Property Intelligence Card (CMA) */}
                                                        {m.meta.cmaCard && !loading && typingId === null && (
                                                            <>
                                                                <PropertyIntelligenceCard
                                                                    data={{ ...(m.meta.cmaCard as CMACardData), onRunScenario: (seed) => { setTimeout(() => send(seed), 50); } }}
                                                                    onSaveToVault={user ? async () => {
                                                                        const cma = (m as Extract<ChatMsg, { role: 'assistant' }>).meta?.cmaCard as CMACardData;
                                                                        await fetch('/api/library', {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({
                                                                                question: prevQuestion || `Property analysis: ${cma.address}`,
                                                                                answer: cma.answerMarkdown,
                                                                                tool_id: 'vault_save_cma',
                                                                            }),
                                                                        });
                                                                    } : undefined}
                                                                />
                                                                <AlertSetupCard
                                                                    type="property"
                                                                    prefill={{
                                                                        address: (m.meta.cmaCard as CMACardData).address,
                                                                        propertyValue: (m.meta.cmaCard as CMACardData).price,
                                                                    }}
                                                                />
                                                            </>
                                                        )}
                                                        {/* Conventional / High Balance slider card */}
                                                        {m.meta.convHBSlider && !loading && typingId === null && (
                                                            <ConvHBSliderCard
                                                                {...m.meta.convHBSlider}
                                                                onRunScenario={(seed, overrides) => {
                                                                    pendingParamOverridesRef.current = overrides;
                                                                    setPendingParamOverrides(overrides);
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* Income Qualify slider card */}
                                                        {m.meta.incomeQualifySlider && !loading && typingId === null && (
                                                            <IncomeQualifySliderCard
                                                                {...m.meta.incomeQualifySlider}
                                                                onRunScenario={(seed, overrides) => {
                                                                    pendingParamOverridesRef.current = overrides;
                                                                    setPendingParamOverrides(overrides);
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* FHA slider card */}
                                                        {m.meta.fhaSlider && !loading && typingId === null && (
                                                            <FhaSliderCard
                                                                {...m.meta.fhaSlider}
                                                                onRunScenario={(seed, overrides) => {
                                                                    pendingParamOverridesRef.current = overrides;
                                                                    setPendingParamOverrides(overrides);
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* Jumbo purchase payment slider card */}
                                                        {m.meta.jumboSlider && !loading && typingId === null && (
                                                            <JumboSliderCard
                                                                {...m.meta.jumboSlider}
                                                                onRunScenario={(seed, overrides) => {
                                                                    pendingParamOverridesRef.current = overrides;
                                                                    setPendingParamOverrides(overrides);
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* VA purchase slider card */}
                                                        {m.meta.vaSlider && !loading && typingId === null && (
                                                            <VaSliderCard
                                                                {...m.meta.vaSlider}
                                                                onRunScenario={(seed, overrides) => {
                                                                    pendingParamOverridesRef.current = overrides;
                                                                    setPendingParamOverrides(overrides);
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* Interactive slider card — Buydown answers (VA now handled by VaSliderCard) */}
                                                        {m.meta.interactiveSlider && m.meta.lenderChecklist?.loanType !== 'va' && m.meta.lenderChecklist?.loanType !== 'dscr' && !m.meta.vaSlider && !m.meta.dscrSlider && !m.meta.jumboAffordabilitySlider && !m.meta.fhaSlider && !m.meta.jumboSlider && !loading && typingId === null && (
                                                            <InteractiveSliderCard
                                                                {...m.meta.interactiveSlider}
                                                                onRunScenario={(seed, sliderParams) => {
                                                                    const overrides = { ...sliderParams, ...(cmaContextRef.current ?? {}) };
                                                                    pendingParamOverridesRef.current = overrides;
                                                                    setPendingParamOverrides(overrides);
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* Affordability slider card — income-based answers */}
                                                        {m.meta.affordabilitySlider && !loading && typingId === null && (
                                                            <AffordabilitySliderCard
                                                                {...m.meta.affordabilitySlider}
                                                                onRunScenario={(seed, overrides) => {
                                                                    pendingParamOverridesRef.current = overrides;
                                                                    setPendingParamOverrides(overrides);
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* DSCR slider card — investment property answers */}
                                                        {m.meta.dscrSlider && !loading && typingId === null && (
                                                            <DSCRSliderCard
                                                                {...m.meta.dscrSlider}
                                                                onRunScenario={(seed, overrides) => {
                                                                    if (overrides && Object.keys(overrides).length > 0) {
                                                                        pendingParamOverridesRef.current = overrides;
                                                                        setPendingParamOverrides(overrides);
                                                                    }
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* Refi Intelligence Card — full dual-mode refi analysis */}
                                                        {m.meta.refiIntelligenceCard && !loading && typingId === null && (
                                                            <RefiIntelligenceCard
                                                                {...m.meta.refiIntelligenceCard}
                                                                onRunScenario={(seed, sliderParams) => {
                                                                    if (sliderParams && Object.keys(sliderParams).length > 0) {
                                                                        pendingParamOverridesRef.current = sliderParams;
                                                                        setPendingParamOverrides(sliderParams);
                                                                    }
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* Refi slider card — refinance answers */}
                                                        {m.meta.refiSlider && !m.meta.refiIntelligenceCard && !loading && typingId === null && (
                                                            <>
                                                                <RefiSliderCard
                                                                    {...m.meta.refiSlider}
                                                                    onRunScenario={(seed, sliderParams) => {
                                                                        if (sliderParams && Object.keys(sliderParams).length > 0) {
                                                                            pendingParamOverridesRef.current = sliderParams;
                                                                            setPendingParamOverrides(sliderParams);
                                                                        }
                                                                        setTimeout(() => send(seed), 50);
                                                                    }}
                                                                />
                                                                <AlertSetupCard
                                                                    type="refi"
                                                                    prefill={{
                                                                        currentRate: m.meta.refiSlider.currentRate,
                                                                        balance: m.meta.refiSlider.balance,
                                                                    }}
                                                                />
                                                            </>
                                                        )}
                                                        {/* HELOC slider card — equity options answers */}
                                                        {m.meta.helocCard && !loading && typingId === null && (
                                                            <HelocSliderCard
                                                                {...m.meta.helocCard}
                                                                onRunScenario={(seed) => send(seed)}
                                                            />
                                                        )}
                                                        {/* CA Loan Limits slider card */}
                                                        {m.meta.loanLimitsSlider && !loading && typingId === null && (
                                                            <LoanLimitsSliderCard
                                                                {...m.meta.loanLimitsSlider}
                                                                onRunScenario={(seed, sliderParams) => {
                                                                    pendingParamOverridesRef.current = sliderParams;
                                                                    setPendingParamOverrides(sliderParams);
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* Jumbo affordability card */}
                                                        {m.meta.jumboAffordabilitySlider && !m.meta.jumboSlider && !loading && typingId === null && (
                                                            <JumboAffordabilitySliderCard
                                                                {...m.meta.jumboAffordabilitySlider}
                                                                onRunScenario={(seed, sliderParams) => {
                                                                    pendingParamOverridesRef.current = sliderParams;
                                                                    setPendingParamOverrides(sliderParams);
                                                                    setTimeout(() => send(seed), 50);
                                                                }}
                                                            />
                                                        )}
                                                        {/* Scenario comparison card */}
                                                        {m.meta.scenarioComparisonCard && !loading && typingId === null && (
                                                            <ScenarioComparisonCard
                                                                {...m.meta.scenarioComparisonCard}
                                                                onRunScenario={(seed) => send(seed)}
                                                            />
                                                        )}
                                                        {/* Lender checklist card — suppressed when affordabilitySlider is present (new card covers the same data) */}
                                                        {m.meta.lenderChecklist && !m.meta.affordabilitySlider && !m.meta.convHBSlider && !m.meta.incomeQualifySlider && !m.meta.fhaSlider && !m.meta.jumboSlider && !loading && typingId === null && (
                                                            <LenderChecklistCard data={m.meta.lenderChecklist} />
                                                        )}
                                                        {/* HomeRates Lab — clickable module grid */}
                                                        {m.meta.labModules && !loading && typingId === null && (
                                                            <div style={{ marginTop: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
                                                                <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                        <span style={{ fontSize: 15 }}>🧪</span>
                                                                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#94a3b8' }}>HomeRates Lab</span>
                                                                    </div>
                                                                    <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>Click any module to run an instant example — or type your own numbers.</div>
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    {(m.meta.labModules as Array<{ icon: string; label: string; tag: string; desc: string; seed: string }>).map((mod, mi) => (
                                                                        <button
                                                                            key={mi}
                                                                            type="button"
                                                                            onClick={() => send(mod.seed)}
                                                                            style={{
                                                                                display: 'grid',
                                                                                gridTemplateColumns: '1fr 1fr',
                                                                                alignItems: 'center',
                                                                                padding: '10px 18px',
                                                                                background: 'transparent', border: 'none',
                                                                                borderTop: mi > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                                                                cursor: 'pointer', textAlign: 'left',
                                                                                transition: 'background 0.12s',
                                                                                width: '100%',
                                                                                gap: 0,
                                                                            }}
                                                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,232,122,0.06)')}
                                                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                                        >
                                                                            {/* Left col: icon + name + tag below */}
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                                                                                <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center' }}>{mod.icon}</span>
                                                                                <div>
                                                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{mod.label}</div>
                                                                                    <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>{mod.tag}</div>
                                                                                </div>
                                                                            </div>
                                                                            {/* Right col: scenario + Run */}
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14 }}>
                                                                                <span style={{ fontSize: 12, color: '#64748b' }}>{mod.desc}</span>
                                                                                <span style={{ fontSize: 11, color: '#00e87a', opacity: 0.8, flexShrink: 0, marginLeft: 12 }}>Run →</span>
                                                                            </div>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {/* Smart follow-up chips — only on the latest card to prevent stale chips from adjusted runs */}
                                                        {m.meta.follow_up_chips && m.meta.follow_up_chips.length > 0 && mIdx === lastChipIdx && !loading && typingId === null && (
                                                            <div className="follow-up-chips">
                                                                {m.meta.follow_up_chips.slice(0, 6).map((chip: { label: string; seed: string; paramOverrides?: Record<string, any> }, i: number) => (
                                                                    <button
                                                                        key={i}
                                                                        type="button"
                                                                        className="follow-up-chip-btn"
                                                                        onClick={() => {
                                                                            const chipParams = (chip as any).paramOverrides ?? null;
                                                                            if ((chip as any).url) { router.push((chip as any).url); return; }
                                                                            // inputOnly chips: fill input + focus, no API call
                                                                            if ((chip as any).inputOnly) {
                                                                                setInput(chip.seed);
                                                                                setTimeout(() => {
                                                                                    const el = document.querySelector('[data-testid="ask-pill"]') as HTMLInputElement;
                                                                                    if (el) { el.select(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                                                                                }, 50);
                                                                                return;
                                                                            }
                                                                            setInput(chip.seed);
                                                                            pendingParamOverridesRef.current = chipParams;
                                                                            setPendingParamOverrides(chipParams);
                                                                            pendingChipSeedRef.current = chip.seed;
                                                                            setTimeout(() => {
                                                                                const el = document.querySelector('[data-testid="ask-pill"]') as HTMLInputElement;
                                                                                if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                                                                            }, 50);
                                                                        }}
                                                                    >
                                                                        {chip.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : m.meta ? (
                                                    // Legacy / calc answers still use AnswerBlock (Grok card)
                                                    <GrokAnswerBlock
                                                        meta={m.meta}
                                                        friendly={
                                                            typeof m.content === 'string'
                                                                ? m.content
                                                                : undefined
                                                        }
                                                    />
                                                ) : (
                                                    // Bare assistant content fallback
                                                    typeof m.content === 'string' ? m.content : ''
                                                )
                                            ) : (
                                                // User messages unchanged
                                                m.content
                                            )}

                                            {m.role === 'assistant' &&
                                                m.meta &&
                                                ((!m.meta.affordabilitySlider && !m.meta.convHBSlider && !m.meta.incomeQualifySlider && !m.meta.fhaSlider && !m.meta.jumboSlider) || typingId === null) &&
                                                typeof m.content === 'string' &&
                                                m.content.trim().length > 40 && (
                                                    <div
                                                        style={{
                                                            marginTop: 4,
                                                            display: 'flex',
                                                            justifyContent: 'flex-end',
                                                        }}
                                                    >
                                                        <ShareAnswerButton
                                                            question="Question asked in HomeRates.ai"
                                                            answer={m.content}
                                                            messages={messages}
                                                            source="thread"
                                                        />
                                                    </div>
                                                )}


                                        </Bubble>

                                        {/* Pro upgrade gate card — outside Bubble so it renders
                                            regardless of which content branch (grok vs legacy) was taken */}
                                        {m.role === 'assistant' && m.meta?.proGate && !loading && (
                                            <ProUpgradeCard {...(m.meta.proGate as ProGatePayload)} />
                                        )}
                                    </div>
                                    );
                                }); })()}

                            {loading && (
                                <Bubble role="assistant">
                                    <div className="typing-dots" aria-label="HomeRates is thinking">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                </Bubble>
                            )}

                        </div>
                    </div>
                </div>

                {/* ── Credit grace banner ── shown when balance=0 but grace messages remain */}
                {isSignedIn && creditState.state === 'grace' && (
                    <div style={{
                        margin: '0 auto 6px', maxWidth: 640, width: '100%',
                        background: 'rgba(255,180,0,0.08)',
                        border: '1px solid rgba(255,180,0,0.22)',
                        borderRadius: 10, padding: '8px 14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 10, flexWrap: 'wrap',
                        fontSize: '0.8rem', color: '#e8b800',
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}>
                        <span>
                            ⚡ Credits empty —{' '}
                            <strong>{creditState.grace_remaining} grace {creditState.grace_remaining === 1 ? 'message' : 'messages'} left</strong>
                        </span>
                        <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <a href="/pricing" style={{
                                background: '#00e87a', color: '#080c12',
                                padding: '3px 10px', borderRadius: 6,
                                fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none',
                            }}>Upgrade $7/mo</a>
                            <a href="/profile" style={{
                                border: '1px solid rgba(255,180,0,0.3)', color: '#e8b800',
                                padding: '3px 10px', borderRadius: 6,
                                fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none',
                            }}>Refer +500 credits</a>
                        </span>
                    </div>
                )}

                {/* ── Credit blocked banner ── shown when all grace used up */}
                {isSignedIn && creditState.state === 'blocked' && (
                    <div style={{
                        margin: '0 auto 6px', maxWidth: 640, width: '100%',
                        background: 'rgba(255,95,95,0.07)',
                        border: '1px solid rgba(255,95,95,0.25)',
                        borderRadius: 12, padding: '16px 18px',
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}>
                        <div style={{ fontWeight: 700, color: '#ff5f5f', marginBottom: 4, fontSize: '0.9rem' }}>
                            ⛔ Credit balance empty
                        </div>
                        <div style={{ color: '#8fa3b8', fontSize: '0.82rem', marginBottom: 12, lineHeight: 1.5 }}>
                            You&apos;ve used your free credits and grace messages.
                            Upgrade for $7/mo to get 500 credits/month — or refer a friend to earn 500 free credits instantly.
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <a href="/pricing" style={{
                                background: '#00e87a', color: '#080c12',
                                padding: '6px 16px', borderRadius: 8,
                                fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none',
                            }}>Upgrade to Plus — $7/mo</a>
                            <a href="/profile" style={{
                                border: '1px solid rgba(255,255,255,0.1)', color: '#8fa3b8',
                                padding: '6px 14px', borderRadius: 8,
                                fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none',
                            }}>Refer a friend (+500 credits)</a>
                        </div>
                    </div>
                )}

                {/* HR: main Ask composer; isolated classes so globals don't interfere */}
                <div
                    className="hr-composer"
                    data-composer="primary"
                    style={{
                        // position/bottom now handled in CSS (desktop vs mobile)
                        zIndex: 900,
                        borderTop: '1px solid rgba(245, 247, 250, 0.06)',
                        background: '#080c12',
                    }}
                >
                    {/* Price Check floating hint — lives inside the sticky composer so it's always visible */}
                    {priceCheckMode && (
                        <div className="hr-price-check-hint" onClick={() => composerRef.current?.focus()}>
                            <span className="hr-price-check-hint__icon">🏠</span>
                            <span className="hr-price-check-hint__text">Paste a Zillow or Redfin listing URL below — I'll pull the numbers instantly</span>
                            <button
                                className="hr-price-check-hint__dismiss"
                                onClick={(e) => { e.stopPropagation(); setPriceCheckMode(false); }}
                                aria-label="Dismiss"
                            >✕</button>
                        </div>
                    )}

                    <div
                        className="hr-composer-inner"
                        style={{
                            maxWidth: 640,
                        }}
                    >
                        <textarea
                            ref={composerRef}
                            className={`hr-composer-input${priceCheckMode ? ' hr-composer-input--price-check' : ''}`}
                            placeholder={creditState.state === 'blocked' ? 'Upgrade to continue chatting…' : 'Ask about DTI, PMI, or where rates sit vs the 10-year ...'}
                            value={input}
                            disabled={creditState.state === 'blocked'}
                            rows={1}
                            onChange={(e) => {
                                setInput(e.target.value);
                                if (priceCheckMode) setPriceCheckMode(false);
                                // If user edits after chip click, drop paramOverrides — use text parsing instead
                                if (pendingChipSeedRef.current && e.target.value !== pendingChipSeedRef.current) {
                                    pendingParamOverridesRef.current = null;
                                    setPendingParamOverrides(null);
                                    pendingChipSeedRef.current = null;
                                }
                                // Auto-grow: reset then set to scrollHeight
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                            }}
                            onKeyDown={(e) => {
                                // Enter sends, Shift+Enter adds newline
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    onKey(e as any);
                                } else if (e.key === 'Enter' && e.shiftKey) {
                                    // allow newline — do nothing
                                }
                            }}
                            style={{
                                minHeight: 24,
                                maxHeight: 160,
                                padding: '4px 0',
                            }}
                        />

                        <button
                            className="hr-composer-send"
                            data-testid="ask-pill"
                            aria-label="Send message"
                            title="Send"
                            onClick={send}
                            disabled={loading || !input.trim() || creditState.state === 'blocked'}
                            style={{
                                opacity: loading || !input.trim() || creditState.state === 'blocked' ? 0.4 : 1,
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ------- Overlays (Search/Library/Settings/New Project/Mortgage Calc) ------- */}
                {(showSearch ||
                    showLibrary ||
                    showSettings ||
                    showProject ||
                    showMortgageCalc) && (
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Overlay"
                            onClick={(e) => {
                                if (e.target === e.currentTarget) closeAllOverlays();
                            }}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(0,0,0,0.35)',
                                display: 'grid',
                                placeItems: 'center',
                                zIndex: 5000,
                                maxWidth: '100vw',
                                overflowX: 'hidden',
                            }}
                        >
                            <div
                                className="panel"
                                style={{
                                    width: '100%', // fill the padded area, not the whole screen
                                    maxWidth: 520, // hard cap so it doesn't feel like an iPad on phones
                                    maxHeight: '80vh',
                                    overflowY: 'auto',
                                    padding: 16,
                                    paddingBottom: 32, // gives room under the buttons
                                    borderRadius: 12,
                                    background: 'var(--card)',
                                    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                                    display: 'grid',
                                    gap: 12,
                                    boxSizing: 'border-box',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                    }}
                                >
                                    <div style={{ fontWeight: 700 }}>
                                        {showSearch && 'Search'}
                                        {showLibrary && 'Library'}
                                        {showSettings && 'Settings'}
                                        {showProject && 'New Project'}
                                        {showMortgageCalc && 'Mortgage Calculator'}
                                    </div>
                                    <button
                                        className="btn"
                                        onClick={closeAllOverlays}
                                        aria-label="Close"
                                    >
                                        Close
                                    </button>
                                </div>

                                {/* SEARCH */}
                                {showSearch && (
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        <input
                                            className="input"
                                            placeholder="Search your current thread and history..."
                                            value={searchQuery}
                                            onChange={(e) =>
                                                setSearchQuery(e.target.value)
                                            }
                                            autoFocus
                                        />
                                        <div
                                            className="panel"
                                            style={{ display: 'grid', gap: 6 }}
                                        >
                                            <div style={{ fontWeight: 600 }}>
                                                Matches in current thread
                                            </div>
                                            <ul style={{ marginTop: 0 }}>
                                                {messages
                                                    .filter(
                                                        (m) =>
                                                            typeof m.content ===
                                                            'string' &&
                                                            m.content
                                                                .toLowerCase()
                                                                .includes(
                                                                    searchQuery.toLowerCase()
                                                                )
                                                    )
                                                    .slice(0, 12)
                                                    .map((m, i) => (
                                                        <li key={m.id + i}>
                                                            <b>
                                                                {m.role === 'user'
                                                                    ? 'You'
                                                                    : 'HomeRates'}
                                                                :
                                                            </b>{' '}
                                                            <span>
                                                                {(
                                                                    m.content as string
                                                                ).slice(0, 200)}
                                                            </span>
                                                        </li>
                                                    ))}
                                            </ul>
                                        </div>
                                        <div
                                            className="panel"
                                            style={{ display: 'grid', gap: 6 }}
                                        >
                                            <div style={{ fontWeight: 600 }}>
                                                Matches in history titles
                                            </div>
                                            <ul style={{ marginTop: 0 }}>
                                                {history
                                                    .filter((h) =>
                                                        h.title
                                                            .toLowerCase()
                                                            .includes(
                                                                searchQuery.toLowerCase()
                                                            )
                                                    )
                                                    .slice(0, 20)
                                                    .map((h) => (
                                                        <li key={h.id}>
                                                            <button
                                                                type="button"
                                                                className="btn"
                                                                style={{
                                                                    padding:
                                                                        '2px 6px',
                                                                    fontSize: 13,
                                                                    width: '100%',
                                                                    textAlign:
                                                                        'left',
                                                                }}
                                                                onClick={() =>
                                                                    onSelectHistory(
                                                                        h.id
                                                                    )
                                                                }
                                                            >
                                                                {h.title}
                                                            </button>
                                                        </li>
                                                    ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}

                                {/* LIBRARY */}
                                {showLibrary && (
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        <div style={{ color: 'var(--text-weak)' }}>
                                            Your recent chats:
                                        </div>
                                        <div className="chat-list" role="list">
                                            {history.length === 0 && (
                                                <div
                                                    className="chat-item"
                                                    style={{ opacity: 0.7 }}
                                                    role="listitem"
                                                >
                                                    No history yet
                                                </div>
                                            )}
                                            {history.map((h) => (
                                                <button
                                                    key={h.id}
                                                    className="chat-item"
                                                    role="listitem"
                                                    title={h.title}
                                                    onClick={() =>
                                                        onSelectHistory(h.id)
                                                    }
                                                    style={{ textAlign: 'left' }}
                                                >
                                                    {h.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* SETTINGS */}
                                {showSettings && (
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        <button
                                            className="btn"
                                            onClick={() => {
                                                setHistory([]);
                                                setMessages([
                                                    {
                                                        id: uid(),
                                                        role: 'assistant',
                                                        content:
                                                            'New chat. Ask me Anything?',
                                                    },
                                                ]);
                                                closeAllOverlays();
                                            }}
                                        >
                                            Clear history & reset chat
                                        </button>
                                    </div>
                                )}

                                {/* NEW PROJECT */}
                                {showProject && (
                                    <form
                                        onSubmit={(
                                            e: React.FormEvent<HTMLFormElement>
                                        ) => {
                                            e.preventDefault();
                                            const name =
                                                projectName.trim() ||
                                                'Untitled Project';
                                            const id = uid();
                                            setActiveId(id);
                                            setHistory((h) =>
                                                [
                                                    {
                                                        id,
                                                        title: `Project: ${name}`,
                                                        updatedAt: Date.now(),
                                                    },
                                                    ...h,
                                                ].slice(0, 20)
                                            );
                                            setMessages([
                                                {
                                                    id: uid(),
                                                    role: 'assistant',
                                                    content: `New Project "${name}" started. What is the goal?`,
                                                },
                                            ]);
                                            setProjectName('');
                                            closeAllOverlays();
                                        }}
                                        style={{ display: 'grid', gap: 10 }}
                                    >
                                        <input
                                            className="input"
                                            placeholder="Project name"
                                            value={projectName}
                                            onChange={(e) =>
                                                setProjectName(e.target.value)
                                            }
                                            autoFocus
                                        />
                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: 8,
                                            }}
                                        >
                                            <button
                                                className="btn primary"
                                                type="submit"
                                            >
                                                Create
                                            </button>
                                            <button
                                                className="btn"
                                                type="button"
                                                onClick={closeAllOverlays}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                )}

                                {/* MORTGAGE CALCULATOR (dedicated panel) */}
                                {showMortgageCalc && (
                                    <MortgageCalcPanel
                                        onCancel={closeAllOverlays}
                                        onSubmit={(res: CalcSubmitResult) => {
                                            closeAllOverlays();
                                            // echo a clean line + structured calc meta reply
                                            setMessages((m) => [
                                                ...m,
                                                {
                                                    id: uid(),
                                                    role: 'assistant',
                                                    content: `Guided inputs -> $${fmtMoney(
                                                        res.monthlyPI
                                                    )} P&I on $${fmtMoney(
                                                        res.loanAmount
                                                    )} at ${res.ratePct
                                                        }% for ${res.termYears}y.`,
                                                    meta: {
                                                        path: 'calc',
                                                        usedFRED: false,
                                                        generatedAt:
                                                            new Date().toISOString(),
                                                        answer: {
                                                            loanAmount:
                                                                res.loanAmount,
                                                            monthlyPI:
                                                                res.monthlyPI,
                                                            sensitivities:
                                                                res.sensitivities,
                                                        },
                                                    },
                                                },
                                            ]);
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                {/* -------- Auth-required (sign in for more free questions) modal -------- */}
                {showAuthRequired && (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            backgroundColor: 'rgba(0,0,0,0.45)',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            zIndex: 6000,
                        }}
                        onClick={() => setShowAuthRequired(false)}
                    >
                        <div
                            style={{
                                background: 'var(--surface, #111827)',
                                borderRadius: 16,
                                padding: 24,
                                maxWidth: 380,
                                width: '90%',
                                boxShadow: '0 18px 45px rgba(0,0,0,0.5)',
                                color: 'var(--fg, #e5e7eb)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2
                                style={{
                                    fontSize: 18,
                                    fontWeight: 600,
                                    marginBottom: 8,
                                }}
                            >
                                Sign in to keep going
                            </h2>
                            <p
                                style={{
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                    marginBottom: 20,
                                    opacity: 0.9,
                                }}
                            >
                                You&apos;ve used today&apos;s free guest
                                questions. Create a free HomeRates.ai account or
                                sign in to continue exploring educational mortgage
                                scenarios. All features remain educational and are
                                not personalized advice.
                            </p>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    gap: 8,
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => setShowAuthRequired(false)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: 999,
                                        border:
                                            '1px solid rgba(249,250,251,0.1)',
                                        background: 'transparent',
                                        color: 'inherit',
                                        fontSize: 13,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Maybe later
                                </button>
                                <button
                                    type="button"
                                    onClick={() => router.push('/sign-in')}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: 999,
                                        border: 'none',
                                        background:
                                            'var(--accent, #22c55e)',
                                        color: '#020617',
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Continue free
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* -------- Upgrade-required (Pro plan) modal -------- */}
                {showUpgradeRequired && (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            backgroundColor: 'rgba(0,0,0,0.45)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 6000,
                        }}
                        onClick={() => setShowUpgradeRequired(false)}
                    >
                        <div
                            style={{
                                background: 'var(--surface, #111827)',
                                borderRadius: 16,
                                padding: 24,
                                maxWidth: 380,
                                width: '90%',
                                boxShadow: '0 18px 45px rgba(0,0,0,0.5)',
                                color: 'var(--fg, #e5e7eb)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2
                                style={{
                                    fontSize: 18,
                                    fontWeight: 600,
                                    marginBottom: 8,
                                }}
                            >
                                Upgrade to HomeRates.ai Pro
                            </h2>
                            <p
                                style={{
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                    marginBottom: 20,
                                    opacity: 0.9,
                                }}
                            >
                                You&apos;ve reached today&apos;s free question
                                limit for your account. Upgrade to
                                HomeRates.ai&nbsp;Pro for unlimited questions
                                and full access to advanced mortgage tools and
                                scenario modeling.
                            </p>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    gap: 8,
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowUpgradeRequired(false)
                                    }
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: 999,
                                        border:
                                            '1px solid rgba(249,250,251,0.1)',
                                        background: 'transparent',
                                        color: 'inherit',
                                        fontSize: 13,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Maybe later
                                </button>
                                <button
                                    type="button"
                                    onClick={() => router.push('/upgrade')}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: 999,
                                        border: 'none',
                                        background:
                                            'var(--accent, #22c55e)',
                                        color: '#020617',
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: 'pointer',
                                    }}
                                >
                                    View plans
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </>
    );
}
// version: 2026-03-08-04-debug
// version: 2026-03-08-05
