'use client';

import * as React from 'react';

/* ===== Formatting helper ===== */
const money = (n: number | undefined | null) =>
    Number(n ?? 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/* =========================
   Types & small utils
========================= */
type MsgRole = 'user' | 'assistant';
type Msg = { id: string; role: MsgRole; content: React.ReactNode };

type Inputs = {
    price?: number;
    downPercent?: number;
    loanAmount?: number;
    ratePct?: number;
    termMonths?: number;
    zip?: string;
    monthlyIns?: number;
    monthlyHOA?: number;
};

type Breakdown = {
    monthlyPI?: number;
    monthlyTaxes?: number;
    monthlyIns?: number;
    monthlyHOA?: number;
    monthlyMI?: number;
    monthlyTotalPITI?: number;
    sensitivity?: {
        piUp?: number;
        piDown?: number;
    } | Array<{ label: string; value: number }>;
};

type CalcResponse = {
    ok: boolean;
    build?: string;
    inputs?: Inputs;
    breakdown?: Breakdown;
    taxSource?: string;
    msg?: string;
};

const LS_KEY = 'hr.chat.v1';
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Coerce any previously stored blob into our message array. */
function coerceMessages(v: unknown): Msg[] {
    try {
        if (Array.isArray(v)) return v as Msg[];
        if (v && typeof v === 'object') {
            const maybe = (v as any).messages;
            if (Array.isArray(maybe)) return maybe as Msg[];
        }
    } catch { }
    return [];
}

/* ============ Error Boundary ============ */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; err?: any }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(err: any) {
        return { hasError: true, err };
    }
    componentDidCatch(err: any) {
        console.error('Chat page crashed:', err);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 border rounded-lg bg-red-50 text-red-800">
                    <div className="font-semibold mb-1">Something went wrong</div>
                    <div className="text-sm opacity-80 mb-3">The chat UI hit an error. You can recover below without a full reload.</div>
                    <button
                        className="px-3 py-2 rounded bg-red-600 text-white"
                        onClick={() => this.setState({ hasError: false, err: undefined })}
                    >
                        Recover
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

/* ============ Main Component ============ */
export default function ChatPage() {
    const [mounted, setMounted] = React.useState(false);
    const [messages, setMessages] = React.useState<Msg[]>([]);
    const [input, setInput] = React.useState('');
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    // mount gate to avoid hydration flicker
    React.useEffect(() => {
        setMounted(true);
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const msgs = coerceMessages(parsed);
                if (msgs.length) setMessages(msgs);
            }
        } catch {
            // ignore corrupt LS
        }
    }, []);

    // persist messages
    React.useEffect(() => {
        if (!mounted) return;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ messages }));
        } catch {
            // ignore quota/corruption
        }
    }, [messages, mounted]);

    const send = React.useCallback(async () => {
        const q = input.trim();
        if (!q) return;
        const userMsg: Msg = { id: makeId(), role: 'user', content: q };
        setMessages((m) => [...m, userMsg]);
        setInput('');

        try {
            const url = `/api/calc/answer?q=${encodeURIComponent(q)}`;
            const res = await fetch(url, { cache: 'no-store' });
            const json = (await res.json()) as CalcResponse;

            // Build assistant block from API response, rendering directly from inputs + breakdown
            const card = renderCalc(json);
            const aiMsg: Msg = { id: makeId(), role: 'assistant', content: card };
            setMessages((m) => [...m, aiMsg]);
        } catch (err: any) {
            console.error('calc call failed', err);
            const aiMsg: Msg = {
                id: makeId(),
                role: 'assistant',
                content: (
                    <div className="p-3 border rounded bg-yellow-50 text-yellow-900">
                        <div className="font-semibold">Couldn’t reach the calculator</div>
                        <div className="text-sm opacity-80">Check your connection and try again.</div>
                    </div>
                ),
            };
            setMessages((m) => [...m, aiMsg]);
        } finally {
            inputRef.current?.focus();
        }
    }, [input]);

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
        }
    };

    if (!mounted) return null;

    return (
        <ErrorBoundary>
            <div className="mx-auto max-w-3xl p-4 space-y-4">
                <h1 className="text-2xl font-semibold">Chat</h1>

                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={onKey}
                        className="flex-1 px-3 py-2 border rounded"
                        placeholder="Try: price 900k down 20 percent 6.25 30 years zip 92688"
                    />
                    <button onClick={() => void send()} className="px-4 py-2 bg-black text-white rounded">
                        Send
                    </button>
                </div>

                <div className="space-y-3">
                    {messages.map((m) => (
                        <div key={m.id} className="flex flex-col gap-1">
                            <div className="text-xs uppercase tracking-wide opacity-60">
                                {m.role === 'user' ? 'user' : 'assistant'}
                            </div>
                            <div className={m.role === 'user' ? 'p-3 border rounded' : ''}>{m.content}</div>
                        </div>
                    ))}
                </div>

                <footer className="pt-6 text-xs opacity-70">
                    HomeRates.Ai — Powered by OpenAI • {new Date().toLocaleString()}
                </footer>
            </div>
        </ErrorBoundary>
    );
}

/* ============ Renderers ============ */

function renderCalc(resp: CalcResponse) {
    const metaLine = (
        <div className="text-xs opacity-70">
            HR • path: <span className="font-mono">calc/answer</span>
            {resp.build ? <span> • build: {resp.build}</span> : null}
        </div>
    );

    if (!resp || resp.ok !== true || !resp.inputs || !resp.breakdown) {
        // Friendly guidance on 400s
        return (
            <div className="p-3 border rounded">
                {metaLine}
                <div className="mt-2 font-semibold">Couldn’t compute that one.</div>
                <div className="text-sm opacity-80">
                    {resp?.msg ||
                        "Need loan+rate+term OR price+down%+rate+term. Example: 'Loan $400k at 6.5% for 30 years' or 'Price $900k, 20% down, 6.25%, 30 years, ZIP 92688'."}
                </div>
            </div>
        );
    }

    const { inputs, breakdown, taxSource } = resp;

    // pull numbers directly (FIX: taxes now read from monthlyTaxes)
    const loan = inputs.loanAmount ?? 0;
    const pi = breakdown.monthlyPI ?? 0;
    const taxes = breakdown.monthlyTaxes ?? 0; // <-- this is the fix
    const ins = breakdown.monthlyIns ?? inputs.monthlyIns ?? 0;
    const hoa = breakdown.monthlyHOA ?? inputs.monthlyHOA ?? 0;
    const mi = breakdown.monthlyMI ?? 0;
    const piti = breakdown.monthlyTotalPITI ?? pi + taxes + ins + hoa + mi;

    const sensNode = renderSensitivity(breakdown.sensitivity);

    return (
        <div className="p-3 border rounded">
            {metaLine}

            <div className="mt-2 font-semibold">Loan amount: ${money(loan)}</div>
            <div>Monthly P&amp;I: ${money(pi)}</div>

            <div className="mt-3 font-semibold">PITI breakdown</div>
            <ul className="ml-5 list-disc text-sm">
                <li>Taxes: ${money(taxes)}</li>
                <li>Insurance: ${money(ins)}</li>
                <li>HOA: ${money(hoa)}</li>
                <li>MI: ${money(mi)}</li>
                <li className="font-medium">Total PITI: ${money(piti)}</li>
            </ul>

            {taxSource ? (
                <div className="text-xs opacity-70 mt-1">Tax source: {taxSource}</div>
            ) : null}

            <div className="mt-3 font-semibold">±0.25% Sensitivity</div>
            {sensNode}

            <div className="mt-3 text-sm opacity-80">
                Principal &amp; Interest with ±0.25% rate sensitivity.
            </div>
            <div className="mt-3 text-sm opacity-80">
                Follow-up: Want me to refine taxes with a purchase price + ZIP, or compare points vs a bigger down payment?
            </div>
        </div>
    );
}

function renderSensitivity(s:
    | Breakdown['sensitivity']
    | undefined
) {
    if (!s) {
        return <div className="text-sm opacity-60">No sensitivity data</div>;
    }
    if (Array.isArray(s) && s.length > 0) {
        return (
            <ul className="ml-5 list-disc text-sm">
                {s.map((row, i) => (
                    <li key={i}>
                        {row.label}: ${money(row.value)}
                    </li>
                ))}
            </ul>
        );
    }
    if (!Array.isArray(s) && (s.piUp || s.piDown)) {
        return (
            <ul className="ml-5 list-disc text-sm">
                {s.piUp != null ? <li>Rate +0.25% → P&amp;I ${money(s.piUp)}</li> : null}
                {s.piDown != null ? <li>Rate −0.25% → P&amp;I ${money(s.piDown)}</li> : null}
            </ul>
        );
    }
    return <div className="text-sm opacity-60">No sensitivity data</div>;
}
