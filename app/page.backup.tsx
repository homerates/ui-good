'use client';

import * as React from 'react';

/* ===== Formatting ===== */
const money = (n: number | undefined | null) =>
    Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ===== Types ===== */
type MsgRole = 'user' | 'assistant';
type Msg = { id: string; role: MsgRole; content: React.ReactNode };

type Inputs = {
    price?: number; downPercent?: number; loanAmount?: number; ratePct?: number;
    termMonths?: number; zip?: string; monthlyIns?: number; monthlyHOA?: number;
};
type Breakdown = {
    monthlyPI?: number; monthlyTaxes?: number; monthlyIns?: number; monthlyHOA?: number;
    monthlyMI?: number; monthlyTotalPITI?: number;
    sensitivity?: { piUp?: number; piDown?: number } | Array<{ label: string; value: number }>;
};
type ChatAPI =
    | { ok: true; kind: 'calc'; build?: string; inputs: Inputs; breakdown: Breakdown; taxSource?: string }
    | { ok: false; kind: 'guide'; needs: string[]; askPrompt: string; suggestions: { label: string; append: string }[]; examples: string[] }
    | { ok: true; kind: 'answer'; answer: string; results?: Array<{ title: string; url: string }> };

const LS_KEY = 'hr.chat.v1';
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function coerceMessages(v: unknown): Msg[] {
    try {
        if (Array.isArray(v)) return v as Msg[];
        if (v && typeof v === 'object' && Array.isArray((v as any).messages)) return (v as any).messages as Msg[];
    } catch { }
    return [];
}

/* ===== Error Boundary ===== */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 border rounded-lg bg-red-50 text-red-800">
                    <div className="font-semibold mb-1">Something went wrong</div>
                    <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={() => this.setState({ hasError: false })}>Recover</button>
                </div>
            );
        }
        return this.props.children;
    }
}

/* ===== Page ===== */
export default function ChatPage() {
    const [mounted, setMounted] = React.useState(false);
    const [messages, setMessages] = React.useState<Msg[]>([]);
    const [input, setInput] = React.useState('');
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    React.useEffect(() => {
        setMounted(true);
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const msgs = coerceMessages(parsed);
                if (msgs.length) setMessages(msgs);
            }
        } catch { }
    }, []);

    React.useEffect(() => {
        if (!mounted) return;
        try { localStorage.setItem(LS_KEY, JSON.stringify({ messages })); } catch { }
    }, [messages, mounted]);

    const send = React.useCallback(async () => {
        const q = input.trim();
        if (!q) return;
        const userMsg: Msg = { id: makeId(), role: 'user', content: q };
        setMessages(m => [...m, userMsg]);
        setInput('');

        try {
            const res = await fetch(`/api/chat?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
            const json = (await res.json()) as ChatAPI;
            let content: React.ReactNode;

            if (json.ok && json.kind === 'calc') {
                content = <CalcCard build={json.build} inputs={json.inputs} breakdown={json.breakdown} taxSource={json.taxSource} />;
            } else if (!json.ok && json.kind === 'guide') {
                content = <GuideCard guide={json} inject={(s) => setInput((prev) => (prev ? prev + s : q + s))} />;
            } else if (json.ok && json.kind === 'answer') {
                content = <AnswerCard answer={json.answer} results={json.results ?? []} />;
            } else {
                content = <div className="p-3 border rounded">I couldn’t process that. Try a payment structure or ask what you want to achieve.</div>;
            }

            const aiMsg: Msg = { id: makeId(), role: 'assistant', content };
            setMessages(m => [...m, aiMsg]);
        } catch (e) {
            const aiMsg: Msg = { id: makeId(), role: 'assistant', content: <div className="p-3 border rounded">Network hiccup. Try again.</div> };
            setMessages(m => [...m, aiMsg]);
        } finally {
            inputRef.current?.focus();
        }
    }, [input]);

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
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
                    <button onClick={() => void send()} className="px-4 py-2 bg-black text-white rounded">Send</button>
                </div>

                <div className="space-y-3">
                    {messages.map((m) => (
                        <div key={m.id} className="flex flex-col gap-1">
                            <div className="text-xs uppercase tracking-wide opacity-60">{m.role}</div>
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

/* ===== Cards ===== */

function CalcCard({ build, inputs, breakdown, taxSource }: { build?: string; inputs: Inputs; breakdown: Breakdown; taxSource?: string }) {
    const loan = inputs.loanAmount ?? 0;
    const pi = breakdown.monthlyPI ?? 0;
    const taxes = breakdown.monthlyTaxes ?? 0;
    const ins = breakdown.monthlyIns ?? inputs.monthlyIns ?? 0;
    const hoa = breakdown.monthlyHOA ?? inputs.monthlyHOA ?? 0;
    const mi = breakdown.monthlyMI ?? 0;
    const piti = breakdown.monthlyTotalPITI ?? pi + taxes + ins + hoa + mi;

    return (
        <div className="p-3 border rounded">
            <div className="text-xs opacity-70">HR • path: <span className="font-mono">chat → calc</span>{build ? <span> • build: {build}</span> : null}</div>
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
            {taxSource ? <div className="text-xs opacity-70 mt-1">Tax source: {taxSource}</div> : null}

            <div className="mt-3 text-sm opacity-80">Principal &amp; Interest with ±0.25% rate sensitivity.</div>
        </div>
    );
}

function GuideCard({ guide, inject }: { guide: Extract<ChatAPI, { kind: 'guide' }>; inject: (s: string) => void }) {
    const { needs, askPrompt, suggestions, examples } = guide;
    return (
        <div className="p-3 border rounded">
            <div className="text-xs opacity-70">HR • path: <span className="font-mono">chat → guide</span></div>

            <div className="mt-2 font-semibold">What I still need</div>
            {needs.length ? (
                <ul className="ml-5 list-disc text-sm">{needs.map((n, i) => <li key={i}>{n}</li>)}</ul>
            ) : <div className="text-sm opacity-70">Almost there—add one detail below.</div>}

            <div className="mt-3 text-sm">{askPrompt}</div>

            {suggestions.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {suggestions.map((s, i) => (
                        <button key={i} onClick={() => inject(s.append)} className="px-2 py-1 text-sm border rounded hover:bg-gray-50">
                            {s.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {examples.length ? (
                <>
                    <div className="mt-3 font-semibold">Examples</div>
                    <ul className="ml-5 list-disc text-sm">{examples.map((e, i) => <li key={i} className="font-mono">{e}</li>)}</ul>
                </>
            ) : null}
        </div>
    );
}

function AnswerCard({ answer, results }: { answer: string; results: Array<{ title: string; url: string }> }) {
    return (
        <div className="p-3 border rounded">
            <div className="text-xs opacity-70">HR • path: <span className="font-mono">chat → answers</span></div>
            <div className="mt-2 whitespace-pre-wrap">{answer}</div>
            {results?.length ? (
                <ul className="ml-5 list-disc text-sm mt-2">
                    {results.map((r, i) => (
                        <li key={i}><a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.title}</a></li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
