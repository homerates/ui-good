'use client';

import * as React from 'react';
import SlidePanel from './ui/SlidePanel';

export type QuickCalcSeed = {
    purchasePrice?: number | null;
    downPercent?: number | null;
    loanAmount?: number | null;
    ratePct?: number | null;
    termYears?: number | null;
    zip?: string | null;
    hoa?: number | null;
    ins?: number | null;
    miPctAnnual?: number | null;
    taxBase?: 'price' | 'loan' | null;
    occupancy?: 'primary' | 'second' | 'investment' | null; // placeholder for later use
    creditScore?: number | null; // placeholder for later use
};

type QuickCalcPanelProps = {
    open: boolean;
    onClose: () => void;
    seed?: QuickCalcSeed;
    onResult?: (json: any) => void;
};

/**
 * A small, safe input panel that hits /api/calc/payment with
 * search params, no alias paths, no external libs.
 */
export default function QuickCalcPanel({
    open,
    onClose,
    seed,
    onResult,
}: QuickCalcPanelProps) {
    const [purchasePrice, setPurchasePrice] = React.useState<string>('');
    const [downPercent, setDownPercent] = React.useState<string>('');
    const [loanAmount, setLoanAmount] = React.useState<string>('');
    const [ratePct, setRatePct] = React.useState<string>('');
    const [termYears, setTermYears] = React.useState<string>('30');
    const [zip, setZip] = React.useState<string>('');
    const [hoa, setHoa] = React.useState<string>('0');
    const [ins, setIns] = React.useState<string>('100');

    // initialize from seed
    React.useEffect(() => {
        if (!open) return;
        if (seed?.purchasePrice != null) setPurchasePrice(String(seed.purchasePrice));
        if (seed?.downPercent != null) setDownPercent(String(seed.downPercent));
        if (seed?.loanAmount != null) setLoanAmount(String(seed.loanAmount));
        if (seed?.ratePct != null) setRatePct(String(seed.ratePct));
        if (seed?.termYears != null) setTermYears(String(seed.termYears));
        if (seed?.zip != null) setZip(String(seed.zip));
        if (seed?.hoa != null) setHoa(String(seed.hoa));
        if (seed?.ins != null) setIns(String(seed.ins));
    }, [open, seed]);

    async function handleRun() {
        const q = new URLSearchParams();

        // Either loanAmount or price+downPercent must exist for /api/calc/payment
        if (loanAmount.trim()) q.set('loan', loanAmount.trim());
        if (purchasePrice.trim()) q.set('price', purchasePrice.trim());
        if (downPercent.trim()) q.set('downPercent', downPercent.trim());

        if (ratePct.trim()) {
            q.set('rate', ratePct.trim());    // supported by your engine
            q.set('ratePct', ratePct.trim()); // also accepted
        }

        q.set('termYears', termYears.trim() || '30');
        q.set('termMonths', String((Number(termYears) || 30) * 12));

        if (zip.trim()) q.set('zip', zip.trim());

        // defaults for consistency with your engine
        q.set('ins', ins.trim() || '100');
        q.set('monthlyIns', ins.trim() || '100');
        q.set('hoa', hoa.trim() || '0');
        q.set('monthlyHOA', hoa.trim() || '0');

        // tax base is optional; engine can infer by ZIP+price
        // if (seed?.taxBase) q.set('taxBase', seed.taxBase);

        const url = `/api/calc/payment?${q.toString()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`calc/payment ${res.status}: ${text.slice(0, 200)}`);
        }
        const json = await res.json();
        onResult?.(json);
        onClose();
    }

    return (
        <SlidePanel
            open={open}
            onClose={onClose}
            title="Quick Calculator"
            widthClass="max-w-lg"
            footer={
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleRun}
                        className="rounded-md border bg-black text-white px-3 py-2 text-sm hover:opacity-90"
                    >
                        Calculate
                    </button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                        <div className="mb-1 font-medium">Loan Amount</div>
                        <input
                            value={loanAmount}
                            onChange={(e) => setLoanAmount(e.target.value)}
                            placeholder="e.g., 400000"
                            className="w-full rounded-md border px-3 py-2"
                            inputMode="numeric"
                        />
                    </label>
                    <label className="text-sm">
                        <div className="mb-1 font-medium">Rate %</div>
                        <input
                            value={ratePct}
                            onChange={(e) => setRatePct(e.target.value)}
                            placeholder="e.g., 6.5"
                            className="w-full rounded-md border px-3 py-2"
                            inputMode="decimal"
                        />
                    </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                        <div className="mb-1 font-medium">Purchase Price</div>
                        <input
                            value={purchasePrice}
                            onChange={(e) => setPurchasePrice(e.target.value)}
                            placeholder="e.g., 750000"
                            className="w-full rounded-md border px-3 py-2"
                            inputMode="numeric"
                        />
                    </label>
                    <label className="text-sm">
                        <div className="mb-1 font-medium">Down %</div>
                        <input
                            value={downPercent}
                            onChange={(e) => setDownPercent(e.target.value)}
                            placeholder="e.g., 10"
                            className="w-full rounded-md border px-3 py-2"
                            inputMode="decimal"
                        />
                    </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                        <div className="mb-1 font-medium">Term (Years)</div>
                        <input
                            value={termYears}
                            onChange={(e) => setTermYears(e.target.value)}
                            placeholder="30"
                            className="w-full rounded-md border px-3 py-2"
                            inputMode="numeric"
                        />
                    </label>
                    <label className="text-sm">
                        <div className="mb-1 font-medium">ZIP (for taxes)</div>
                        <input
                            value={zip}
                            onChange={(e) => setZip(e.target.value)}
                            placeholder="91301"
                            className="w-full rounded-md border px-3 py-2"
                            inputMode="numeric"
                            maxLength={5}
                        />
                    </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                        <div className="mb-1 font-medium">Insurance ($/mo)</div>
                        <input
                            value={ins}
                            onChange={(e) => setIns(e.target.value)}
                            placeholder="100"
                            className="w-full rounded-md border px-3 py-2"
                            inputMode="numeric"
                        />
                    </label>
                    <label className="text-sm">
                        <div className="mb-1 font-medium">HOA ($/mo)</div>
                        <input
                            value={hoa}
                            onChange={(e) => setHoa(e.target.value)}
                            placeholder="0"
                            className="w-full rounded-md border px-3 py-2"
                            inputMode="numeric"
                        />
                    </label>
                </div>

                <p className="text-xs text-gray-600">
                    Tip: If you enter a loan amount, price/down% are optional. If you don’t enter a loan amount,
                    make sure to include price and down%.
                </p>
            </div>
        </SlidePanel>
    );
}
