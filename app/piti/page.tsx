// app/piti/page.tsx
'use client';
import { useState } from 'react';

export default function PitiDemo() {
    const [zip, setZip] = useState('90011');
    const [loan, setLoan] = useState('620000');
    const [rate, setRate] = useState('6.25');
    const [term, setTerm] = useState('30');
    const [ins, setIns] = useState('125');
    const [hoa, setHoa] = useState('125');
    const [data, setData] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);

    async function run() {
        setErr(null);
        setData(null);
        const q = new URLSearchParams({ zip, loan, rate, term, ins, hoa }).toString();
        const res = await fetch(`/api/piti?${q}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) { setErr(JSON.stringify(json)); return; }
        setData(json);
    }

    return (
        <div className="p-6 max-w-xl space-y-3">
            <h1 className="text-xl font-semibold">PITI demo</h1>
            <div className="grid grid-cols-2 gap-2">
                <input className="border p-2" value={zip} onChange={e => setZip(e.target.value)} placeholder="ZIP" />
                <input className="border p-2" value={loan} onChange={e => setLoan(e.target.value)} placeholder="Loan" />
                <input className="border p-2" value={rate} onChange={e => setRate(e.target.value)} placeholder="Rate %" />
                <input className="border p-2" value={term} onChange={e => setTerm(e.target.value)} placeholder="Term (yrs)" />
                <input className="border p-2" value={ins} onChange={e => setIns(e.target.value)} placeholder="Ins/mo" />
                <input className="border p-2" value={hoa} onChange={e => setHoa(e.target.value)} placeholder="HOA/mo" />
            </div>
            <button onClick={run} className="px-4 py-2 rounded bg-black text-white">Calculate</button>
            {err && <pre className="text-red-600 whitespace-pre-wrap">{err}</pre>}
            {data && (
                <div className="border p-3 rounded">
                    <div>County: {data.inputs.county}</div>
                    <div>Tax rate: {(data.lookups.taxRate * 100).toFixed(2)}%</div>
                    <div>PI: ${data.breakdown.monthlyPI.toLocaleString()}</div>
                    <div>Tax: ${data.breakdown.monthlyTax.toLocaleString()}</div>
                    <div>PITI: <b>${data.breakdown.monthlyPITI.toLocaleString()}</b></div>
                </div>
            )}
        </div>
    );
}
