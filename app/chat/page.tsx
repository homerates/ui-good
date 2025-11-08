// ==== REPLACE ENTIRE FILE: app/chat/page.tsx ====
'use client';

import * as React from 'react';

/* =========================
   Types & small utils
========================= */
type MsgRole = 'user' | 'assistant';
type Msg = { id: string; role: MsgRole; content: React.ReactNode };

const LS_KEY = 'hr.chat.v1';
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function coerceMessages(v: unknown): Msg[] {
    if (Array.isArray(v)) return v as Msg[];
    if (v && typeof v === 'object' && Array.isArray((v as any).messages)) {
        return (v as any).messages as Msg[];
    }
    return [];
}

async function fetchCalcFromText(raw: string) {
    const resp = await fetch(`/api/calc/answer?q=${encodeURIComponent(raw)}`, { cache: 'no-store' });
    if (!resp.ok) {
        let detail = '';
        try {
            const j = await resp.json();
            detail = j?.message || j?.error || '';
        } catch {
            detail = await resp.text().catch(() => '');
        }
        throw new Error(`calc/answer ${resp.status}${detail ? ` — ${detail}` : ''}`);
    }
    return resp.json();
}

async function fetchAnswer(raw: string) {
    const resp = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: raw }),
        cache: 'no-store',
    });
    if (!resp.ok) {
        let detail = '';
        try {
            const j = await resp.json();
            detail = j?.message || j?.error || '';
        } catch {
            detail = await resp.text().catch(() => '');
        }
        throw new Error(`answers ${resp.status}${detail ? ` — ${detail}` : ''}`);
    }
    return resp.json();
}

/* =========================
   Calc view (robust to shapes)
========================= */
function CalcView({ data }: { data: any }) {
    const inputs = data?.inputs ?? {};
    const b = data?.breakdown ?? {};

    const loanAmount = Number(
        inputs.loanAmount ??
        inputs.loan ??
        (inputs.price && inputs.downPercent != null
            ? Math.round(Number(inputs.price) * (1 - Number(inputs.downPercent) / 100))
            : 0)
    );

    const monthlyPI = Number(b.monthlyPI ?? 0);
    const monthlyTax = Number(b.monthlyTax ?? 0);
    const monthlyIns = Number(b.monthlyIns ?? 0);
    const monthlyHOA = Number(b.monthlyHOA ?? 0);
    const monthlyMI = Number(b.monthlyMI ?? 0);
    const monthlyTotalPITI = Number(
        b.monthlyTotalPITI ??
        monthlyPI + monthlyTax + monthlyIns + monthlyHOA + monthlyMI
    );

    const s = (data as any)?.sensitivity;
    const metaPath = data?.meta?.path || data?.route || 'calc';
    const metaAt = data?.meta?.at || data?.at || '';

    return (
        <div className="rounded-xl border p-4 mt-3 space-y-2">
            <div className="text-sm text-gray-500">
                HR • path: {String(metaPath)}
                {metaAt ? <> • at: {String(metaAt)}</> : null}
            </div>

            <div className="text-lg font-semibold">
                Loan amount: ${loanAmount.toLocaleString()}
            </div>
            <div className="text-lg font-semibold">
                Monthly P&amp;I: ${monthlyPI.toLocaleString()}
            </div>

            <div className="pt-2 font-medium">PITI breakdown</div>
            <div>Taxes: ${monthlyTax.toLocaleString()}</div>
            <div>Insurance: ${monthlyIns.toLocaleString()}</div>
            <div>HOA: ${monthlyHOA.toLocaleString()}</div>
            <div>MI: ${monthlyMI.toLocaleString()}</div>
            <div className="font-semibold">
                Total PITI: ${monthlyTotalPITI.toLocaleString()}
            </div>

            <div className="pt-2 font-medium">±0.25% Sensitivity</div>
            {s && typeof s === 'object' && ('up025' in s || 'down025' in s) ? (
                <div className="mt-1 text-sm opacity-80">
                    {'up025' in s ? (
                        <div>Rate +0.25% → P&amp;I ${Number(s.up025 ?? 0).toLocaleString()}</div>
                    ) : null}
                    {'down025' in s ? (
                        <div>Rate −0.25% → P&amp;I ${Number(s.down025 ?? 0).toLocaleString()}</div>
                    ) : null}
                </div>
            ) : Array.isArray(s) && s.length >= 2 ? (
                <div className="mt-1 text-sm opacity-80">
                    <div>P&amp;I ${Number(s[0]?.pi ?? 0).toLocaleString()}</div>
                    <div>P&amp;I ${Number(s[1]?.pi ?? 0).toLocaleString()}</div>
                </div>
            ) : (
                <div className="text-gray-500">No sensitivity data</div>
            )}

            <div className="pt-2 text-sm text-gray-600">
                {data?.tldr || 'Principal & Interest with ±0.25% rate sensitivity.'}
            </div>
        </div>
    );
}

/* =========================
   Error Boundary (stop hard crashes)
========================= */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err?: any }> {
    constructor(props: any) {
        super(props);
        this.state = { err: undefined };
    }
    static getDerivedStateFromError(err: any) {
        return { err };
    }
    componentDidCatch() {
        // no-op; could log
    }
    render() {
        if (this.state.err) {
            return (
                <div className="rounded-xl border p-4 bg-amber-50 text-amber-900">
                    Something went wrong while rendering this chat. Try clearing cached chat
                    data and retrying.
                </div>
            );
        }
        return this.props.children as any;
    }
}

/* =========================
   Page (defer storage to effect, gate by mounted)
========================= */
export default function ChatPage() {
    const [mounted, setMounted] = React.useState(false);
    const [messages, setMessages] = React.useState<Msg[]>([]);
    const [input, setInput] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Mount gate to avoid hydration flicker
    React.useEffect(() => {
        setMounted(true);
    }, []);

    // Load storage AFTER mount (prevents SSR/hydration timing issues)
    React.useEffect(() => {
        if (!mounted) return;
        try {
            const raw = window.localStorage.getItem(LS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const msgs = coerceMessages(parsed);
                setMessages(msgs);
                // normalize if old/bad
                if (!Array.isArray(parsed)) {
                    window.localStorage.setItem(LS_KEY, JSON.stringify(msgs));
                }
            }
        } catch {
            setMessages([]);
        }
    }, [mounted]);

    // Persist safely
    React.useEffect(() => {
        if (!mounted) return;
        try {
            window.localStorage.setItem(LS_KEY, JSON.stringify(Array.isArray(messages) ? messages : []));
        } catch { }
    }, [mounted, messages]);

    React.useEffect(() => {
        if (mounted) inputRef.current?.focus();
    }, [mounted]);

    async function handleSend(e?: React.FormEvent) {
        if (e?.preventDefault) e.preventDefault();
        const text = input.trim();
        if (!mounted || !text || busy) return;

        setBusy(true);
        setMessages((prev) => [...prev, { id: makeId(), role: 'user', content: text }]);

        try {
            // 1) Try calc
            let renderedCalc = false;
            try {
                const calcJson = await fetchCalcFromText(text);
                const b = calcJson?.breakdown ?? {};
                const hasMoney =
                    Number(b.monthlyPI ?? 0) > 0 ||
                    Number(b.monthlyTax ?? 0) > 0 ||
                    Number(b.monthlyIns ?? 0) > 0 ||
                    Number(b.monthlyHOA ?? 0) > 0 ||
                    Number(b.monthlyMI ?? 0) > 0 ||
                    Number(b.monthlyTotalPITI ?? 0) > 0;

                const inputs = calcJson?.inputs ?? {};
                const impliedLoan =
                    Number(inputs.loanAmount ?? inputs.loan ?? 0) ||
                    (inputs.price && inputs.downPercent != null
                        ? Math.round(Number(inputs.price) * (1 - Number(inputs.downPercent) / 100))
                        : 0);

                if (hasMoney || impliedLoan > 0) {
                    setMessages((prev) => [
                        ...prev,
                        { id: makeId(), role: 'assistant', content: <CalcView data={calcJson} /> },
                    ]);
                    renderedCalc = true;
                }
            } catch (calcErr: any) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: makeId(),
                        role: 'assistant',
                        content: (
                            <div className="rounded-md border p-3 bg-amber-50 text-amber-900">
                                Calc couldn’t run: {String(calcErr?.message || 'unknown')}
                            </div>
                        ),
                    },
                ]);
            }

            if (renderedCalc) {
                setInput('');
                setBusy(false);
                return;
            }

            // 2) Fallback: sourced answer
            const a = await fetchAnswer(text).catch((e) => ({ error: String(e) }));
            const block =
                (a as any)?.answerMarkdown ||
                (a as any)?.answer ||
                (a as any)?.message ||
                (a as any)?.error ||
                '…';
            const follow =
                (a as any)?.followUp || (a as any)?.follow_up || (a as any)?.cta || '';

            setMessages((prev) => [
                ...prev,
                {
                    id: makeId(),
                    role: 'assistant',
                    content: (
                        <div className="space-y-2">
                            <pre className="whitespace-pre-wrap font-sans text-[15px] leading-6">
                                {String(block)}
                            </pre>
                            {Array.isArray((a as any)?.sources) && (a as any).sources.length > 0 ? (
                                <div className="text-sm opacity-80">
                                    <div className="font-semibold">Sources</div>
                                    <ul className="list-disc ml-5">
                                        {(a as any).sources.map((s: any, i: number) => (
                                            <li key={i}>
                                                <a className="underline" href={s.url} target="_blank" rel="noreferrer">
                                                    {s.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                            {follow ? (
                                <div className="text-sm text-gray-700 pt-1">
                                    <span className="font-medium">Follow-up:</span> {follow}
                                </div>
                            ) : null}
                        </div>
                    ),
                },
            ]);
        } catch (err: any) {
            setMessages((prev) => [
                ...prev,
                { id: makeId(), role: 'assistant', content: `Error: ${String(err?.message || err || 'failed')}` },
            ]);
        } finally {
            setInput('');
            setBusy(false);
        }
    }

    if (!mounted) {
        // Optional: tiny skeleton prevents flash + work on server
        return (
            <main className="max-w-3xl mx-auto p-4">
                <div className="animate-pulse h-5 w-48 bg-gray-200 rounded" />
                <div className="mt-4 space-y-3">
                    <div className="h-16 bg-gray-100 rounded" />
                    <div className="h-16 bg-gray-100 rounded" />
                </div>
            </main>
        );
    }

    return (
        <ErrorBoundary>
            <main className="max-w-3xl mx-auto p-4">
                <h1 className="text-2xl font-semibold">HomeRates.ai — Chat</h1>
                <p className="text-sm text-gray-600">
                    This chat routes mortgage math to the calc API and uses sourced answers for everything else.
                </p>

                <div className="mt-4 space-y-4">
                    {messages.map((m) => (
                        <div
                            key={m.id}
                            className={m.role === 'user' ? 'rounded-xl border p-3 bg-white' : 'rounded-xl border p-3 bg-gray-50'}
                        >
                            <div className="text-xs uppercase tracking-wider text-gray-500">{m.role}</div>
                            <div className="mt-1">{m.content}</div>
                        </div>
                    ))}
                </div>

                <form onSubmit={handleSend} className="mt-4 flex gap-2">
                    <input
                        ref={inputRef}
                        className="flex-1 border rounded-xl px-3 py-2"
                        placeholder="Ask: $400k loan at 6.5% for 30 years (ZIP optional)…"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={busy}
                    />
                    <button
                        type="submit"
                        className="px-4 py-2 rounded-xl border bg-black text-white disabled:opacity-50"
                        disabled={busy}
                    >
                        Send
                    </button>
                </form>

                <div className="mt-6 text-xs text-gray-500">
                    Tip: For taxes, include a price + ZIP. Example: “$750k in 91301 with 20% down at 6% for 30 years”.
                </div>
            </main>
        </ErrorBoundary>
    );
}
// ==== REPLACE ENTIRE FILE ====
