'use client';

import React from 'react';

/* =========================================================
   Local storage key (scoped to chat page)
   ========================================================= */
const LS_KEY = 'hr.chat.v1';

/* =========================================================
   Types
   ========================================================= */
type MsgRole = 'user' | 'assistant';
type Msg = { id: string; role: MsgRole; content: React.ReactNode };

/* =========================================================
   Intent: Does the text look like a mortgage calc?
   ========================================================= */
function looksLikeCalcIntent(s: string) {
    const t = s.toLowerCase();

    // money like $500k, 620,000, 1.25m
    const hasMoney = /\$?\s*\d[\d,]*(?:\.\d+)?\s*(k|m)?/.test(t);

    // explicit percent OR "at 6.25" style
    const hasRate =
        /(\d+(?:\.\d+)?)\s*%/.test(t) ||
        /\b(rate|interest|apr)\b/.test(t) ||
        /\bat\s*\d+(?:\.\d+)?\b/.test(t);

    // 30/15/360/180 OR "for 30 years" / "30 yr"
    const hasTerm =
        /\b(30|15|360|180)\b/.test(t) ||
        /\b\d+\s*(yrs?|years?|yr|y|months?|mos?)\b/.test(t) ||
        /\bfor\s+\d+\s*(yrs?|years?|yr|y|months?|mos?)\b/.test(t);

    // hard override: if it mentions down/loan + years + a dollar, treat as calc
    const strongSignals =
        /\$/.test(t) && hasTerm && (/\bdown\b/.test(t) || /\bloan\b/.test(t));

    return (hasMoney && hasRate && hasTerm) || strongSignals;
}


/* =========================================================
   Calc API call (natural language → calc/answer)
   ========================================================= */
async function fetchCalcFromText(raw: string) {
    const resp = await fetch('/api/calc/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: raw }),
        cache: 'no-store',
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({} as any));
        throw new Error(err?.message || err?.error || `calc error ${resp.status}`);
    }
    return resp.json();
}

/* =========================================================
   Web/NLP API call (answers with sources + follow-up)
   ========================================================= */
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

/* =========================================================
   Defensive Calc View (supports both legacy & new shapes)
   ========================================================= */
function CalcView({ data }: { data: any }) {
    // anchors: CalcView reads from breakdown
    const inputs = data?.inputs ?? {};
    const b = data?.breakdown ?? {};

    // derive loan if only price/down% provided
    const loanAmount: number = Number(
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

    // optional sensitivity array: [{ rate, pi }, ...]
    const sens = Array.isArray((data as any)?.sensitivity)
        ? (data as any).sensitivity
        : null;
    const n = (v: unknown) => Number(v ?? 0);

    const metaPath =
        data?.meta?.path || data?.route || 'calc';
    const metaAt =
        data?.meta?.at || data?.at || '';

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
            {Array.isArray(sens) && sens.length >= 2 ? (
                <div className="mt-1 text-sm opacity-80">
                    <div>
                        Rate: {((n(sens[0].rate)) * 100).toFixed(2)}% → P&amp;I $
                        {n(sens[0].pi).toLocaleString()}
                    </div>
                    <div>
                        Rate: {((n(sens[1].rate)) * 100).toFixed(2)}% → P&amp;I $
                        {n(sens[1].pi).toLocaleString()}
                    </div>
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

/* =========================================================
   Page component
   ========================================================= */
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

    // persist
    React.useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(messages));
        } catch { }
    }, [messages]);

    // focus
    React.useEffect(() => {
        inputRef.current?.focus();
    }, []);

    async function handleSend(e?: React.FormEvent) {
        if (e?.preventDefault) e.preventDefault();
        const text = input.trim();
        if (!text || busy) return;

        setBusy(true);

        // Always show user message
        setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: 'user', content: text },
        ]);

        try {
            if (looksLikeCalcIntent(text)) {
                // NATURAL LANGUAGE → calc/answer
                const calc = await fetchCalcFromText(text);
                setMessages((prev) => [
                    ...prev,
                    {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: <CalcView data={calc} />,
                    },
                ]);
            } else {
                // General Q&A → answers (sourced)
                const resp = await fetchAnswer(text).catch(() => null);

                const block =
                    (resp?.answerMarkdown as string) ||
                    (resp?.answer as string) ||
                    (resp?.message as string) ||
                    '…';

                const follow =
                    resp?.followUp || resp?.follow_up || resp?.cta || '';

                setMessages((prev) => [
                    ...prev,
                    {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: (
                            <div className="space-y-2">
                                <pre className="whitespace-pre-wrap font-sans text-[15px] leading-6">
                                    {block}
                                </pre>
                                {Array.isArray(resp?.sources) && resp.sources.length > 0 ? (
                                    <div className="text-sm opacity-80">
                                        <div className="font-semibold">Sources</div>
                                        <ul className="list-disc ml-5">
                                            {resp.sources.map((s: any, i: number) => (
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
                            </div>
                        ),
                    },
                ]);
            }
        } catch (err: any) {
            setMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `Error: ${err?.message || 'failed'}`,
                },
            ]);
        } finally {
            setInput('');
            setBusy(false);
        }
    }

    return (
        <main className="max-w-3xl mx-auto p-4">
            <h1 className="text-2xl font-semibold">HomeRates.ai — Chat</h1>
            <p className="text-sm text-gray-600">
                This chat routes mortgage math to the calc API and uses sourced answers for everything else.
            </p>

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
        </main>
    );
}
