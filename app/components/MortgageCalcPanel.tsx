'use client';

import * as React from 'react';

/* ========= Types ========= */
export type CalcInputs = {
    price: number;
    downPct: number;
    ratePct: number;
    termYears: number;
    zip?: string;
    hoa?: number;
};

export type Sensitivity = { rate: number; pi: number };

export type CalcResult = {
    loanAmount: number;
    monthlyPI: number;
    sensitivities: Sensitivity[];
};

/** This is what the composer expects to receive on submit. */
export type CalcSubmitResult = CalcInputs & CalcResult;

/* ========= Helpers ========= */
function money(n: number) {
    return Number(n ?? 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/** Standard mortgage P&I formula */
function calcPI(loanAmount: number, ratePct: number, termYears: number): number {
    const r = (ratePct / 100) / 12;
    const n = termYears * 12;
    if (!(loanAmount > 0) || !(r > 0) || !(n > 0)) return 0;
    const pmt = loanAmount * (r / (1 - Math.pow(1 + r, -n)));
    return Math.round(pmt * 100) / 100;
}

function calcSensitivities(loanAmount: number, ratePct: number, termYears: number): Sensitivity[] {
    const deltas = [-0.25, 0, 0.25];
    return deltas.map((d) => {
        const pct = ratePct + d;          // percent for label
        const r = (pct / 100) / 12;       // monthly rate as fraction
        const n = termYears * 12;
        const pi = loanAmount * (r / (1 - Math.pow(1 + r, -n)));
        return { rate: pct, pi: Math.round(pi * 100) / 100 };
    });
}

/* ========= Component ========= */
type Props = {
    /** Send back both the inputs and the computed result */
    onSubmit: (result: CalcSubmitResult) => void;
    onCancel: () => void;
    /** Optional defaults to seed the form */
    defaultValues?: Partial<CalcInputs>;
};

export default function MortgageCalcPanel({ onSubmit, onCancel, defaultValues }: Props) {
    const [price, setPrice] = React.useState<number>(defaultValues?.price ?? 900000);
    const [downPct, setDownPct] = React.useState<number>(defaultValues?.downPct ?? 20);
    const [ratePct, setRatePct] = React.useState<number>(defaultValues?.ratePct ?? 6.25);
    const [termYears, setTermYears] = React.useState<number>(defaultValues?.termYears ?? 30);
    const [zip, setZip] = React.useState<string>(defaultValues?.zip ?? '92688');
    const [hoa, setHoa] = React.useState<number>(defaultValues?.hoa ?? 0);

    function cleanNum(s: string): number {
        const v = Number(String(s).replace(/[, ]+/g, ''));
        return Number.isFinite(v) ? v : 0;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const dp = Math.max(0, Math.min(100, Number(downPct)));
        const loanAmount = Math.round(price * (1 - dp / 100));
        const monthlyPI = calcPI(loanAmount, ratePct, termYears);
        const sensitivities = calcSensitivities(loanAmount, ratePct, termYears);

        onSubmit({
            price,
            downPct: dp,
            ratePct,
            termYears,
            zip,
            hoa,
            loanAmount,
            monthlyPI,
            sensitivities,
        });
    }

    const previewLoan = Math.round(price * (1 - (downPct || 0) / 100));
    const previewPI = calcPI(previewLoan, ratePct || 0, termYears || 0);

    return (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
            <div className="grid" style={{ display: 'grid', gap: 10 }}>
                <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                    Purchase price
                    <input
                        name="price"
                        inputMode="decimal"
                        value={price}
                        onChange={(e) => setPrice(cleanNum(e.target.value))}
                        className="input"
                        autoFocus
                        placeholder="e.g. 900000"
                    />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        Down payment %
                        <input
                            name="downPct"
                            inputMode="decimal"
                            value={downPct}
                            onChange={(e) => setDownPct(cleanNum(e.target.value))}
                            className="input"
                            placeholder="e.g. 20"
                        />
                    </label>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        Rate %
                        <input
                            name="ratePct"
                            inputMode="decimal"
                            value={ratePct}
                            onChange={(e) => setRatePct(cleanNum(e.target.value))}
                            className="input"
                            placeholder="e.g. 6.25"
                        />
                    </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        Term (years)
                        <input
                            name="termYears"
                            inputMode="numeric"
                            value={termYears}
                            onChange={(e) => setTermYears(cleanNum(e.target.value))}
                            className="input"
                            placeholder="e.g. 30"
                        />
                    </label>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        ZIP
                        <input
                            name="zip"
                            inputMode="numeric"
                            value={zip}
                            onChange={(e) => setZip(e.target.value.trim())}
                            className="input"
                            placeholder="e.g. 92688"
                        />
                    </label>
                </div>

                <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                    HOA (optional)
                    <input
                        name="hoa"
                        inputMode="decimal"
                        value={hoa || ''}
                        onChange={(e) => setHoa(cleanNum(e.target.value))}
                        className="input"
                        placeholder="e.g. 125"
                    />
                </label>

                <div className="panel" style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Preview (client-side)</div>
                    <div>Loan amount: ${money(previewLoan)}</div>
                    <div>Monthly P&I: ${money(previewPI)}</div>
                </div>

                <p className="text-xs" style={{ opacity: 0.7 }}>
                    Guided inputs only. We’ll feed these values into your chat as a results card and wire the API later.
                </p>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" type="button" onClick={onCancel}>Cancel</button>
                <button className="btn primary" type="submit">Use these inputs</button>
            </div>
        </form>
    );
}
