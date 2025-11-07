'use client';

import React from 'react';
import QuickCalcPanel, { type QuickCalcSeed } from '@/app/components/QuickCalcPanel';

const LS_KEY = 'hr.chat.v1';

type MsgRole = 'user' | 'assistant';
type Msg = { id: string; role: MsgRole; content: React.ReactNode };

// Answers API (sourced web fallback)
async function fetchAnswer(raw: string) {
    const resp = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: raw }),
        cache: 'no-store',
    });
    if (!resp.ok) throw new Error(`answers error ${resp.status}`);
    return resp.json();
}

// Calc probe (natural-language → calc/answer) — we still try it for typed asks
async function fetchCalcFromText(raw: string) {
    const resp = await fetch(`/api/calc/answer?q=${encodeURIComponent(raw)}`, { cache: 'no-store' });
    const j = await resp.json().catch(() => null);
    return { ok: resp.ok, json: j };
}

export default function ChatPage() {
    const [input, setInput] = React.useState('');
    const [messages, setMessages] = React.useState<Msg[]>(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            return raw ? (JSON.parse(raw) as Msg[]) : [];
        } catch {
            return [];
        }
    });
    const [busy, setBusy] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Slide-over state
    const [calcOpen, setCalcOpen] = React.useState(false);
    const [calcSeed, setCalcSeed] = React.useState<QuickCalcSeed | undefined>(undefined);

    React.useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(messages));
        } catch { }
    }, [messages]);

    React.useEffect(() => {
        inputRef.current?.focus();
    }, []);

    async function handleSend(e?: React.FormEvent) {
        if (e?.preventDefault) e.preventDefault();
        const text = input.trim();
        if (!text || busy) return;

        setBusy(true);
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }]);

        try {
            // 1) Try calc engine first
            let showedCalc = false;
            try {
                const { ok, json } = await fetchCalcFromText(text);
                if (ok && json && json.breakdown) {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: crypto.randomUUID(),
                            role: 'assistant',
                            content: (
                                <div className="rounded-xl border p-3 bg-gray-50">
                                    <div className="text-xs text-gray-500">
                                        path: {json.route || 'calc/answer'} {json.at ? `• at: ${json.at}` : ''}
                                    </div>
                                    <div className="text-sm mt-1">{json.answer || json.lineItem}</div>
                                </div>
                            ),
                        },
                    ]);
                    showedCalc = true;
                } else if (json?.needs) {
                    // Missing inputs → open slide-over and let the user fill them
                    setCalcSeed(undefined);
                    setCalcOpen(true);
                }
            } catch {
                // ignore and fall back to answers
            }
            if (showedCalc) {
                setInput('');
                setBusy(false);
                return;
            }

            // 2) Fallback sourced answer
            const a = await fetchAnswer(text).catch(() => null);
            const block =
                (a?.answerMarkdown as string) ||
                (a?.answer as string) ||
                (a?.message as string) ||
                '…';
            const follow = a?.followUp || a?.follow_up || a?.cta || '';

            setMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: (
                        <div className="space-y-2">
                            <pre className="whitespace-pre-wrap font-sans text-[15px] leading-6">{block}</pre>
                            {Array.isArray(a?.sources) && a.sources.length > 0 ? (
                                <div className="text-sm opacity-80">
                                    <div className="font-semibold">Sources</div>
                                    <ul className="list-disc ml-5">
                                        {a.sources.map((s: any, i: number) => (
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
                { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${err?.message || 'failed'}` },
            ]);
        } finally {
            setInput('');
            setBusy(false);
        }
    }

    return (
        <main className="max-w-3xl mx-auto p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">HomeRates.ai — Chat</h1>
                    <p className="text-sm text-gray-600">
                        Ask anything. For payments, open the calculator (left panel) for precise PITI.
                    </p>
                </div>
                <button
                    onClick={() => {
                        setCalcSeed(undefined);
                        setCalcOpen(true);
                    }}
                    className="px-3 py-2 rounded-xl border bg-black text-white"
                >
                    Payment Calculator
                </button>
            </div>

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
                    placeholder="Try: 400000 loan, 6.5% rate, 30 years — or open the calculator"
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

            {/* Slide-over calculator */}
            <QuickCalcPanel open={calcOpen} onClose={() => setCalcOpen(false)} seed={calcSeed} />
        </main>
    );
}
