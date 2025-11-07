'use client';

import * as React from 'react';
import QuickCalcPanel, { type QuickCalcSeed } from '../components/QuickCalcPanel';

const LS_KEY = 'hr.chat.v1';

type MsgRole = 'user' | 'assistant';
type Msg = { id: string; role: MsgRole; content: React.ReactNode };

/* -------------------------------
   API helpers
-------------------------------- */
async function fetchCalcFromText(raw: string) {
    // Use the robust /api/calc/answer (POST body {q}) path first
    const resp = await fetch('/api/calc/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: raw }),
        cache: 'no-store',
    });
    if (!resp.ok) {
        // Don’t throw hard — we will fall back to the QuickCalcPanel button
        return null;
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
    if (!resp.ok) return null;
    return resp.json();
}

/* -------------------------------
   Calc renderer (safe with your JSON)
-------------------------------- */
function CalcView({ data }: { data: any }) {
    const inputs = data?.inputs ?? {};
    const b = data?.breakdown ?? {};

    const loanAmount: number = Number(
        inputs.loanAmount ??
        inputs.loan ??
        (inputs.price && inputs.downPercent != null
            ? Math.round(Number(inputs.price) * (1 - Number(inputs.downPercent) / 100))
            : 0),
    );

    const monthlyPI = Number(b.monthlyPI ?? 0);
    const monthlyTax = Number(b.monthlyTax ?? 0);
    const monthlyIns = Number(b.monthlyIns ?? 0);
    const monthlyHOA = Number(b.monthlyHOA ?? 0);
    const monthlyMI = Number(b.monthlyMI ?? 0);
    const monthlyTotalPITI = Number(
        b.monthlyTotalPITI ??
        monthlyPI + monthlyTax + monthlyIns + monthlyHOA + monthlyMI,
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

/* -------------------------------
   Page
-------------------------------- */
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
    const [panelOpen, setPanelOpen] = React.useState(false);

    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(messages));
        } catch { }
    }, [messages]);

    React.useEffect(() => {
        inputRef.current?.focus();
    }, []);

    function pushAssistantBlock(content: React.ReactNode) {
        setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: 'assistant', content },
        ]);
    }

    function pushUser(text: string) {
        setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: 'user', content: text },
        ]);
    }

    async function handleSend(e?: React.FormEvent) {
        if (e?.preventDefault) e.preventDefault();
        const text = input.trim();
        if (!text || busy) return;

        setBusy(true);
        pushUser(text);

        try {
            // 1) Try calc/answer first
            const calc = await fetchCalcFromText(text);
            if (calc && calc.breakdown) {
                pushAssistantBlock(<CalcView data={calc} />);
                setInput('');
                setBusy(false);
                return;
            }

            // 2) Fallback to sourced web answer
            const a = await fetchAnswer(text);
            if (a) {
                const block =
                    (a.answerMarkdown as string) ||
                    (a.answer as string) ||
                    (a.message as string) ||
                    '…';
                const follow = a.followUp || a.follow_up || a.cta || '';

                pushAssistantBlock(
                    <div className="space-y-2">
                        <pre className="whitespace-pre-wrap font-sans text-[15px] leading-6">
                            {block}
                        </pre>
                        {Array.isArray(a.sources) && a.sources.length > 0 ? (
                            <div className="text-sm opacity-80">
                                <div className="font-semibold">Sources</div>
                                <ul className="list-disc ml-5">
                                    {a.sources.map((s: any, i: number) => (
                                        <li key={i}>
                                            <a
                                                className="underline"
                                                href={s.url}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
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
                    </div>,
                );
                setInput('');
                setBusy(false);
                return;
            }

            // 3) If both paths failed, offer Quick Calc button
            pushAssistantBlock(
                <div className="space-y-2">
                    <div className="text-sm">
                        I couldn’t parse enough details. Want to use the quick calculator?
                    </div>
                    <button
                        type="button"
                        className="rounded-md border bg-black text-white px-3 py-2 text-sm"
                        onClick={() => setPanelOpen(true)}
                    >
                        Open Quick Calc
                    </button>
                </div>,
            );
        } catch (err: any) {
            pushAssistantBlock(`Error: ${err?.message || 'failed'}`);
        } finally {
            setInput('');
            setBusy(false);
        }
    }

    function handleQuickCalcResult(json: any) {
        pushAssistantBlock(<CalcView data={json} />);
    }

    const seed: QuickCalcSeed = {
        termYears: 30,
        ins: 100,
        hoa: 0,
    };

    return (
        <main className="max-w-3xl mx-auto p-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">HomeRates.ai — Chat</h1>
                    <p className="text-sm text-gray-600">
                        Mortgage math routes to the calc engine. Everything else is sourced Q&amp;A.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setPanelOpen(true)}
                    className="rounded-xl border bg-black text-white px-3 py-2 text-sm"
                >
                    Quick Calc
                </button>
            </div>

            <div className="mt-4 space-y-4">
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className={
                            m.role === 'user'
                                ? 'rounded-xl border p-3 bg-white'
                                : 'rounded-xl border p-3 bg-gray-50'
                        }
                    >
                        <div className="text-xs uppercase tracking-wider text-gray-500">
                            {m.role}
                        </div>
                        <div className="mt-1">{m.content}</div>
                    </div>
                ))}
            </div>

            <form onSubmit={handleSend} className="mt-4 flex gap-2">
                <input
                    ref={inputRef}
                    className="flex-1 border rounded-xl px-3 py-2"
                    placeholder="Ask: Payment on $620k at 6.25% for 30 years…"
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
                Tip: Taxes need a purchase price. Try “$750k in 91301 with 20% down at 6% for 30 years”.
            </div>

            <QuickCalcPanel
                open={panelOpen}
                onClose={() => setPanelOpen(false)}
                seed={seed}
                onResult={handleQuickCalcResult}
            />
        </main>
    );
}
