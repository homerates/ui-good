'use client';

import React from 'react';
import SlidePanel from '@/app/components/ui/SlidePanel';

type Result = {
    path?: string;
    at?: string;
    inputs?: {
        loanAmount?: number | null;
        ratePct?: number | null;
        termMonths?: number | null;
    };
    breakdown?: {
        monthlyPI?: number;
        monthlyTax?: number;
        monthlyIns?: number;
        monthlyHOA?: number;
        monthlyMI?: number;
        monthlyTotalPITI?: number;
    };
    sensitivity?: { up025?: number; down025?: number } | any[];
    answer?: string;
    error?: string;
};

function n2(v: unknown, d = 0) {
    const num = Number(v);
    return Number.isFinite(num) ? num : d;
}

export type QuickCalcSeed = {
    loan?: number;
    price?: number;
    downPercent?: number;
    rate?: number;
    termYears?: number;
    zip?: string;
    ins?: number;
    hoa?: number;
    // optional UX-only fields (future use in pricing rules)
    occupancy?: 'primary' | 'second' | 'investment';
    creditTier?: '760+' | '740-759' | '720-739' | '700-719' | '660-699' | '<660';
    purpose?: 'purchase' | 'rate-term' | 'cash-out';
};

export default function QuickCalcPanel(props: {
    open: boolean;
    onClose: () => void;
    seed?: QuickCalcSeed;
}) {
    const { open, onClose, seed } = props;

    // Mode: loan OR price
    const [mode, setMode] = React.useState<'loan' | 'price'>(
        seed?.price ? 'price' : 'loan'
    );

    // Inputs
    const [loanAmount, setLoanAmount] = React.useState<string>(
        seed?.loan != null ? String(seed.loan) : '400000'
    );
    const [purchasePrice, setPurchasePrice] = React.useState<string>(
        seed?.price != null ? String(seed.price) : '750000'
    );
    const [downPercent, setDownPercent] = React.useState<string>(
        seed?.downPercent != null ? String(seed.downPercent) : '20'
    );

    const [ratePct, setRatePct] = React.useState<string>(
        seed?.rate != null ? String(seed.rate) : '6.25'
    );
    const [termYears, setTermYears] = React.useState<string>(
        seed?.termYears != null ? String(seed.termYears) : '30'
    );
    const [zip, setZip] = React.useState<string>(seed?.zip ?? '91301');

    const [monthlyIns, setMonthlyIns] = React.useState<string>(
        seed?.ins != null ? String(seed.ins) : '100'
    );
    const [monthlyHOA, setMonthlyHOA] = React.useState<string>(
        seed?.hoa != null ? String(seed.hoa) : '0'
    );

    // Extra UX-only fields we can pass through (not required by /api/calc/payment yet)
    const [occupancy, setOccupancy] = React.useState<QuickCalcSeed['occupancy']>(
        seed?.occupancy ?? 'primary'
    );
    const [creditTier, setCreditTier] = React.useState<QuickCalcSeed['creditTier']>(
        seed?.creditTier ?? '740-759'
    );
    const [purpose, setPurpose] = React.useState<QuickCalcSeed['purpose']>(
        seed?.purpose ?? 'purchase'
    );

    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string>('');
    const [result, setResult] = React.useState<Result | null>(null);

    React.useEffect(() => {
        if (!open) {
            setResult(null);
            setError('');
        }
    }, [open]);

    const derivedLoan =
        mode === 'loan'
            ? n2(loanAmount, 0)
            : Math.max(0, Math.round(n2(purchasePrice, 0) * (1 - n2(downPercent, 0) / 100)));

    const canCompute =
        n2(ratePct, NaN) > 0 &&
        n2(termYears, NaN) > 0 &&
        (mode === 'loan'
            ? n2(loanAmount, NaN) > 0
            : n2(purchasePrice, NaN) > 0 && n2(downPercent, NaN) >= 0 && n2(downPercent, NaN) < 100);

    async function handleCompute(e?: React.FormEvent) {
        if (e?.preventDefault) e.preventDefault();
        if (busy || !canCompute) return;

        setBusy(true);
        setError('');
        setResult(null);

        try {
            const qs = new URLSearchParams();

            if (mode === 'loan') {
                qs.set('loan', String(n2(loanAmount, 0)));
            } else {
                qs.set('price', String(n2(purchasePrice, 0)));
                qs.set('downPercent', String(n2(downPercent, 0)));
                qs.set('loan', String(derivedLoan));
            }

            qs.set('rate', String(n2(ratePct, 0)));
            qs.set('ratePct', String(n2(ratePct, 0)));
            qs.set('term', String(n2(termYears, 30)));
            qs.set('termYears', String(n2(termYears, 30)));
            qs.set('termMonths', String(n2(termYears, 30) * 12));
            if (zip.trim()) qs.set('zip', zip.trim());

            // Carry extras for future engine features / analytics:
            qs.set('ins', String(n2(monthlyIns, 0)));
            qs.set('monthlyIns', String(n2(monthlyIns, 0)));
            qs.set('hoa', String(n2(monthlyHOA, 0)));
            qs.set('monthlyHOA', String(n2(monthlyHOA, 0)));
            qs.set('occupancy', String(occupancy));
            qs.set('creditTier', String(creditTier));
            qs.set('purpose', String(purpose));

            const resp = await fetch(`/api/calc/payment?${qs.toString()}`, { cache: 'no-store' });
            const j = (await resp.json()) as Result;

            if (!resp.ok) throw new Error(j?.error || `calc error ${resp.status}`);
            setResult(j);
        } catch (err: any) {
            setError(err?.message || 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    }

    const b = result?.breakdown || {};
    const pi = n2(b.monthlyPI, 0);
    const tax = n2(b.monthlyTax, 0);
    const ins = n2(b.monthlyIns, 0);
    const hoa = n2(b.monthlyHOA, 0);
    const mi = n2(b.monthlyMI, 0);
    const piti = n2(b.monthlyTotalPITI, pi + tax + ins + hoa + mi);

    return (
        <SlidePanel
            open={open}
            onClose={busy ? () => { } : onClose}
            title="Quick Payment Calculator"
            widthClassName="w-[560px]"
        >
            {/* Mode */}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setMode('loan')}
                    className={`px-3 py-2 rounded-xl border ${mode === 'loan' ? 'bg-black text-white' : 'bg-white'}`}
                >
                    Enter Loan Amount
                </button>
                <button
                    type="button"
                    onClick={() => setMode('price')}
                    className={`px-3 py-2 rounded-xl border ${mode === 'price' ? 'bg-black text-white' : 'bg-white'}`}
                >
                    Enter Price + Down %
                </button>
            </div>

            {/* Inputs */}
            <form onSubmit={handleCompute} className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {mode === 'loan' ? (
                    <label className="block">
                        <div className="text-sm text-gray-700">Loan Amount</div>
                        <input
                            value={loanAmount}
                            onChange={(e) => setLoanAmount(e.target.value)}
                            className="w-full border rounded-xl px-3 py-2"
                            inputMode="numeric"
                            placeholder="e.g., 400000"
                        />
                    </label>
                ) : (
                    <>
                        <label className="block">
                            <div className="text-sm text-gray-700">Purchase Price</div>
                            <input
                                value={purchasePrice}
                                onChange={(e) => setPurchasePrice(e.target.value)}
                                className="w-full border rounded-xl px-3 py-2"
                                inputMode="numeric"
                                placeholder="e.g., 750000"
                            />
                        </label>
                        <label className="block">
                            <div className="text-sm text-gray-700">Down Payment (%)</div>
                            <input
                                value={downPercent}
                                onChange={(e) => setDownPercent(e.target.value)}
                                className="w-full border rounded-xl px-3 py-2"
                                inputMode="decimal"
                                placeholder="e.g., 10"
                            />
                        </label>
                        <div className="block">
                            <div className="text-sm text-gray-700">Derived Loan</div>
                            <div className="border rounded-xl px-3 py-2 bg-gray-50">
                                ${derivedLoan.toLocaleString()}
                            </div>
                        </div>
                    </>
                )}

                <label className="block">
                    <div className="text-sm text-gray-700">Rate (%)</div>
                    <input
                        value={ratePct}
                        onChange={(e) => setRatePct(e.target.value)}
                        className="w-full border rounded-xl px-3 py-2"
                        inputMode="decimal"
                        placeholder="e.g., 6.25"
                    />
                </label>

                <label className="block">
                    <div className="text-sm text-gray-700">Term (years)</div>
                    <input
                        value={termYears}
                        onChange={(e) => setTermYears(e.target.value)}
                        className="w-full border rounded-xl px-3 py-2"
                        inputMode="numeric"
                        placeholder="30"
                    />
                </label>

                <label className="block">
                    <div className="text-sm text-gray-700">ZIP (for taxes)</div>
                    <input
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        className="w-full border rounded-xl px-3 py-2"
                        inputMode="numeric"
                        placeholder="91301"
                    />
                </label>

                <label className="block">
                    <div className="text-sm text-gray-700">Monthly Insurance ($)</div>
                    <input
                        value={monthlyIns}
                        onChange={(e) => setMonthlyIns(e.target.value)}
                        className="w-full border rounded-xl px-3 py-2"
                        inputMode="numeric"
                        placeholder="100"
                    />
                </label>

                <label className="block">
                    <div className="text-sm text-gray-700">Monthly HOA ($)</div>
                    <input
                        value={monthlyHOA}
                        onChange={(e) => setMonthlyHOA(e.target.value)}
                        className="w-full border rounded-xl px-3 py-2"
                        inputMode="numeric"
                        placeholder="0"
                    />
                </label>

                {/* Extra selectors (future-ready for pricing rules, DSCR, Jumbo, etc.) */}
                <label className="block">
                    <div className="text-sm text-gray-700">Occupancy</div>
                    <select
                        value={occupancy}
                        onChange={(e) => setOccupancy(e.target.value as any)}
                        className="w-full border rounded-xl px-3 py-2 bg-white"
                    >
                        <option value="primary">Primary</option>
                        <option value="second">Second Home</option>
                        <option value="investment">Investment</option>
                    </select>
                </label>

                <label className="block">
                    <div className="text-sm text-gray-700">Credit Tier</div>
                    <select
                        value={creditTier}
                        onChange={(e) => setCreditTier(e.target.value as any)}
                        className="w-full border rounded-xl px-3 py-2 bg-white"
                    >
                        <option value="760+">760+</option>
                        <option value="740-759">740–759</option>
                        <option value="720-739">720–739</option>
                        <option value="700-719">700–719</option>
                        <option value="660-699">660–699</option>
                        <option value="<660">{'<660'}</option>
                    </select>
                </label>

                <label className="block">
                    <div className="text-sm text-gray-700">Purpose</div>
                    <select
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value as any)}
                        className="w-full border rounded-xl px-3 py-2 bg-white"
                    >
                        <option value="purchase">Purchase</option>
                        <option value="rate-term">Rate/Term Refi</option>
                        <option value="cash-out">Cash-Out Refi</option>
                    </select>
                </label>

                <div className="md:col-span-3">
                    <button
                        type="submit"
                        disabled={!canCompute || busy}
                        className="px-4 py-2 rounded-xl border bg-black text-white disabled:opacity-50"
                    >
                        {busy ? 'Computing…' : 'Compute Payment'}
                    </button>
                    {!canCompute ? (
                        <div className="text-xs text-gray-500 mt-2">
                            Enter {mode === 'loan' ? 'Loan, Rate, Term' : 'Price, Down %, Rate, Term'} to compute.
                        </div>
                    ) : null}
                </div>
            </form>

            {/* Result */}
            <div className="mt-5">
                {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
                        {error}
                    </div>
                ) : null}

                {result ? (
                    <div className="rounded-xl border p-4 space-y-2">
                        <div className="text-sm text-gray-500">
                            path: {result.path || 'calc/payment'}
                            {result.at ? ` • at: ${result.at}` : ''}
                        </div>
                        <div className="text-lg font-semibold">
                            Loan amount: $
                            {n2(result?.inputs?.loanAmount, derivedLoan).toLocaleString()}
                        </div>
                        <div className="text-lg font-semibold">
                            Monthly P&amp;I: ${n2(result?.breakdown?.monthlyPI, 0).toLocaleString()}
                        </div>

                        <div className="pt-2 font-medium">PITI breakdown</div>
                        <div>Tax: ${n2(result?.breakdown?.monthlyTax, 0).toLocaleString()}</div>
                        <div>Insurance: ${n2(result?.breakdown?.monthlyIns, 0).toLocaleString()}</div>
                        <div>HOA: ${n2(result?.breakdown?.monthlyHOA, 0).toLocaleString()}</div>
                        {n2(result?.breakdown?.monthlyMI, 0) > 0 ? (
                            <div>MI: ${n2(result?.breakdown?.monthlyMI, 0).toLocaleString()}</div>
                        ) : null}
                        <div className="font-semibold">
                            Total PITI: ${n2(result?.breakdown?.monthlyTotalPITI, piti).toLocaleString()}
                        </div>

                        {result?.sensitivity && !Array.isArray(result.sensitivity) ? (
                            <div className="pt-2 text-sm opacity-80">
                                <div className="font-medium">±0.25% Sensitivity</div>
                                {'up025' in (result.sensitivity as any) ? (
                                    <div>
                                        Rate +0.25% → P&amp;I $
                                        {n2((result.sensitivity as any).up025).toLocaleString()}
                                    </div>
                                ) : null}
                                {'down025' in (result.sensitivity as any) ? (
                                    <div>
                                        Rate −0.25% → P&amp;I $
                                        {n2((result.sensitivity as any).down025).toLocaleString()}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        <div className="pt-2 text-sm text-gray-600">
                            {result?.answer || 'Estimated payment shown above.'}
                        </div>
                    </div>
                ) : (
                    <div className="text-sm text-gray-500">Results will appear here after you compute.</div>
                )}
            </div>
        </SlidePanel>
    );
}
