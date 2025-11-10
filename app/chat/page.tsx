'use client';

import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';

const LS_KEY = 'hr.chat.v1';

type Role = 'user' | 'assistant';

/* =========================
   Calc helpers (UI)
========================= */
function isPaymentQuery(q: string) {
    const s = q.toLowerCase();

    // Strong patterns
    if (/\$?\s*\d[\d.,]*(?:\s*[km])?\s+(?:at|@)\s+\d+(?:\.\d+)?\s*%\s+for\s+\d+\s*(years?|yrs?|yr|y)?\b/.test(s)) return true;  // "$620k at 6.25% for 30 years"
    if (/\b\d+(?:\.\d+)?\s*%\s*down\b/.test(s) && /\d+(?:\.\d+)?\s*%/.test(s) && /\bfor\s+\d+/.test(s)) return true;            // "with 20% down at 6.25% for 30 years"

    // Common triggers
    if (/\bpay(ment|mnt|ments|mnts)?\b/.test(s)) return true;
    if (/\bmonthly\s*payment(s)?\b/.test(s)) return true;
    if (/\bp\s*&\s*i\b/.test(s)) return true;
    if (/\bprincipal\s*&?\s*interest\b/.test(s)) return true;

    // loan + % + years
    const hasLoan = /\bloan\b/.test(s);
    const hasRate = /\b\d+(\.\d+)?\s*%/.test(s);
    const hasYears = /\b\d+\s*(years?|yrs?|yr|y|yeards?)\b/.test(s);
    if (hasLoan && hasRate && hasYears) return true;

    // reverse: "$3800/mo", "payment is $3,800"
    if (/\$?\s*\d[\d.,]*\s*(?:\/?\s*)?(?:mo|month)\b/.test(s)) return true;
    if (/\bpayment\s*(?:is|=|:)?\s*\$?\s*\d[\d.,]*/.test(s)) return true;

    return false;
}

function isFiniteNum(n: unknown): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}
function parseMoney(raw: string | undefined | null): number | undefined {
    if (!raw) return undefined;
    const s = String(raw).trim().toLowerCase().replace(/,/g, '');
    const m = s.match(/^\$?\s*([\d]+(?:\.[\d]+)?)\s*([km])?\b/);
    if (!m) return undefined;
    let n = parseFloat(m[1]);
    const unit = m[2];
    if (unit === 'k') n *= 1_000;
    if (unit === 'm') n *= 1_000_000;
    if (!Number.isFinite(n)) return undefined;
    return Math.round(n);
}
function parsePercent(raw: string | undefined | null): number | undefined {
    if (!raw) return undefined;
    const m = String(raw).match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : undefined;
}
function solveLoanAmountFromPI(monthlyPI: number, annualRatePct: number, termYears: number): number | undefined {
    const r = (annualRatePct / 100) / 12;
    const n = termYears * 12;
    if (!(r > 0) || !(n > 0)) return undefined;
    const denom = r / (1 - Math.pow(1 + r, -n));
    if (!Number.isFinite(denom) || denom <= 0) return undefined;
    return Math.round(monthlyPI / denom);
}

/**
 * Flexible parse:
 * - "$500k with 20% down at 6.5% for 30 years"
 * - "$620k at 6.25% for 30 years"
 * - "loan 400k at 6.5% for 30y"
 * - "$3800/mo @ 6.5% 30y" (reverse: infer loan)
 */
function parsePaymentQuery(q: string) {
    const clean = q.replace(/,/g, '').toLowerCase();

    // Reverse: explicit monthly payment
    let paymentMonthly: number | undefined;
    const pay1 = clean.match(/\bpayment\s*(?:is|=|:)?\s*(\$?\s*\d+(?:\.\d+)?)\b/);
    const pay2 = clean.match(/(\$?\s*\d+(?:\.\d+)?)\s*(?:\/?\s*)?(?:mo|month)\b/);
    if (pay1?.[1]) paymentMonthly = parseMoney(pay1[1]);
    else if (pay2?.[1]) paymentMonthly = parseMoney(pay2[1]);

    const hintsLoan = /\b(loan|principal|mortgage|balance)\b/.test(clean);
    const hintsPrice = /\b(purchase|purchase\s*price|price|home|house|pp|value)\b/.test(clean);
    const hintsPaymentOn = /\bpayment\s+on\b/.test(clean);

    const moneyRe = /\$?\s*\d+(?:\.\d+)?\s*[km]?\b/g;
    const tokens = Array.from(clean.matchAll(moneyRe)).map((m) => {
        const start = m.index ?? 0;
        const text = m[0];
        const end = start + text.length;
        const next = clean.slice(end, end + 3);
        return {
            text,
            index: start,
            end,
            value: parseMoney(text),
            followedByPercent: /^\s*%/.test(next),
            hasCurrency: /\$/.test(text),
            hasSuffix: /[km]\b/.test(text),
        };
    });

    const loanExplicit = clean.match(/\bloan(?:\s*amount)?(?:\s*[:=])?\s*(?:of\s*)?(\$?\s*\d+(?:\.\d+)?\s*[km]?)\b/);
    let loanAmount: number | undefined = loanExplicit ? parseMoney(loanExplicit[1]) : undefined;

    if (!isFiniteNum(loanAmount)) {
        if (hintsPaymentOn && tokens.length >= 1) {
            const t = tokens.find((t) => !t.followedByPercent);
            if (isFiniteNum(t?.value)) loanAmount = t!.value!;
        } else if (hintsLoan && tokens.length >= 1) {
            const loanIdx = clean.indexOf('loan');
            const afterLoanMoney =
                tokens.find((t) => t.index > loanIdx && !t.followedByPercent && (t.hasCurrency || t.hasSuffix)) ??
                tokens.find((t) => t.index > loanIdx && !t.followedByPercent);
            if (isFiniteNum(afterLoanMoney?.value)) loanAmount = afterLoanMoney!.value!;
        } else if (tokens.length === 1 && !hintsPrice) {
            const only = tokens[0];
            if (!only.followedByPercent && isFiniteNum(only.value)) loanAmount = only.value!;
        }
    }

    let purchasePrice: number | undefined;
    if (!isFiniteNum(loanAmount) && tokens.length > 0) {
        if (hintsPrice) {
            const firstNonPct =
                tokens.find((t) => !t.followedByPercent && (t.hasCurrency || t.hasSuffix)) ??
                tokens.find((t) => !t.followedByPercent) ??
                tokens[0];
            if (isFiniteNum(firstNonPct?.value)) purchasePrice = firstNonPct!.value!;
        }
    }

    const downMatch = clean.match(/(\d+(?:\.\d+)?)\s*%\s*down(\s*payment)?\b/);
    const downPercent = downMatch ? parsePercent(downMatch[1]) : undefined;

    let annualRatePct: number | undefined;
    const rateNear = clean.match(/(?:rate|at|@)\s*:?[\s]*([0-9]+(?:\.[0-9]+)?)\s*%/i);
    if (rateNear) {
        annualRatePct = parsePercent(rateNear[1]);
    } else {
        const anyPct = clean.match(/([0-9]+(?:\.[0-9]+)?)\s*%/i);
        if (anyPct && !/\b(down(\s*payment)?|ltv|loan\s*to\s*value)\b/i.test(clean)) {
            annualRatePct = parsePercent(anyPct[1]);
        }
    }

    const yearsMatch = clean.match(/(\d+)\s*(years?|yrs?|yr|y|yeards?)/i);
    let termYears = yearsMatch ? parseInt(yearsMatch[1], 10) : undefined;
    if (!termYears && (isFiniteNum(loanAmount) || isFiniteNum(purchasePrice)) && typeof annualRatePct === 'number') {
        termYears = 30;
    }

    if (!isFiniteNum(loanAmount) && isFiniteNum(paymentMonthly) && isFiniteNum(annualRatePct) && isFiniteNum(termYears)) {
        const inferred = solveLoanAmountFromPI(paymentMonthly!, annualRatePct!, termYears!);
        if (isFiniteNum(inferred)) loanAmount = inferred;
    }

    return { loanAmount, purchasePrice, downPercent, annualRatePct, termYears, paymentMonthly };
}

function buildCalcUrl(
    base: string,
    p: { loanAmount?: number; purchasePrice?: number; downPercent?: number; annualRatePct?: number; termYears?: number }
) {
    const sp = new URLSearchParams();
    if (isFiniteNum(p.loanAmount)) sp.set('loanAmount', String(p.loanAmount));
    if (isFiniteNum(p.purchasePrice)) sp.set('purchasePrice', String(p.purchasePrice));
    if (isFiniteNum(p.downPercent)) sp.set('downPercent', String(p.downPercent));
    if (isFiniteNum(p.annualRatePct)) sp.set('annualRatePct', String(p.annualRatePct));
    if (isFiniteNum(p.termYears)) sp.set('termYears', String(p.termYears));
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
}

/* =========================
   Types
========================= */
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
    path: 'concept' | 'market' | 'dynamic' | 'error' | 'calc';
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
    };
    lockBias?: 'Mild Lock' | 'Neutral' | 'Float Watch';
    paymentDelta?: { perQuarterPt: number; loanAmount: number };
    watchNext?: string[];
    confidence?: 'low' | 'med' | 'high';
    status?: number;
    generatedAt?: string;
};

type ChatMsg =
    | { id: string; role: 'user'; content: string }
    | { id: string; role: 'assistant'; content: string; meta?: ApiResponse };

/* =========================
   Utils
========================= */
function uid() {
    return Math.random().toString(36).slice(2, 10);
}
async function safeJson(r: Response): Promise<ApiResponse> {
    const txt = await r.text();
    try {
        return JSON.parse(txt) as ApiResponse;
    } catch {
        return { path: 'error', usedFRED: false, answer: txt, status: r.status } as any;
    }
}
const fmtISOshort = (iso?: string) => (iso ? iso.replace('T', ' ').replace('Z', 'Z') : 'n/a');
const fmtMoney = (n: unknown) => (typeof n === 'number' && isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

type CalcApiMeta = { path?: ApiResponse['path']; usedFRED?: boolean; at?: string };
type CalcApiRaw = { meta?: CalcApiMeta; tldr?: string | string[]; summary?: string; message?: string; answer?: unknown; path?: ApiResponse['path']; usedFRED?: boolean; generatedAt?: string; };

function normalizeCalcResponse(raw: unknown, status: number): ApiResponse {
    const r = (typeof raw === 'object' && raw !== null ? (raw as CalcApiRaw) : {}) as CalcApiRaw;
    const path: ApiResponse['path'] = (r.meta?.path ?? r.path ?? 'calc') as ApiResponse['path'];
    const usedFRED: boolean =
        typeof r.meta?.usedFRED === 'boolean' ? r.meta!.usedFRED! :
            typeof r.usedFRED === 'boolean' ? r.usedFRED! : false;
    const generatedAt = r.meta?.at ?? r.generatedAt;
    const tldr = (r.tldr ?? r.summary ?? r.message) as string | string[] | undefined;
    const answer = (r as { answer?: unknown }).answer ?? r;
    return { path, usedFRED, tldr, answer: answer as string | CalcAnswer, generatedAt, status };
}

/* =========================
   Rendering
========================= */
function AnswerBlock({ meta }: { meta?: ApiResponse }) {
    if (!meta) return null;

    type NestedMeta = { meta?: { path?: ApiResponse['path']; usedFRED?: boolean; at?: string } };
    const m = meta as ApiResponse & NestedMeta;

    const headerPath: ApiResponse['path'] | '—' = m.path ?? m.meta?.path ?? '—';
    const headerUsedFRED: boolean = typeof m.usedFRED === 'boolean' ? m.usedFRED : (m.meta?.usedFRED ?? false);
    const headerAt: string | undefined = m.generatedAt ?? m.meta?.at ?? undefined;

    if (headerPath === 'calc' && m.answer && typeof m.answer === 'object') {
        const a = m.answer as CalcAnswer;
        return (
            <div style={{ display: 'grid', gap: 10 }}>
                <div className="meta">
                    <span>path: <b>{String(headerPath)}</b></span>
                    <span> | usedFRED: <b>{String(headerUsedFRED)}</b></span>
                    {headerAt && <span> | at: <b>{fmtISOshort(headerAt)}</b></span>}
                </div>

                <div>
                    <div><b>Loan amount:</b> ${fmtMoney(a.loanAmount)}</div>
                    <div><b>Monthly P&I:</b> ${fmtMoney(a.monthlyPI)}</div>
                </div>

                {typeof a.monthlyTotalPITI === 'number' && a.monthlyTotalPITI > 0 && (
                    <div className="panel">
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>PITI breakdown</div>
                        <ul style={{ marginTop: 0 }}>
                            <li>Taxes: ${fmtMoney(a.monthlyTax)}</li>
                            <li>Insurance: ${fmtMoney(a.monthlyIns)}</li>
                            <li>HOA: ${fmtMoney(a.monthlyHOA)}</li>
                            <li>MI: ${fmtMoney(a.monthlyMI)}</li>
                            <li><b>Total PITI: ${fmtMoney(a.monthlyTotalPITI)}</b></li>
                        </ul>
                    </div>
                )}

                {Array.isArray(a.sensitivities) && a.sensitivities.length > 0 && (
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>±0.25% Sensitivity</div>
                        <ul style={{ marginTop: 0 }}>
                            {a.sensitivities.map((s, i) => (
                                <li key={i}>Rate: {(Number(s.rate) * 100).toFixed(2)}% → P&I ${fmtMoney(s.pi)}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {typeof m.tldr === 'string' && <div style={{ fontStyle: 'italic' }}>{m.tldr}</div>}
            </div>
        );
    }

    const primary =
        m.message ??
        m.summary ??
        (m.fred && m.fred.tenYearYield != null && m.fred.mort30Avg != null && m.fred.spread != null
            ? `As of ${m.fred.asOf ?? 'recent data'}: 10Y ${typeof m.fred.tenYearYield === 'number' ? m.fred.tenYearYield.toFixed(2) : m.fred.tenYearYield}%, 30Y ${typeof m.fred.mort30Avg === 'number' ? m.fred.mort30Avg.toFixed(2) : m.fred.mort30Avg}%, spread ${typeof m.fred.spread === 'number' ? m.fred.spread.toFixed(2) : m.fred.spread}%.`
            : typeof m.answer === 'string'
                ? m.answer
                : '');

    const lines = (typeof m.answer === 'string' ? m.answer : '').split('\n').map((s) => s.trim());
    const takeaway = primary || lines[0] || '';
    const bullets = lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
    const nexts = lines.filter((l) => l.toLowerCase().startsWith('next:')).map((l) => l.slice(5).trim());

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            <div className="meta">
                <span>path: <b>{String(m.path ?? '—')}</b></span>
                <span> | usedFRED: <b>{String(headerUsedFRED)}</b></span>
                {headerAt && <span> | at: <b>{fmtISOshort(headerAt)}</b></span>}
            </div>

            {takeaway && <div>{takeaway}</div>}

            {Array.isArray(m.tldr) && m.tldr.length > 0 && (
                <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>TL;DR</div>
                    <ul style={{ marginTop: 0 }}>
                        {m.tldr.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                </div>
            )}

            {bullets.length > 0 && (
                <ul style={{ marginTop: 0 }}>
                    {bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
            )}

            {nexts.length > 0 && (
                <div style={{ display: 'grid', gap: 4 }}>
                    {nexts.map((n, i) => (<div key={i}><b>Next:</b> {n}</div>))}
                </div>
            )}

            {m.paymentDelta && (
                <div style={{ fontSize: 13 }}>
                    Every 0.25% ~ <b>${m.paymentDelta.perQuarterPt}/mo</b> on ${m.paymentDelta.loanAmount.toLocaleString()}.
                </div>
            )}
        </div>
    );
}

function Bubble({ role, children }: { role: Role; children: React.ReactNode }) {
    const isUser = role === 'user';
    return (
        <div className="bubble">
            <div className={`avatar ${isUser ? 'user' : 'bot'}`}>{isUser ? 'U' : 'HR'}</div>
            <div className={`balloon ${isUser ? 'user' : 'bot'}`}>{children}</div>
        </div>
    );
}

/* =========================
   Page
========================= */
export default function Page() {
    const [messages, setMessages] = useState<ChatMsg[]>([
        {
            id: uid(),
            role: 'assistant',
            content: 'Ask about a concept (DTI, PMI, FHA) or market (10-year vs rates). For math, give loan+rate(+term) or price+down%+rate(+term).',
        },
    ]);
    const [input, setInput] = useState('');
    const [mode, setMode] = useState<'borrower' | 'public'>('borrower');
    const [intent, setIntent] = useState<'' | 'purchase' | 'refi' | 'investor'>('');
    const [loanAmount, setLoanAmount] = useState<number | ''>('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<{ id: string; title: string; updatedAt?: number }[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const toggleSidebar = () => setSidebarOpen((o) => !o);

    const [threads, setThreads] = useState<Record<string, ChatMsg[]>>({});
    const [activeId, setActiveId] = useState<string | null>(null);

    const [showSearch, setShowSearch] = useState(false);
    const [showLibrary, setShowLibrary] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showProject, setShowProject] = useState(false);
    const [showMortgageCalc, setShowMortgageCalc] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [projectName, setProjectName] = useState('');

    // Restore on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const data = JSON.parse(raw) as {
                threads?: Record<string, ChatMsg[]>;
                history?: { id: string; title: string; updatedAt?: number }[];
                activeId?: string | null;
            };
            if (data.threads) setThreads(data.threads);
            if (Array.isArray(data.history)) setHistory(data.history);
            if (data.activeId && data.threads?.[data.activeId]) {
                setActiveId(data.activeId);
                setMessages(data.threads[data.activeId] || []);
            }
        } catch (e) {
            console.warn('hr.chat load failed', e);
        }
    }, []);

    // Persist model
    useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ threads, history, activeId }));
        } catch (e) {
            console.warn('hr.chat save failed', e);
        }
    }, [threads, history, activeId]);

    // Snapshot into active thread
    useEffect(() => {
        if (!activeId) return;

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

    // Auto-scroll
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    // Hotkeys
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as HTMLElement).isContentEditable)) return;
            const k = e.key.toLowerCase();
            const meta = e.ctrlKey || e.metaKey;

            if (meta && k === 'k') { e.preventDefault(); setShowSearch(true); return; }
            if (meta && k === 'n') { e.preventDefault(); newChat(); return; }
            if (meta && k === 'l') { e.preventDefault(); setShowLibrary(true); return; }
            if (meta && k === 'p') { e.preventDefault(); setShowProject(true); return; }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    function onSelectHistory(id: string) {
        setActiveId(id);
        const thread = threads[id];
        if (Array.isArray(thread) && thread.length) {
            setMessages(thread);
        } else {
            setMessages([{ id: uid(), role: 'assistant', content: 'Restored chat (no snapshot found). Start typing to continue.' }]);
        }
        setShowLibrary(false);
    }

    function newChat() {
        const id = uid();
        setActiveId(id);
        setMessages([{ id: uid(), role: 'assistant', content: 'New chat. What do you want to figure out?' }]);
        setHistory((h) => [{ id, title: 'New chat', updatedAt: Date.now() }, ...h].slice(0, 20));
    }

    function handleHistoryAction(action: 'rename' | 'move' | 'archive' | 'delete', id: string) {
        if (action === 'rename') {
            const current = history.find((h) => h.id === id)?.title ?? '';
            const name = prompt('Rename chat:', current);
            if (name && name.trim()) {
                setHistory((h) => h.map((x) => (x.id === id ? { ...x, title: name.trim(), updatedAt: Date.now() } : x)));
            }
            return;
        }
        if (action === 'move') { alert('Move to project… (coming soon)'); return; }
        if (action === 'archive') { alert('Archive… (coming soon)'); return; }
        if (action === 'delete') {
            if (confirm('Delete this chat? This cannot be undone.')) {
                setHistory((h) => h.filter((x) => x.id !== id));
                setThreads((t) => { const copy = { ...t }; delete copy[id]; return copy; });
                if (activeId === id) {
                    setActiveId(null);
                    setMessages([{ id: uid(), role: 'assistant', content: 'New chat. What do you want to figure out?' }]);
                }
            }
        }
    }

    async function send() {
        const q = input.trim();
        if (!q || loading) return;

        const title = q.length > 42 ? q.slice(0, 42) + '...' : q;

        let tid = activeId;
        if (!tid) {
            tid = uid();
            setActiveId(tid);
            setHistory((h) => [{ id: tid!, title, updatedAt: Date.now() }, ...h].slice(0, 20));
        } else {
            setHistory((prev) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                const idx = next.findIndex((x) => x?.id === tid);
                if (idx >= 0) {
                    const current = next[idx] ?? { id: tid!, title: 'Untitled' };
                    const needsTitle = typeof current.title === 'string' && (current.title === 'New chat' || current.title.startsWith('Untitled'));
                    next[idx] = { ...current, title: needsTitle ? title : current.title, updatedAt: Date.now() };
                    return next;
                }
                next.unshift({ id: tid!, title, updatedAt: Date.now() });
                return next.slice(0, 20);
            });
        }

        setMessages((m) => [...m, { id: uid(), role: 'user', content: q }]);
        setInput('');
        setLoading(true);

        try {
            if (isPaymentQuery(q)) {
                const parsed = parsePaymentQuery(q);

                // reverse inference if needed
                if (!isFiniteNum(parsed.loanAmount) && isFiniteNum(parsed.paymentMonthly) && isFiniteNum(parsed.annualRatePct) && isFiniteNum(parsed.termYears)) {
                    const inferred = solveLoanAmountFromPI(parsed.paymentMonthly as number, parsed.annualRatePct!, parsed.termYears!);
                    if (isFiniteNum(inferred)) parsed.loanAmount = inferred;
                }

                const okByLoan = isFiniteNum(parsed.loanAmount) && isFiniteNum(parsed.annualRatePct);
                const okByPP = isFiniteNum(parsed.purchasePrice) && isFiniteNum(parsed.downPercent) && isFiniteNum(parsed.annualRatePct);

                if (!okByLoan && !okByPP) {
                    setMessages((m) => [
                        ...m,
                        { id: uid(), role: 'assistant', content: 'I need at least a loan amount + rate (e.g., “$400k loan at 6.5% for 30 years”), or purchase price + down % + rate (e.g., “$500k with 20% down at 6.25% for 30 years”).' },
                    ]);
                    setLoading(false);
                    return;
                }

                // Clean branch: send either loanAmount OR price+down
                let url: string;
                if (okByLoan) {
                    url = buildCalcUrl('/api/calc/payment', {
                        loanAmount: parsed.loanAmount,
                        annualRatePct: parsed.annualRatePct,
                        termYears: parsed.termYears,
                    });
                } else {
                    url = buildCalcUrl('/api/calc/payment', {
                        purchasePrice: parsed.purchasePrice,
                        downPercent: parsed.downPercent,
                        annualRatePct: parsed.annualRatePct,
                        termYears: parsed.termYears,
                    });
                }
                url += (url.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(q);

                // Robust fetch: never fail silently
                let friendly = 'Calculated principal & interest payment.';
                let meta: ApiResponse | undefined;

                try {
                    const r = await fetch(url, { method: 'GET', headers: { 'cache-control': 'no-store' } });
                    let raw: unknown = {};
                    try {
                        raw = await r.json();
                    } catch {
                        // keep raw as {}
                    }
                    meta = normalizeCalcResponse(raw, r.status);

                    if (meta.path === 'calc' && meta.answer && typeof meta.answer === 'object') {
                        const a = meta.answer as CalcAnswer;
                        friendly = `Monthly P&I: $${fmtMoney(a.monthlyPI)} on $${fmtMoney(a.loanAmount)}`;
                    } else if (!r.ok) {
                        friendly = `Calc service returned ${r.status}. Showing raw data.`;
                    }
                } catch (err) {
                    friendly = `Calc request failed. ${err instanceof Error ? err.message : String(err)}`;
                    meta = { path: 'error', usedFRED: false, message: friendly } as ApiResponse;
                }

                setMessages((m) => [...m, { id: uid(), role: 'assistant', content: friendly, meta }]);
                setLoading(false);
                return;
            }

            // Non-calc path
            const body: { question: string; mode: 'borrower' | 'public'; intent?: 'purchase' | 'refi' | 'investor'; loanAmount?: number } = { question: q, mode };
            if (intent) body.intent = intent;
            if (loanAmount && Number(loanAmount) > 0) body.loanAmount = Number(loanAmount);

            const r = await fetch('/api/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const meta = await safeJson(r);
            const friendly =
                meta.message ??
                meta.summary ??
                (meta.fred && meta.fred.tenYearYield != null && meta.fred.mort30Avg != null && meta.fred.spread != null
                    ? `As of ${meta.fred.asOf ?? 'recent data'}: 10Y ${typeof meta.fred.tenYearYield === 'number' ? meta.fred.tenYearYield.toFixed(2) : meta.fred.tenYearYield}%, 30Y ${typeof meta.fred.mort30Avg === 'number' ? meta.fred.mort30Avg.toFixed(2) : meta.fred.mort30Avg}%, spread ${typeof meta.fred.spread === 'number' ? meta.fred.spread.toFixed(2) : meta.fred.spread}%.`
                    : typeof meta.answer === 'string'
                        ? meta.answer
                        : `path: ${meta.path} | usedFRED: ${String(meta.usedFRED)} | confidence: ${meta.confidence ?? '-'}`);

            setMessages((m) => [...m, { id: uid(), role: 'assistant', content: friendly, meta }]);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setMessages((m) => [...m, { id: uid(), role: 'assistant', content: `Error: ${msg}` }]);
        } finally {
            setLoading(false);
        }
    }

    function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    function onShare() {
        const text = messages.map((m) => `${m.role === 'user' ? 'You' : 'HomeRates'}: ${typeof m.content === 'string' ? m.content : ''}`).join('\n');
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => { });
        } else {
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'conversation.txt';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }
    }

    function onSettings() { setShowSettings(true); }
    function onSearch() { setShowSearch(true); }
    function onLibrary() { setShowLibrary(true); }
    function onNewProject() { setShowProject(true); }
    function onMortgageCalc() { setShowMortgageCalc(true); }
    function closeAllOverlays() {
        setShowSearch(false);
        setShowLibrary(false);
        setShowSettings(false);
        setShowProject(false);
        setShowMortgageCalc(false);
    }

    return (
        <>
            <Sidebar
                history={history}
                onNewChat={newChat}
                onSettings={onSettings}
                onShare={onShare}
                onSearch={onSearch}
                onLibrary={onLibrary}
                onNewProject={onNewProject}
                onMortgageCalc={onMortgageCalc}
                activeId={activeId}
                onSelectHistory={onSelectHistory}
                isOpen={sidebarOpen}
                onToggle={toggleSidebar}
                onHistoryAction={handleHistoryAction}
            />

            <section className="main" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
                <div className="header">
                    <div className="header-inner">
                        <button className="btn" type="button" onClick={toggleSidebar} aria-label="Toggle sidebar" style={{ marginRight: 8 }}>
                            Menu
                        </button>
                        <div style={{ fontWeight: 700 }}>Chat</div>
                        <div className="controls">
                            <select value={mode} onChange={(e) => setMode(e.target.value as 'borrower' | 'public')}>
                                <option value="borrower">Borrower</option>
                                <option value="public">Public</option>
                            </select>
                            <select value={intent} onChange={(e) => setIntent(e.target.value as '' | 'purchase' | 'refi' | 'investor')}>
                                <option value="">Intent: auto</option>
                                <option value="purchase">Purchase</option>
                                <option value="refi">Refi</option>
                                <option value="investor">Investor</option>
                            </select>
                            <input
                                type="number"
                                min={50000}
                                step={1000}
                                placeholder="Loan (optional)"
                                value={loanAmount}
                                onChange={(e) => setLoanAmount(e.target.value ? Number(e.target.value) : '')}
                            />
                        </div>
                    </div>
                </div>

                <div ref={scrollRef} className="scroll" style={{ flex: 1, overflowY: 'auto' }}>
                    <div className="center">
                        <div className="messages">
                            {messages.map((m) => (
                                <div key={m.id}>
                                    <Bubble role={m.role}>
                                        {m.role === 'assistant' ? (m.meta ? <AnswerBlock meta={m.meta} /> : m.content) : m.content}
                                    </Bubble>
                                </div>
                            ))}
                            {loading && <div className="meta">...thinking</div>}
                        </div>
                    </div>
                </div>

                <div className="composer" style={{ position: 'sticky', bottom: 0, zIndex: 5 }}>
                    <div className="composer-inner">
                        <input className="input" placeholder="Ask about DTI, PMI, or run a calc: “$620k at 6.25% for 30 years”" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} />
                        <button className="btn" onClick={send} disabled={loading || !input.trim()}>Send</button>
                    </div>
                </div>

                {(showSearch || showLibrary || showSettings || showProject || showMortgageCalc) && (
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Overlay"
                        onClick={(e) => { if (e.target === e.currentTarget) closeAllOverlays(); }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 5000 }}
                    >
                        <div className="panel" style={{ width: 'min(680px, 92vw)', maxHeight: '80vh', overflow: 'auto', padding: 16, borderRadius: 12, background: 'var(--card)', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', display: 'grid', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 700 }}>
                                    {showSearch && 'Search'}
                                    {showLibrary && 'Library'}
                                    {showSettings && 'Settings'}
                                    {showProject && 'New Project'}
                                    {showMortgageCalc && 'Mortgage Calculator'}
                                </div>
                                <button className="btn" onClick={closeAllOverlays} aria-label="Close">Close</button>
                            </div>

                            {showSearch && (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    <input className="input" placeholder="Search your current thread and history…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
                                    <div className="panel" style={{ display: 'grid', gap: 6 }}>
                                        <div style={{ fontWeight: 600 }}>Matches in current thread</div>
                                        <ul style={{ marginTop: 0 }}>
                                            {messages
                                                .filter((m) => typeof m.content === 'string' && m.content.toLowerCase().includes(searchQuery.toLowerCase()))
                                                .slice(0, 12)
                                                .map((m, i) => (
                                                    <li key={m.id + i}><b>{m.role === 'user' ? 'You' : 'HomeRates'}:</b> <span>{(m.content as string).slice(0, 200)}</span></li>
                                                ))}
                                        </ul>
                                    </div>
                                    <div className="panel" style={{ display: 'grid', gap: 6 }}>
                                        <div style={{ fontWeight: 600 }}>Matches in history titles</div>
                                        <ul style={{ marginTop: 0 }}>
                                            {history
                                                .filter((h) => h.title.toLowerCase().includes(searchQuery.toLowerCase()))
                                                .slice(0, 20)
                                                .map((h) => <li key={h.id}>{h.title}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {showLibrary && (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    <div style={{ color: 'var(--text-weak)' }}>Your recent chats:</div>
                                    <div className="chat-list" role="list">
                                        {history.length === 0 && <div className="chat-item" style={{ opacity: 0.7 }} role="listitem">No history yet</div>}
                                        {history.map((h) => (
                                            <button key={h.id} className="chat-item" role="listitem" title={h.title} onClick={() => onSelectHistory(h.id)} style={{ textAlign: 'left' }}>
                                                {h.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {showSettings && (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input type="checkbox" onChange={() => { /* next pass */ }} />
                                        Compact bubbles (coming soon)
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input type="checkbox" onChange={() => { /* next pass */ }} />
                                        Prefer dark mode (coming soon)
                                    </label>
                                    <button className="btn" onClick={() => {
                                        setHistory([]);
                                        setMessages([{ id: uid(), role: 'assistant', content: 'New chat. What do you want to figure out?' }]);
                                        closeAllOverlays();
                                    }}>
                                        Clear history & reset chat
                                    </button>
                                </div>
                            )}

                            {showProject && (
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        const name = projectName.trim() || 'Untitled Project';
                                        const id = uid();
                                        setActiveId(id);
                                        setHistory((h) => [{ id, title: `📁 ${name}`, updatedAt: Date.now() }, ...h].slice(0, 20));
                                        setMessages([{ id: uid(), role: 'assistant', content: `New Project “${name}” started. What’s the goal?` }]);
                                        setProjectName('');
                                        closeAllOverlays();
                                    }}
                                    style={{ display: 'grid', gap: 10 }}
                                >
                                    <input className="input" placeholder="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} autoFocus />
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn primary" type="submit">Create</button>
                                        <button className="btn" type="button" onClick={closeAllOverlays}>Cancel</button>
                                    </div>
                                </form>
                            )}

                            {showMortgageCalc && (
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        const fd = new FormData(e.currentTarget);
                                        const price = Number(String(fd.get('price') || '').replace(/[, ]+/g, '')) || 0;
                                        const downPct = Number(String(fd.get('downPct') || '').replace(/[, ]+/g, '')) || 0;
                                        const ratePct = Number(String(fd.get('ratePct') || '').replace(/[, ]+/g, '')) || 0;
                                        const termYears = Number(String(fd.get('termYears') || '').replace(/[, ]+/g, '')) || 30;
                                        const zip = String(fd.get('zip') || '').trim();
                                        const hoa = Number(String(fd.get('hoa') || '').replace(/[, ]+/g, '')) || 0;

                                        console.log('MortgageCalc inputs:', { price, downPct, ratePct, termYears, zip, hoa });

                                        closeAllOverlays();

                                        setMessages((m) => [
                                            ...m,
                                            { id: uid(), role: 'assistant', content: `Using ${price.toLocaleString()} price, ${downPct}% down, ${ratePct}% for ${termYears} years, ZIP ${zip}${hoa ? `, HOA $${hoa}` : ''}.` },
                                        ]);
                                    }}
                                    style={{ display: 'grid', gap: 10 }}
                                >
                                    <div className="grid" style={{ display: 'grid', gap: 10 }}>
                                        <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                                            Purchase price
                                            <input name="price" inputMode="decimal" defaultValue="900000" placeholder="e.g. 900000" className="input" autoFocus />
                                        </label>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                                                Down payment %
                                                <input name="downPct" inputMode="decimal" defaultValue="20" placeholder="e.g. 20" className="input" />
                                            </label>
                                            <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                                                Rate %
                                                <input name="ratePct" inputMode="decimal" defaultValue="6.25" placeholder="e.g. 6.25" className="input" />
                                            </label>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                                                Term (years)
                                                <input name="termYears" inputMode="numeric" defaultValue="30" placeholder="e.g. 30" className="input" />
                                            </label>
                                            <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                                                ZIP
                                                <input name="zip" inputMode="numeric" defaultValue="92688" placeholder="e.g. 92688" className="input" />
                                            </label>
                                        </div>

                                        <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                                            HOA (optional)
                                            <input name="hoa" inputMode="decimal" placeholder="e.g. 125" className="input" />
                                        </label>

                                        <p className="text-xs" style={{ opacity: 0.7 }}>Guided input flow. We’ll render results next.</p>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                        <button className="btn" type="button" onClick={closeAllOverlays}>Cancel</button>
                                        <button className="btn primary" type="submit">Use these inputs</button>
                                    </div>
                                </form>
                            )}

                        </div>
                    </div>
                )}
            </section>
        </>
    );
}
