'use client';

import React from 'react';
import { useParams } from 'next/navigation';

const fmt = (n: number | null | undefined, opts?: Intl.NumberFormatOptions) =>
    n != null ? n.toLocaleString('en-US', opts) : null;
const fmtDollar = (n: number | null | undefined) => n != null ? `$${fmt(n)}` : null;

type LoData = {
    name: string; email: string; photo: string; lender: string | null;
    nmls: string | null; company_nmls: string | null; title: string | null;
    phone: string | null; website: string | null; office_address: string | null;
};

type BorrowerData = {
    name: string; property_address: string | null;
    actual_balance: number | null; actual_rate: number | null;
    actual_purchase_price: number | null; actual_purchase_date: string | null;
};

type Analysis = {
    estimatedValue: number | null; estimatedValueLow: number | null; estimatedValueHigh: number | null;
    lastSalePrice: number | null; lastSaleDate: string | null;
    estimatedBalance: number | null; estimatedEquity: number | null;
    equityPct: number | null; appreciationPct: number | null; ltv: number | null;
    liveRate: number | null; piti: number | null;
    beds: number | null; baths: number | null; sqft: number | null;
    city: string | null; state: string | null; zip: string | null;
    valueHistory: { year: number; value: number }[];
    balanceIsEstimated: boolean; rateIsEstimated: boolean;
};

const RATES = [5.5, 5.99, 6.5, 6.99, 7.5];

function pitiCalc(balance: number, rate: number, taxes: number, sqft: number): number {
    const mo = rate / 100 / 12;
    const n = 360;
    const pi = balance * (mo * Math.pow(1 + mo, n)) / (Math.pow(1 + mo, n) - 1);
    const ins = Math.round((sqft ? sqft * 1.2 : 1200) / 12);
    return Math.round(pi + taxes / 12 + ins);
}

export default function ReportPage() {
    const params = useParams();
    const token = Array.isArray(params?.token) ? params.token[0] : (params?.token as string | undefined);
    const [lo, setLo] = React.useState<LoData | null>(null);
    const [borrower, setBorrower] = React.useState<BorrowerData | null>(null);
    const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [err, setErr] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!token) return;
        (async () => {
            // 1 — load report meta (borrower + LO)
            const r = await fetch(`/api/report/${token}`);
            const d = await r.json();
            if (!d.ok) { setErr('Report not found or has expired.'); setLoading(false); return; }
            setLo(d.lo);
            setBorrower(d.borrower);

            // 2 — load property analysis
            if (d.borrower.property_address) {
                const params = new URLSearchParams({ address: d.borrower.property_address });
                if (d.borrower.actual_balance)        params.set('actual_balance',        String(d.borrower.actual_balance));
                if (d.borrower.actual_rate)           params.set('actual_rate',           String(d.borrower.actual_rate));
                if (d.borrower.actual_purchase_price) params.set('actual_purchase_price', String(d.borrower.actual_purchase_price));
                if (d.borrower.actual_purchase_date)  params.set('actual_purchase_date',  d.borrower.actual_purchase_date);
                try {
                    const ar = await fetch(`/api/homeowner/analysis?${params}`);
                    const ad = await ar.json();
                    if (ad.ok !== false) setAnalysis(ad);
                } catch {}
            }
            setLoading(false);
        })();
    }, [token]);

    const streetViewUrl = borrower?.property_address
        ? `https://maps.googleapis.com/maps/api/streetview?size=800x400&location=${encodeURIComponent(borrower.property_address)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
        : null;

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    if (loading) return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ color: '#64748b', fontSize: '1rem' }}>Loading report…</div>
        </div>
    );

    if (err || !lo || !borrower) return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ color: '#ef4444', fontSize: '1rem' }}>{err ?? 'Unable to load report.'}</div>
        </div>
    );

    const val = analysis?.estimatedValue;
    const equity = analysis?.estimatedEquity;
    const equityPct = analysis?.equityPct;
    const appPct = analysis?.appreciationPct;
    const balance = analysis?.estimatedBalance;
    const origPrice = borrower.actual_purchase_price ?? analysis?.lastSalePrice;
    const currentRate = borrower.actual_rate ?? analysis?.liveRate;
    const annualTaxEst = val ? Math.round(val * 0.0115) : null;
    const sqft = analysis?.sqft ?? 1800;

    // 5-year appreciation projection at 4.2% avg
    const projections = val ? Array.from({ length: 6 }, (_, i) => ({
        yr: i,
        val: Math.round(val * Math.pow(1.042, i)),
    })) : [];
    const maxProj = projections.length ? Math.max(...projections.map(p => p.val)) : 1;

    const cell: React.CSSProperties = { padding: '10px 12px', fontSize: '0.82rem', borderBottom: '1px solid #f1f5f9', color: '#1e293b' };
    const cellHdr: React.CSSProperties = { ...cell, fontWeight: 700, background: '#f8fafc', color: '#374151' };

    return (
        <div style={{ background: '#f1f5f9', minHeight: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
            {/* Page shell — max 860px centered */}
            <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 16px 64px' }}>

                {/* ── LO Header ─────────────────────────────────────── */}
                <div style={{
                    background: '#fff', borderRadius: 14, padding: '20px 24px', marginBottom: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {lo.photo && (
                            <img src={lo.photo} alt={lo.name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }} />
                        )}
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{lo.name}</div>
                            {lo.title && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{lo.title}</div>}
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                                {[lo.lender, lo.nmls ? `NMLS# ${lo.nmls}` : null].filter(Boolean).join(' · ')}
                            </div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.7 }}>
                        {lo.phone && <div>{lo.phone}</div>}
                        {lo.email && <div>{lo.email}</div>}
                        {lo.website && <div>{lo.website}</div>}
                    </div>
                </div>

                {/* ── Property Hero ─────────────────────────────────── */}
                <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    {streetViewUrl && (
                        <div style={{ position: 'relative', width: '100%', height: 220, background: '#e2e8f0' }}>
                            <img
                                src={streetViewUrl}
                                alt="Property"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        </div>
                    )}
                    <div style={{ padding: '18px 24px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00b459', marginBottom: 4 }}>
                            Home Intelligence Report
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#0f172a', marginBottom: 2 }}>
                            {borrower.property_address ?? 'Property Address Not Set'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Prepared for {borrower.name} · {today}</div>

                        {/* Value strip */}
                        {val && (
                            <div style={{ display: 'flex', gap: 24, marginTop: 18, flexWrap: 'wrap' }}>
                                {[
                                    { label: 'Est. Value', value: fmtDollar(val), highlight: true },
                                    { label: 'Equity', value: equity != null ? `${fmtDollar(equity)} (${equityPct}%)` : null },
                                    { label: 'Gain Since Purchase', value: appPct != null ? `+${appPct}%` : null },
                                    { label: 'Loan Balance', value: fmtDollar(balance), sub: analysis?.balanceIsEstimated ? 'est.' : undefined },
                                    { label: 'Current Rate', value: currentRate ? `${currentRate}%` : null, sub: analysis?.rateIsEstimated ? 'est.' : undefined },
                                ].filter(x => x.value).map(x => (
                                    <div key={x.label}>
                                        <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{x.label}</div>
                                        <div style={{ fontWeight: 800, fontSize: x.highlight ? '1.3rem' : '1rem', color: '#0f172a', lineHeight: 1.2 }}>
                                            {x.value}
                                            {x.sub && <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>{x.sub}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Two columns: Appreciation + Rate Sensitivity ──── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

                    {/* Appreciation */}
                    {projections.length > 0 && (
                        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginBottom: 4 }}>5-Year Value Projection</div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 16 }}>Based on 4.2% avg annual appreciation</div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
                                {projections.map(p => (
                                    <div key={p.yr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        <div style={{ width: '100%', background: p.yr === 0 ? '#e2e8f0' : '#00e87a', borderRadius: 4, height: `${Math.round((p.val / maxProj) * 80) + 8}px` }} />
                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Yr {p.yr}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Today</div>
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>{fmtDollar(projections[0]?.val)}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Year 5</div>
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#00b459' }}>{fmtDollar(projections[5]?.val)}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Rate Sensitivity */}
                    {balance && val && (
                        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginBottom: 4 }}>Rate Sensitivity</div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 12 }}>Monthly PITI at different rates</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...cellHdr, textAlign: 'left' }}>Rate</th>
                                        <th style={{ ...cellHdr, textAlign: 'right' }}>PITI / mo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {RATES.map(r => {
                                        const p = pitiCalc(balance, r, annualTaxEst ?? 0, sqft);
                                        const isCurrent = currentRate != null && Math.abs(r - currentRate) < 0.26;
                                        return (
                                            <tr key={r} style={{ background: isCurrent ? '#f0fdf4' : undefined }}>
                                                <td style={{ ...cell, fontWeight: isCurrent ? 700 : 400 }}>
                                                    {r}% {isCurrent && <span style={{ fontSize: '0.65rem', color: '#00b459', marginLeft: 4 }}>current</span>}
                                                </td>
                                                <td style={{ ...cell, textAlign: 'right', fontWeight: isCurrent ? 700 : 400 }}>${p.toLocaleString()}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Equity Snapshot ───────────────────────────────── */}
                {equity != null && balance != null && val != null && (
                    <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginBottom: 16 }}>Equity Snapshot</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            {[
                                { label: 'Home Value', value: fmtDollar(val), color: '#0f172a' },
                                { label: 'Loan Balance', value: fmtDollar(balance), color: '#64748b' },
                                { label: 'Your Equity', value: `${fmtDollar(equity)} (${equityPct}%)`, color: '#00b459' },
                            ].map(x => (
                                <div key={x.label} style={{ textAlign: 'center', padding: '14px 8px', background: '#f8fafc', borderRadius: 10 }}>
                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{x.label}</div>
                                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: x.color }}>{x.value}</div>
                                </div>
                            ))}
                        </div>
                        {/* LTV bar */}
                        {analysis?.ltv != null && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>
                                    <span>Loan-to-Value: {analysis.ltv}%</span>
                                    <span>Equity: {100 - analysis.ltv}%</span>
                                </div>
                                <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${analysis.ltv}%`, background: '#cbd5e1', borderRadius: 999 }} />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── LO Contact Footer ─────────────────────────────── */}
                <div style={{ background: '#0f172a', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {lo.photo && (
                            <img src={lo.photo} alt={lo.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.15)' }} />
                        )}
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f1f5f9' }}>{lo.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(185,208,192,0.7)' }}>
                                {[lo.nmls ? `NMLS# ${lo.nmls}` : null, lo.lender].filter(Boolean).join(' · ')}
                            </div>
                            {lo.office_address && <div style={{ fontSize: '0.72rem', color: 'rgba(185,208,192,0.5)', marginTop: 2 }}>{lo.office_address}</div>}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'rgba(185,208,192,0.7)', lineHeight: 1.8 }}>
                        {lo.phone && <div>{lo.phone}</div>}
                        {lo.email && <div>{lo.email}</div>}
                        {lo.website && <div style={{ color: '#00e87a' }}>{lo.website}</div>}
                    </div>
                </div>

                {/* ── Disclaimer ────────────────────────────────────── */}
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.7, padding: '0 4px' }}>
                    <strong>Current as of {today}.</strong> This report is provided for informational and educational purposes only and does not constitute a loan commitment, guarantee, or offer to lend.
                    Rates and terms are subject to change without notice. Estimated values, equity, and projections are based on third-party data sources and automated valuation models;
                    actual values may differ. This document should not be construed as investment or mortgage advice. For actual and current terms and rate information, please contact your loan officer directly.
                    Monthly payment estimates may not include HOA fees or other costs. Appreciation projections are based on historical averages and are not guaranteed.
                    {lo.nmls && <> {lo.name}{lo.lender ? `, ${lo.lender}` : ''}, NMLS# {lo.nmls}.</>}
                    {lo.company_nmls && <> Company NMLS# {lo.company_nmls}.</>}{' '}
                    Sources: Rentcast AVM, FRED, US Census, BLS, NAR. Powered by HomeRates technology platform.
                </div>
            </div>
        </div>
    );
}
