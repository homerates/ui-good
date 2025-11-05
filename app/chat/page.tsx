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
    const hasMoney = /\$?\s*\d{2,3}(?:,\d{3})*(?:\s*[kK])?/.test(t);    // $400k / 620,000
    const hasRate = /(\d+(?:\.\d+)?)\s*%/.test(t) || /\b(rate|interest|apr)\b/.test(t);
    const hasTerm = /\b(yrs?|years?|y|months?|mos?)\b/.test(t) || /\b(30|15|360|180)\b/.test(t);
    return hasMoney && hasRate && hasTerm;
}

/* =========================================================
   Calc API call (natural language)
   ========================================================= */
async function fetchCalcFromText(raw: string) {
    const qs = new URLSearchParams({ q: raw });
    const resp = await fetch(`/api/calc/payment?${qs.toString()}`, { cache: 'no-store' });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `calc error ${resp.status}`);
    }
    return resp.json();
}

/* =========================================================
   Defensive Calc View (supports both legacy & new shapes)
   ========================================================= */
function CalcView({ data }: { data: any }) {
    const a = data?.answer ?? data ?? {};
    const n = (x: any) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

    const loanAmount = n(a.loanAmount);
    const monthlyPI = n(a.monthlyPI);
    const monthlyTax = n(a.monthlyTax);
    const monthlyIns = n(a.monthlyIns);
    const monthlyHOA = n(a.monthlyHOA);
    const monthlyMI = n(a.monthlyMI);
    const monthlyTotalPITI = n(a.monthlyTotalPITI);
    const sens = Array.isArray(a.sensitivities) ? a.sensitivities : (data?.sensitivities || []);

    return (
        <div className="rounded-xl border p-4 mt-3 space-y-2">
            <div className="text-sm text-gray-500">
                HR • path: {data?.meta?.path || 'calc'} • engine: {data?.meta?.engineUsed || 'n/a'}
                {data?.meta?.at ? <> • at: {data.meta.at}</> : null}
            </div>

            <div className="text-lg font-semibold">Loan amount: ${loanAmount.toLocaleString()}</div>
            <div className="text-lg font-semibold">Monthly P&amp;I: ${monthlyPI.toLocaleString()}</div>

            <div className="pt-2 font-medium">PITI breakdown</div>
            <div>Taxes: ${monthlyTax.toLocaleString()}</div>
            <div>Insurance: ${monthlyIns.toLocaleString()}</div>
            <div>HOA: ${monthlyHOA.toLocaleString()}</div>
            <div>MI: ${monthlyMI.toLocaleString()}</div>
            <div className="font-semibold">Total PITI: ${monthlyTotalPITI.toLocaleString()}</div>

            <div className="pt-2 font-medium">±0.25% Sensitivity</div>
            {sens?.length === 2 ? (
                <>
                    <div>Rate: {((n(sens[0].rate)) * 100).toFixed(2)}% → P&amp;I ${n(sens[0].pi).toLocaleString()}</div>
                    <div>Rate: {((n(sens[1].rate)) * 100).toFixed(2)}% → P&amp;I ${n(sens[1].pi).toLocaleString()}</div>
                </>
            ) : (
                <div className="text-gray-500">No sensitivity data</div>
            )}

            <div className="pt-2 text-sm text-gray-600">{data?.tldr || 'Principal & Interest with ±0.25% rate sensitivity.'}</div>
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
                const calc = await fetchCalcFromText(text);
                setMessages((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), role: 'assistant', content: <CalcView data={calc} /> },
                ]);
            } else {
                // Keep your existing web/NLP path here if you want general Q&A:
                const resp = await fetch('/api/web', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ q: text }),
                }).then((r) => r.json()).catch(() => null);

                const answer = resp?.answer || '…';
                setMessages((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), role: 'assistant', content: String(answer) },
                ]);
            }
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
            <h1 className="text-2xl font-semibold">HomeRates.ai — Chat</h1>
            <p className="text-sm text-gray-600">This chat routes mortgage math to the calc API and leaves your main app alone.</p>

            <div className="mt-4 space-y-4">
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className={m.role === 'user'
                            ? 'rounded-xl border p-3 bg-white'
                            : 'rounded-xl border p-3 bg-gray-50'}
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
                Tip: Taxes need a purchase price, e.g. “On a $750k home with 20% down at 6% for 30 years, taxes 1.2%, $1200 insurance, HOA $150”.
            </div>
        </main>
    );
}
