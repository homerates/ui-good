// app/components/MortgageCalcPanel.tsx
'use client';

import * as React from 'react';

type Inputs = {
    price: number;
    downPct: number;      // 20 = 20%
    ratePct: number;      // 6.25 = 6.25%
    termYears: number;    // 30
    zip?: string;
    hoa?: number;
};

type CalcResult = {
    inputs: Inputs;
    loanAmount: number;
    monthlyPI: number;
    sensitivities: Array<{ rate: number; pi: number }>; // rate as decimal (0.0625)
};

function toNumber(s: FormDataEntryValue | null, def = 0) {
    if (s == null) return def;
    const n = Number(String(s).replace(/[, ]+/g, ''));
    return Number.isFinite(n) ? n : def;
}

function monthlyPI(loan: number, annualRatePct: number, termYears: number) {
    const r = (annualRatePct / 100) / 12;
    const n = termYears * 12;
    if (loan <= 0 || r <= 0 || n <= 0) return 0;
    const denom = r / (1 - Math.pow(1 + r, -n));
    return Math.round((loan * denom) * 100) / 100;
}

function buildSensitivities(loan: number, baseRatePct: number, termYears: number) {
    const bands = [baseRatePct - 0.25, baseRatePct, baseRatePct + 0.25];
    return bands.map((bp) => ({
        rate: bp / 100, // decimal
        pi: monthlyPI(loan, bp, termYears),
    }));
}

export default function MortgageCalcPanel(props: {
    onSubmit: (result: CalcResult) => void;
    onCancel: () => void;
}) {
    // Defaults aligned with your demos
    const [price, setPrice] = React.useState('900000');
    const [downPct, setDownPct] = React.useState('20');
    const [ratePct, setRatePct] = React.useState('6.25');
    const [termYears, setTermYears] = React.useState('30');
    const [zip, setZip] = React.useState('92688');
    const [hoa, setHoa] = React.useState('');

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);

                const _price = toNumber(fd.get('price'));
                const _downPct = toNumber(fd.get('downPct'));
                const _ratePct = toNumber(fd.get('ratePct'));
                const _termYears = toNumber(fd.get('termYears'), 30);
                const _zip = String(fd.get('zip') || '').trim();
                const _hoa = toNumber(fd.get('hoa'));

                const loanAmount = Math.max(0, Math.round(_price * (1 - _downPct / 100)));
                const pi = monthlyPI(loanAmount, _ratePct, _termYears);
                const sensitivities = buildSensitivities(loanAmount, _ratePct, _termYears);

                props.onSubmit({
                    inputs: {
                        price: _price,
                        downPct: _downPct,
                        ratePct: _ratePct,
                        termYears: _termYears,
                        zip: _zip,
                        hoa: _hoa,
                    },
                    loanAmount,
                    monthlyPI: pi,
                    sensitivities,
                });
            }}
            style={{ display: 'grid', gap: 10 }}
        >
            <div className="grid" style={{ display: 'grid', gap: 10 }}>
                <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                    Purchase price
                    <input
                        name="price"
                        inputMode="decimal"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="e.g. 900000"
                        className="input"
                        autoFocus
                    />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        Down payment %
                        <input
                            name="downPct"
                            inputMode="decimal"
                            value={downPct}
                            onChange={(e) => setDownPct(e.target.value)}
                            placeholder="e.g. 20"
                            className="input"
                        />
                    </label>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        Rate %
                        <input
                            name="ratePct"
                            inputMode="decimal"
                            value={ratePct}
                            onChange={(e) => setRatePct(e.target.value)}
                            placeholder="e.g. 6.25"
                            className="input"
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
                            onChange={(e) => setTermYears(e.target.value)}
                            placeholder="e.g. 30"
                            className="input"
                        />
                    </label>
                    <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                        ZIP
                        <input
                            name="zip"
                            inputMode="numeric"
                            value={zip}
                            onChange={(e) => setZip(e.target.value)}
                            placeholder="e.g. 92688"
                            className="input"
                        />
                    </label>
                </div>

                <label className="text-sm" style={{ display: 'grid', gap: 6 }}>
                    HOA (optional)
                    <input
                        name="hoa"
                        inputMode="decimal"
                        value={hoa}
                        onChange={(e) => setHoa(e.target.value)}
                        placeholder="e.g. 125"
                        className="input"
                    />
                </label>

                <p className="text-xs" style={{ opacity: 0.7 }}>
                    This runs real amortization locally. Next pass: plug tax/MI/ins lookups for full PITI.
                </p>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" type="button" onClick={props.onCancel}>Cancel</button>
                <button className="btn primary" type="submit">Use these inputs</button>
            </div>
        </form>
    );
}
