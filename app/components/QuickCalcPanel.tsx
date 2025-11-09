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
 * QuickCalc now proxies to the same calc engine as chat:
 *   GET /api/calc/answer?q=<natural language>
 * We compose a single "q" string (loan OR price+down) + rate + term + zip, with ins/hoa hints.
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

    function toK(n: string) {
        const v = n.trim();
        if (!v) return '';
        // allow 900k / 1.2m style or plain numbers
        if (/^\d+(\.\d+)?[kKmM]$/.test(v)) return v.toLowerCase();
        if (/^\d+(\.\d+)?$/.test(v)) return v;
        return v; // leave as-is; parser is robust
    }

    function buildQueryString(): string {
        const parts: string[] = [];

        const loan = toK(loanAmount);
        const price = toK(purchasePrice);
        const down = downPercent.trim();
        const rate = ratePct.trim();
        const years = termYears.trim() || '30';
        const zip5 = zip.trim();
        const insVal = ins.trim();
        const hoaVal = hoa.trim();

        if (loan) {
            // loan-first phrasing
            parts.push(`loan ${loan}`);
        } else if (price && down) {
            parts.push(`price ${price}`, `down ${down}%`);
        }

        if (rate) parts.push(`${rate}%`);
        if (years) parts.push(`${years} years`);
        if (zip5) parts.push(`zip ${zip5}`);

        // optional soft hints (engine supports these tokens)
        if (insVal) parts.push(`ins ${insVal}`);
        if (hoaVal) parts.push(`hoa ${hoaVal}`);

        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    async function handleRun() {
        const q = buildQueryString();

        // Guardrail: if neither loan nor (price+down) present, let the engine guide.
        const url = `/api/calc/answer?q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { cache: 'no-store' });
        const text = await res.text();
        let json: any = null;
        try {
            json = JSON.parse(text);
        } catch {
            throw new Error(`calc/answer invalid JSON: ${text.slice(0, 200)}`);
        }

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
                            placeholder="e.g., 400000 or 400k"
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
                            placeholder="e.g., 750000 or 750k"
                            className="w-full rounded-md border px-3 py-2"
                            inputMode="numeric"
                        />
                    </label>
                    <label className="text-sm">
                        <div className="mb-1 font-medium">Down %</div>
                        <input
                            value={downPercent}
                            onChange={(e) => setDownPercent(e.target.value)}
                            placeholder="e.g., 20"
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
                            placeholder="92688"
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
                    Tip: Use either a loan amount, or price + down%. Then add rate, term, and ZIP for the most accurate PITI.
                </p>
            </div>
        </SlidePanel>
    );
}
