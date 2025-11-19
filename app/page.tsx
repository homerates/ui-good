// HR-Build: HRB-2025-11-10-d994b21 | File-Ref: HRF-0004-25F8FCE9 | SHA256: 25F8FCE98F4D90CE
// <HR-GUARD> Home chat = borrower mode only. Do NOT reintroduce Borrower/Public, Intent, or "Loan (optional)" controls.
// ==== REPLACE ENTIRE FILE: app/page.tsx ====
'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Sidebar from './components/Sidebar';
import MortgageCalcPanel from './components/MortgageCalcPanel';
import MenuButton from './components/MenuButton';
import { useMobileComposerPin } from './hooks/useMobileComposerPin';
import { logAnswerToLibrary } from '../lib/logAnswerToLibrary';

/* =========================
   Small helpers
========================= */
const LS_KEY = 'hr.chat.v1';

// anonymous, non-signed-in usage meter (per browser, per day)
const ANON_METER_KEY = 'hr.anon.q.v1';
const ANON_DAILY_LIMIT = 3;
const SIGNED_DAILY_LIMIT = 10;   // signed-in, triggers Upgrade modal
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

    // optional flags the backend might return for metering
    upgradeRequired?: boolean;
    limitHit?: boolean;
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
   API helpers
========================= */
async function safeJson(r: Response): Promise<ApiResponse> {
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
   UI blocks
========================= */
function AnswerBlock({ meta }: { meta?: ApiResponse }) {
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
    const headerAt: string | undefined =
        m.generatedAt ?? m.meta?.at ?? undefined;

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
                            <div
                                style={{
                                    fontWeight: 600,
                                    marginBottom: 6,
                                }}
                            >
                                PITI breakdown
                            </div>
                            <ul style={{ marginTop: 0 }}>
                                <li>Taxes: ${fmtMoney(a.monthlyTax)}</li>
                                <li>Insurance: ${fmtMoney(a.monthlyIns)}</li>
                                <li>HOA: ${fmtMoney(a.monthlyHOA)}</li>
                                <li>MI: ${fmtMoney(a.monthlyMI)}</li>
                                <li>
                                    <b>
                                        Total PITI: ${fmtMoney(a.monthlyTotalPITI)}
                                    </b>
                                </li>
                            </ul>
                        </div>
                    )}

                {Array.isArray(a.sensitivities) &&
                    a.sensitivities.length > 0 && (
                        <div>
                            <div
                                style={{
                                    fontWeight: 600,
                                    marginBottom: 6,
                                }}
                            >
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
            ? `As of ${m.fred.asOf ?? 'recent data'
            }: ${typeof m.fred.tenYearYield === 'number'
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
    const takeaway = primary || lines[0] || '';
    const bullets = lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
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
                    Every 0.25% ~{' '}
                    <b>${m.paymentDelta.perQuarterPt}/mo</b> on $
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

/* =========================
   Page
========================= */
export default function Page() {
    useMobileComposerPin();

    const router = useRouter();
    const { isSignedIn } = useUser();

    const [messages, setMessages] = useState<ChatMsg[]>([
        {
            id: uid(),
            role: 'assistant',
            content:
                'Ask about a concept (DTI, PMI, FHA) or market (rates vs 10-year).',
        },
    ]);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        window.requestAnimationFrame(() => {
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth',
            });
        });
    }, [messages.length]);

    const [input, setInput] = useState('');

    // borrower-only mode fixed
    const mode: 'borrower' = 'borrower';

    const [loading, setLoading] = useState(false);
    const [showUpgradeRequired, setShowUpgradeRequired] = useState(false);
    const [showAuthRequired, setShowAuthRequired] = useState(false);

    const [history, setHistory] = useState<
        { id: string; title: string; updatedAt?: number }[]
    >([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        // run after DOM updates so scrollHeight is correct
        requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
        });
    }, [messages, loading]);

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const toggleSidebar = () => setSidebarOpen((o) => !o);

    // threads + active
    const [threads, setThreads] = useState<Record<string, ChatMsg[]>>({});
    const [activeId, setActiveId] = useState<string | null>(null);

    // overlays
    const [showSearch, setShowSearch] = useState(false);
    const [showLibrary, setShowLibrary] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showProject, setShowProject] = useState(false);
    const [showMortgageCalc, setShowMortgageCalc] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [projectName, setProjectName] = useState('');

    // restore
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

    // persist
    useEffect(() => {
        try {
            localStorage.setItem(
                LS_KEY,
                JSON.stringify({ threads, history, activeId })
            );
        } catch (e) {
            console.warn('hr.chat save failed', e);
        }
    }, [threads, history, activeId]);

    // snapshot into active thread
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

    // autoscroll
    useEffect(() => {
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
    function onSelectHistory(id: string) {
        setActiveId(id);
        const thread = threads[id];
        if (Array.isArray(thread) && thread.length) {
            setMessages(thread);
        } else {
            setMessages([
                {
                    id: uid(),
                    role: 'assistant',
                    content:
                        'Restored chat (no snapshot found). Start typing to continue.',
                },
            ]);
        }
        setShowLibrary(false);
    }

    const handleProjectAction = React.useCallback(
        (action: 'rename' | 'delete', project: any) => {
            // Sidebar project actions reach here.
            // Next step: replace this with Supabase rename/delete.
            console.log('[Project action]', action, {
                id: project?.id,
                name: project?.name,
            });
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

    async function send() {
        const q = input.trim();
        if (!q || loading) return;

        // anonymous users: soft gate at ANON_DAILY_LIMIT per day
        if (!isSignedIn) {
            const ok = bumpAnonCounterOrBlock();
            if (!ok) {
                setShowAuthRequired(true);
                return;
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

        setMessages((m) => [...m, { id: uid(), role: 'user', content: q }]);
        setInput('');
        setLoading(true);

        try {
            // borrower-only body (no intent/loanAmount passthrough)
            const body: { question: string; mode: 'borrower' } = {
                question: q,
                mode,
            };

            const r = await fetch('/api/answers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const meta = await safeJson(r);

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

            // Check for backend limit / upgrade flag for signed-in users
            const upgradeFlag =
                (meta as any).upgradeRequired === true ||
                (meta as any).limitHit === true ||
                meta.status === 429;
            if (upgradeFlag) {
                setShowUpgradeRequired(true);
            }

            // Fire-and-forget: log this Q&A to the user's library
            try {
                void logAnswerToLibrary(q, { friendly, meta });
            } catch (err) {
                console.error('Library logging error:', err);
            }

            setMessages((m) => [
                ...m,
                { id: uid(), role: 'assistant', content: friendly, meta },
            ]);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setMessages((m) => [
                ...m,
                { id: uid(), role: 'assistant', content: `Error: ${msg}` },
            ]);
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
        const text = messages
            .map((m) =>
                `${m.role === 'user' ? 'You' : 'HomeRates'}: ${typeof m.content === 'string' ? m.content : ''
                }`
            )
            .join('\n');
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

    function onSettings() {
        setShowSettings(true);
    }

    function onSearch() {
        setShowSearch(true);
    }

    function onLibrary() {
        setShowLibrary(true);
    }

    // ==== REPLACED FUNCTION: New Project (real Supabase create) ====
    async function onNewProject() {
        // You need a current chat/thread to attach this new project to
        if (!activeId) {
            window.alert('Open or create a chat first, then create a project for it.');
            return;
        }

        const name = window.prompt('Name this project:', '');
        const projectName = (name || '').trim();
        if (!projectName) {
            return; // user cancelled or blank name
        }

        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    threadId: activeId,
                    projectName,
                }),
            });

            const json = await res.json().catch(() => ({}));

            if (!res.ok || !json?.ok) {
                const msg =
                    json?.message ||
                    json?.error ||
                    json?.reason ||
                    `Project create failed with status ${res.status}`;
                window.alert(msg);
                return;
            }

            // Optional: preserve old UI behavior
            setShowProject(true);
        } catch (err) {
            window.alert(
                err instanceof Error
                    ? err.message
                    : 'Unexpected error creating project.'
            );
        }
    }

    function onMortgageCalc() {
        setShowMortgageCalc(true);
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
                onProjectAction={handleProjectAction} // NEW
                onMoveChatToProject={handleMoveChatToProject} // NEW
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
                    <div
                        className="header-inner"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            paddingLeft: 8,
                        }}
                    >
                        {/* HomeRates logo */}
                        <img
                            src="/assets/homerates-full-logo.png"
                            alt="HomeRates.ai"
                            style={{
                                height: 28,
                                width: 'auto',
                                display: 'block',
                            }}
                        />

                        {/* Existing hamburger menu */}
                        <MenuButton isOpen={sidebarOpen} onToggle={toggleSidebar} />

                        {/* Title */}
                        <div style={{ fontWeight: 700, marginLeft: 8 }}>Chat</div>

                        {/* Right-side spacer / controls */}
                        <div style={{ marginLeft: 'auto' }} />
                    </div>
                </div>

                <div
                    ref={scrollRef}
                    className="scroll"
                    style={{
                        flex: '1 1 auto',
                        minHeight: 0,
                        overflowY: 'auto',
                    }}
                >
                    <div className="center">
                        <div className="messages">
                            {messages.map((m) => (
                                <div key={m.id}>
                                    <Bubble role={m.role}>
                                        {m.role === 'assistant' ? (
                                            m.meta ? (
                                                <AnswerBlock meta={m.meta} />
                                            ) : (
                                                m.content
                                            )
                                        ) : (
                                            m.content
                                        )}
                                    </Bubble>
                                </div>
                            ))}
                            {loading && <div className="meta">...thinking</div>}
                        </div>
                    </div>
                </div>

                {/* HR: main Ask composer; isolated classes so globals don’t interfere */}
                <div
                    className="hr-composer"
                    data-composer="primary"
                    style={{
                        // position/bottom now handled in CSS (desktop vs mobile)
                        zIndex: 900,
                        borderTop: '1px solid rgba(245, 247, 250, 0.06)',
                        background: 'transparent',
                    }}
                >
                    <div
                        className="hr-composer-inner"
                        style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            // let the inner input flex control width, avoid pill growth on type
                            maxWidth: 640, // line up with main column
                            margin: '0 auto',
                            padding: '8px 12px',
                            boxSizing: 'border-box',
                        }}
                    >
                        <input
                            className="hr-composer-input"
                            placeholder="Ask about DTI, PMI, or where rates sit vs the 10-year ..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onKey}
                            style={{
                                flex: '1 1 auto',
                                minWidth: 0,
                                height: 36, // compact (about half your old tall pill)
                                borderRadius: 9999, // true pill
                                border: '1px solid #E5E7EB',
                                padding: '6px 40px 6px 12px', // room on the right for the arrow circle
                                background: '#FFFFFF',
                                fontSize: 16, // >=16 prevents iOS zoom on focus
                                lineHeight: 1.3,
                                boxSizing: 'border-box',
                            }}
                        />

                        <button
                            className="hr-composer-send"
                            data-testid="ask-pill"
                            aria-label="Send message"
                            title="Send"
                            onClick={send}
                            disabled={loading || !input.trim()}
                            style={{
                                position: 'absolute',
                                right: 16,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 24, // small circle
                                height: 24,
                                borderRadius: 9999,
                                padding: 0,
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#111827',
                                color: '#FFFFFF',
                                cursor:
                                    loading || !input.trim() ? 'default' : 'pointer',
                                opacity: loading || !input.trim() ? 0.5 : 1,
                                zIndex: 2,
                            }}
                        >
                            <svg
                                width={14}
                                height={14}
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                style={{ transform: 'rotate(-90deg)' }} // arrow points up
                            >
                                <path
                                    d="M3 12h14.5M13 6l6 6-6 6"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
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
                                                        <li key={h.id}>{h.title}</li>
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
                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                onChange={() => {
                                                    /* next pass */
                                                }}
                                            />
                                            Compact bubbles (coming soon)
                                        </label>
                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                onChange={() => {
                                                    /* next pass */
                                                }}
                                            />
                                            Prefer dark mode (coming soon)
                                        </label>
                                        <button
                                            className="btn"
                                            onClick={() => {
                                                setHistory([]);
                                                setMessages([
                                                    {
                                                        id: uid(),
                                                        role: 'assistant',
                                                        content:
                                                            'New chat. What do you want to figure out?',
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
                                                    )} at ${res.ratePct}% for ${res.termYears
                                                        }y.`,
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
                            alignItems: 'center',
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
                                sign in to continue asking questions and unlock
                                more tools.
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
                                    onClick={() =>
                                        router.push('/sign-in')
                                    }
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
