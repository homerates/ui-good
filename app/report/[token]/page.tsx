'use client';

import React from 'react';
import { useParams } from 'next/navigation';

// ── helpers ────────────────────────────────────────────────────────────
const fmt  = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US') : '—';
const fmtK = (n: number | null | undefined) => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
    return `$${n}`;
};
const fmtFull = (n: number | null | undefined) => n != null ? `$${n.toLocaleString('en-US')}` : '—';

// ── types ──────────────────────────────────────────────────────────────
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
    refiMonthlySaving: number | null; helocMax: number | null;
};

const RATES = [5.5, 5.99, 6.5, 6.99, 7.5];

function pitiCalc(balance: number, rate: number, annualTax: number): number {
    const mo = rate / 100 / 12;
    const n  = 360;
    const pi = balance * (mo * Math.pow(1 + mo, n)) / (Math.pow(1 + mo, n) - 1);
    return Math.round(pi + annualTax / 12);
}

// ── Circular gauge (Tesla-style) ───────────────────────────────────────
function CircleGauge({ pct, label, sublabel, color = '#00e87a' }: {
    pct: number; label: string; sublabel?: string; color?: string;
}) {
    const r = 64;
    const circ = 2 * Math.PI * r;
    const filled = circ * Math.min(pct / 100, 1);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <svg width={160} height={160} viewBox="0 0 160 160">
                <circle cx={80} cy={80} r={r} fill="none" stroke="#f1f5f9" strokeWidth={10} />
                <circle
                    cx={80} cy={80} r={r} fill="none"
                    stroke={color} strokeWidth={10}
                    strokeDasharray={`${filled} ${circ}`}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                    style={{ transition: 'stroke-dasharray 1s ease' }}
                />
                <text x={80} y={74} textAnchor="middle" fill="#0f172a" fontSize={28} fontWeight={800} fontFamily="system-ui,sans-serif">{pct}%</text>
                <text x={80} y={96} textAnchor="middle" fill="#94a3b8" fontSize={11} fontFamily="system-ui,sans-serif">{label}</text>
            </svg>
            {sublabel && <div style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>{sublabel}</div>}
        </div>
    );
}

// ── Appreciation chart with labeled points ─────────────────────────────
function AppreciationChart({ projections }: { projections: { yr: number; val: number; gain: string }[] }) {
    const max = Math.max(...projections.map(p => p.val));
    const min = Math.min(...projections.map(p => p.val));
    const range = max - min || 1;
    const W = 560; const H = 140; const PAD = { l: 8, r: 8, t: 32, b: 24 };
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const pts = projections.map((p, i) => {
        const x = PAD.l + (i / (projections.length - 1)) * innerW;
        const y = PAD.t + innerH - ((p.val - min) / range) * innerH;
        return { x, y, ...p };
    });
    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaD = `${pathD} L${pts[pts.length - 1].x},${H - PAD.b} L${pts[0].x},${H - PAD.b} Z`;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', overflow: 'visible' }}>
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00e87a" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#00e87a" stopOpacity={0} />
                </linearGradient>
            </defs>
            {/* area fill */}
            <path d={areaD} fill="url(#areaGrad)" />
            {/* line */}
            <path d={pathD} fill="none" stroke="#00e87a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {/* points + labels */}
            {pts.map((p, i) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={i === 0 || i === pts.length - 1 ? 5 : 3.5}
                        fill={i === 0 ? '#94a3b8' : '#00e87a'} stroke="#fff" strokeWidth={1.5} />
                    {/* value label above */}
                    <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#0f172a" fontSize={10} fontWeight={700} fontFamily="system-ui,sans-serif">
                        {fmtK(p.val)}
                    </text>
                    {/* gain label */}
                    {i > 0 && (
                        <text x={p.x} y={p.y - 22} textAnchor="middle" fill="#00b459" fontSize={9} fontFamily="system-ui,sans-serif">
                            {p.gain}
                        </text>
                    )}
                    {/* year label below */}
                    <text x={p.x} y={H - PAD.b + 14} textAnchor="middle" fill="#94a3b8" fontSize={9} fontFamily="system-ui,sans-serif">
                        Yr {p.yr}
                    </text>
                </g>
            ))}
        </svg>
    );
}

// ── Main page ──────────────────────────────────────────────────────────
export default function ReportPage() {
    const params   = useParams();
    const token    = Array.isArray(params?.token) ? params.token[0] : (params?.token as string | undefined);
    const [lo, setLo]             = React.useState<LoData | null>(null);
    const [borrower, setBorrower] = React.useState<BorrowerData | null>(null);
    const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
    const [loading, setLoading]   = React.useState(true);
    const [err, setErr]           = React.useState<string | null>(null);

    // Override dark body background for this standalone page
    React.useEffect(() => {
        const prev = document.body.style.background;
        document.body.style.background = '#f1f5f9';
        document.body.style.backgroundColor = '#f1f5f9';
        return () => { document.body.style.background = prev; };
    }, []);

    React.useEffect(() => {
        if (!token) return;
        (async () => {
            const r = await fetch(`/api/report/${token}`);
            const d = await r.json();
            if (!d.ok) { setErr('Report not found or has expired.'); setLoading(false); return; }
            setLo(d.lo);
            setBorrower(d.borrower);
            // Fetch analysis via report_token path (no auth required)
            try {
                const ar = await fetch(`/api/homeowner/analysis?report_token=${token}`);
                const ad = await ar.json();
                if (ad.ok !== false && !ad.error) setAnalysis(ad);
            } catch {}
            setLoading(false);
        })();
    }, [token]);

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const streetViewUrl = borrower?.property_address && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        ? `https://maps.googleapis.com/maps/api/streetview?size=900x360&location=${encodeURIComponent(borrower.property_address)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
        : null;

    if (loading) return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#00e87a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading your report…</div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (err || !lo || !borrower) return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
            <div style={{ color: '#ef4444' }}>{err ?? 'Unable to load report.'}</div>
        </div>
    );

    const val        = analysis?.estimatedValue;
    const equity     = analysis?.estimatedEquity;
    const equityPct  = analysis?.equityPct ?? 0;
    const ltv        = analysis?.ltv ?? 0;
    const appPct     = analysis?.appreciationPct;
    const balance    = analysis?.estimatedBalance;
    const origPrice  = borrower.actual_purchase_price ?? analysis?.lastSalePrice;
    const liveRate   = borrower.actual_rate ?? analysis?.liveRate;
    const annualTax  = val ? Math.round(val * 0.0115) : 0;
    const piti       = analysis?.piti ?? (balance && liveRate ? pitiCalc(balance, liveRate, annualTax) : null);
    const valLow     = analysis?.estimatedValueLow;
    const valHigh    = analysis?.estimatedValueHigh;

    // 5-year projection
    const projections = val ? Array.from({ length: 6 }, (_, i) => {
        const v    = Math.round(val * Math.pow(1.042, i));
        const gain = i === 0 ? '' : `+${(((v - val) / val) * 100).toFixed(1)}%`;
        return { yr: i, val: v, gain };
    }) : [];

    const RATES_SHOW = balance ? RATES.map(r => ({
        rate: r,
        piti: pitiCalc(balance, r, annualTax),
        isCurrent: liveRate != null && Math.abs(r - liveRate) < 0.26,
    })) : [];

    // style tokens
    const card: React.CSSProperties = {
        background: '#fff', borderRadius: 20,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
    };
    const label: React.CSSProperties = {
        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4,
    };
    const bigNum: React.CSSProperties = {
        fontSize: '2rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1,
    };
    const medNum: React.CSSProperties = {
        fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1,
    };

    return (
        <div style={{ background: '#f1f5f9', minHeight: '100vh', fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif' }}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                * { box-sizing: border-box; }
                @media print { body { background: white; } }
            `}</style>

            <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px 72px' }}>

                {/* ── TOP BAR: LO identity ─────────────────────────── */}
                <div style={{ ...card, padding: '18px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {lo.photo && <img src={lo.photo} alt={lo.name} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f1f5f9' }} />}
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{lo.name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 1 }}>
                                {[lo.title, lo.lender].filter(Boolean).join(' · ')}
                            </div>
                            {lo.nmls && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>NMLS# {lo.nmls}</div>}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.8 }}>
                        {lo.phone && <div style={{ fontWeight: 600 }}>{lo.phone}</div>}
                        {lo.email && <div>{lo.email}</div>}
                        {lo.website && <div style={{ color: '#00b459' }}>{lo.website}</div>}
                    </div>
                </div>

                {/* ── HERO: property photo + address ───────────────── */}
                <div style={{ ...card, marginBottom: 16 }}>
                    {streetViewUrl ? (
                        <div style={{ position: 'relative', height: 260, background: '#e2e8f0' }}>
                            <img src={streetViewUrl} alt="Property" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,23,42,0.7) 0%, transparent 50%)' }} />
                            <div style={{ position: 'absolute', bottom: 20, left: 24 }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#00e87a', marginBottom: 4 }}>Home Intelligence Report</div>
                                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff', lineHeight: 1.3 }}>{borrower.property_address}</div>
                                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Prepared for {borrower.name} · {today}</div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '24px 24px 0' }}>
                            <div style={label}>Home Intelligence Report</div>
                            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#0f172a' }}>{borrower.property_address}</div>
                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>Prepared for {borrower.name} · {today}</div>
                        </div>
                    )}

                    {/* 4 hero stats below photo */}
                    {val && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '24px 24px', gap: 0 }}>
                            {[
                                { label: 'Est. Home Value', value: fmtFull(val), sub: valLow && valHigh ? `${fmtK(valLow)} – ${fmtK(valHigh)}` : undefined, green: true },
                                { label: 'Total Equity', value: equity != null ? fmtFull(equity) : '—', sub: equityPct ? `${equityPct}% of value` : undefined },
                                { label: 'Gain Since Purchase', value: appPct != null ? `+${appPct}%` : '—', sub: origPrice ? `from ${fmtK(origPrice)}` : undefined, green: appPct != null && appPct > 0 },
                                { label: 'Current Rate', value: liveRate ? `${liveRate}%` : '—', sub: analysis?.rateIsEstimated ? 'estimated' : 'on file' },
                            ].map((x, i) => (
                                <div key={i} style={{ padding: '0 16px 0 0', borderRight: i < 3 ? '1px solid #f1f5f9' : 'none', paddingLeft: i > 0 ? 16 : 0 }}>
                                    <div style={label}>{x.label}</div>
                                    <div style={{ ...bigNum, color: x.green ? '#00b459' : '#0f172a', fontSize: '1.55rem' }}>{x.value}</div>
                                    {x.sub && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 3 }}>{x.sub}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── ROW 2: Equity gauge + Rate sensitivity ────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginBottom: 16 }}>

                    {/* Equity gauge */}
                    {equityPct != null && balance != null && val != null && (
                        <div style={{ ...card, padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                            <div style={{ alignSelf: 'flex-start' }}>
                                <div style={label}>Equity Position</div>
                            </div>
                            <CircleGauge pct={equityPct} label="equity" sublabel={`${fmtFull(equity)} of ${fmtFull(val)}`} />
                            <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                {[
                                    { label: 'Loan Balance', value: fmtFull(balance), sub: analysis?.balanceIsEstimated ? 'est.' : 'on file' },
                                    { label: 'LTV Ratio', value: `${ltv}%`, sub: ltv < 80 ? '✓ under 80%' : undefined },
                                ].map((x, i) => (
                                    <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                                        <div style={label}>{x.label}</div>
                                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{x.value}</div>
                                        {x.sub && <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>{x.sub}</div>}
                                    </div>
                                ))}
                            </div>
                            {analysis?.helocMax && analysis.helocMax > 0 && (
                                <div style={{ width: '100%', background: '#f0fdf4', border: '1px solid rgba(0,180,89,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                                    <div style={label}>Available HELOC</div>
                                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#00b459' }}>{fmtFull(analysis.helocMax)}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>up to 85% LTV</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Rate sensitivity */}
                    {RATES_SHOW.length > 0 && (
                        <div style={{ ...card, padding: '28px 24px' }}>
                            <div style={label}>Rate Sensitivity</div>
                            <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 20 }}>
                                Monthly principal, interest &amp; taxes at each rate
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {RATES_SHOW.map((row, i) => {
                                    const isFirst = i === 0;
                                    const isLast  = i === RATES_SHOW.length - 1;
                                    return (
                                        <div key={row.rate} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '13px 14px',
                                            background: row.isCurrent ? '#f0fdf4' : '#fff',
                                            borderRadius: isFirst ? '10px 10px 0 0' : isLast ? '0 0 10px 10px' : 0,
                                            border: row.isCurrent ? '1px solid rgba(0,180,89,0.25)' : '1px solid #f1f5f9',
                                            marginTop: i > 0 ? -1 : 0,
                                            zIndex: row.isCurrent ? 1 : 0, position: 'relative',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: '50%',
                                                    background: row.isCurrent ? '#00e87a' : '#f1f5f9',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.72rem', fontWeight: 800,
                                                    color: row.isCurrent ? '#0f172a' : '#64748b',
                                                }}>
                                                    {row.rate}%
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: row.isCurrent ? 700 : 500, fontSize: '0.85rem', color: '#0f172a' }}>
                                                        {row.rate}% rate
                                                    </div>
                                                    {row.isCurrent && <div style={{ fontSize: '0.65rem', color: '#00b459', fontWeight: 600 }}>YOUR RATE</div>}
                                                </div>
                                            </div>
                                            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: row.isCurrent ? '#00b459' : '#0f172a' }}>
                                                ${row.piti.toLocaleString()}<span style={{ fontSize: '0.7rem', fontWeight: 400, color: '#94a3b8' }}>/mo</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── ROW 3: 5-year appreciation ───────────────────── */}
                {projections.length > 0 && (
                    <div style={{ ...card, padding: '28px 24px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <div style={label}>5-Year Value Projection</div>
                                <div style={{ fontWeight: 800, fontSize: '1.6rem', color: '#0f172a' }}>
                                    {fmtFull(projections[5]?.val)}
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#00b459', marginLeft: 10 }}>
                                        +{(((projections[5]?.val - projections[0]?.val) / projections[0]?.val) * 100).toFixed(1)}% over 5 years
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>Based on 4.2% avg annual appreciation · historical CA average</div>
                            </div>
                            <div style={{ background: '#f0fdf4', border: '1px solid rgba(0,180,89,0.2)', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
                                <div style={label}>Projected gain</div>
                                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#00b459' }}>
                                    +{fmtFull(projections[5]?.val - projections[0]?.val)}
                                </div>
                            </div>
                        </div>
                        <AppreciationChart projections={projections} />
                    </div>
                )}

                {/* ── ROW 4: Property details strip ────────────────── */}
                {(analysis?.beds || analysis?.baths || analysis?.sqft || analysis?.city) && (
                    <div style={{ ...card, padding: '20px 24px', marginBottom: 16 }}>
                        <div style={label}>Property Details</div>
                        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginTop: 8 }}>
                            {analysis.beds  && <div><span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>{analysis.beds}</span><span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 4 }}>beds</span></div>}
                            {analysis.baths && <div><span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>{analysis.baths}</span><span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 4 }}>baths</span></div>}
                            {analysis.sqft  && <div><span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>{fmt(analysis.sqft)}</span><span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 4 }}>sq ft</span></div>}
                            {analysis.city  && <div><span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>{analysis.city}{analysis.state ? `, ${analysis.state}` : ''}</span><span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 4 }}>location</span></div>}
                            {piti           && <div><span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>${piti.toLocaleString()}</span><span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 4 }}>/mo est. PITI</span></div>}
                        </div>
                    </div>
                )}

                {/* ── LO dark footer ───────────────────────────────── */}
                <div style={{ background: '#0f172a', borderRadius: 20, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {lo.photo && <img src={lo.photo} alt={lo.name} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }} />}
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f1f5f9' }}>{lo.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(185,208,192,0.6)', marginTop: 2 }}>
                                {[lo.lender, lo.nmls ? `NMLS# ${lo.nmls}` : null].filter(Boolean).join(' · ')}
                            </div>
                            {lo.office_address && <div style={{ fontSize: '0.7rem', color: 'rgba(185,208,192,0.4)', marginTop: 2 }}>{lo.office_address}</div>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {lo.phone && (
                            <a href={`tel:${lo.phone}`} style={{ padding: '8px 18px', borderRadius: 999, background: '#00e87a', color: '#0f172a', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>
                                {lo.phone}
                            </a>
                        )}
                        {lo.email && (
                            <a href={`mailto:${lo.email}`} style={{ padding: '8px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none' }}>
                                Email Me
                            </a>
                        )}
                    </div>
                </div>

                {/* ── Disclaimer ───────────────────────────────────── */}
                <div style={{ fontSize: '0.62rem', color: '#94a3b8', lineHeight: 1.8, padding: '0 4px' }}>
                    <strong>Current as of {today}.</strong> This report is provided for informational and educational purposes only and does not constitute a loan commitment, guarantee, or offer to lend.
                    Rates and terms are subject to change without notice. Estimated values, equity, and projections are based on third-party automated valuation models and historical averages; actual values may differ.
                    This document should not be construed as investment or mortgage advice. For actual terms and rate information, please contact your loan officer directly.
                    Monthly payment estimates may not include HOA fees, mortgage insurance, or other costs.
                    {lo.nmls && <> {lo.name}{lo.lender ? `, ${lo.lender}` : ''}, NMLS# {lo.nmls}.</>}
                    {lo.company_nmls && <> Company NMLS# {lo.company_nmls}.</>}{' '}
                    Sources: Rentcast AVM, FRED, US Census, NAR. Powered by HomeRates technology platform.
                </div>
            </div>
        </div>
    );
}
