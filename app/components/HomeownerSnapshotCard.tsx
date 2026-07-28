'use client';

// app/components/HomeownerSnapshotCard.tsx
// Homeowner equity + refi snapshot card — matches dark design system

import React, { useMemo } from 'react';

export interface HomeownerSnapshotParams {
    address: string;
    estimatedValue: number | null;
    estimatedValueLow: number | null;
    estimatedValueHigh: number | null;
    estimatedBalance: number | null;
    estimatedEquity: number | null;
    purchaseRate: number | null;
    lastSalePrice: number | null;
    lastSaleDate: string | null;
    liveRate: number;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    onRunScenario?: (seed: string) => void;
}

function fmt$(n: number | null, opts?: { compact?: boolean }): string {
    if (n == null) return 'N/A';
    const abs = Math.abs(n);
    if (opts?.compact) {
        if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
        if (abs >= 1_000)     return `$${Math.round(abs / 1_000)}k`;
    }
    return `$${Math.round(abs).toLocaleString()}`;
}

function fmtRate(r: number | null): string {
    if (r == null) return 'N/A';
    return `${r.toFixed(2)}%`;
}

function calcPI(principal: number, ratePct: number, termMonths = 360): number {
    if (!principal || !ratePct) return 0;
    const r = ratePct / 100 / 12;
    return principal * r * Math.pow(1 + r, termMonths) / (Math.pow(1 + r, termMonths) - 1);
}

function equityColor(equityPct: number): { text: string; bg: string; border: string } {
    if (equityPct >= 40) return { text: '#059669', bg: 'rgba(5,150,105,0.1)',  border: 'rgba(5,150,105,0.3)' };
    if (equityPct >= 20) return { text: '#0ea5e9', bg: 'rgba(14,165,233,0.1)', border: 'rgba(14,165,233,0.3)' };
    if (equityPct >= 10) return { text: '#d97706', bg: 'rgba(217,119,6,0.1)',  border: 'rgba(217,119,6,0.3)' };
    return                      { text: '#dc2626', bg: 'rgba(220,38,38,0.1)',   border: 'rgba(220,38,38,0.3)' };
}

export default function HomeownerSnapshotCard(props: HomeownerSnapshotParams) {
    const {
        address, estimatedValue, estimatedValueLow, estimatedValueHigh,
        estimatedBalance, estimatedEquity, purchaseRate, lastSalePrice,
        lastSaleDate, liveRate, beds, baths, sqft, onRunScenario,
    } = props;

    const equityPct = (estimatedValue && estimatedEquity)
        ? Math.round((estimatedEquity / estimatedValue) * 100) : null;
    const ltv = (estimatedValue && estimatedBalance)
        ? Math.round((estimatedBalance / estimatedValue) * 100) : null;
    const eqColor = equityColor(equityPct ?? 0);

    const refiScenarios = useMemo(() => {
        if (!estimatedBalance) return null;
        const curPI   = purchaseRate ? Math.round(calcPI(estimatedBalance, purchaseRate)) : null;
        const newPI   = Math.round(calcPI(estimatedBalance, liveRate));
        const cashOut = estimatedValue ? Math.round(estimatedValue * 0.80) : null;
        const cashOutPI = cashOut ? Math.round(calcPI(cashOut, liveRate)) : null;
        const delta = curPI ? newPI - curPI : null;
        const deltaPct = curPI && delta ? Math.round((delta / curPI) * 100) : null;
        return { curPI, newPI, cashOut, cashOutPI, delta, deltaPct };
    }, [estimatedBalance, purchaseRate, liveRate, estimatedValue]);

    const refiVerdict = (() => {
        if (!purchaseRate) return null;
        const gap = liveRate - purchaseRate;
        if (gap <= -0.5) return { label: 'Worth exploring', color: '#059669', bg: 'rgba(5,150,105,0.1)', border: 'rgba(5,150,105,0.3)' };
        if (gap <= 0.5)  return { label: 'Marginal benefit', color: '#d97706', bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.3)' };
        return                  { label: 'Hold — rate would increase', color: '#dc2626', bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.3)' };
    })();

    const shortAddr = address.split(',')[0];

    const cs: Record<string, React.CSSProperties> = {
        card: {
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 16,
            padding: '1.25rem 1.5rem',
            fontFamily: '"Inter", system-ui, sans-serif',
            color: '#f0f0f0',
            marginTop: 8,
        },
        header: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap' as const, gap: 8, marginBottom: '1rem',
        },
        addressLine: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: 2 },
        valueLine: { fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' },
        rangeTag: { fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 },
        badge: {
            fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.65rem',
            borderRadius: 20, border: `1px solid ${eqColor.border}`,
            background: eqColor.bg, color: eqColor.text,
        },
        grid: {
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: '1rem',
        },
        stat: {
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '0.75rem 0.9rem',
        },
        statLabel: { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 4 },
        statValue: { fontSize: '1.05rem', fontWeight: 700, color: '#fff' },
        statSub: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 },
        divider: { borderTop: '1px solid rgba(255,255,255,0.07)', margin: '1rem 0' },
        sectionLabel: { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: '0.75rem' },
        table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.82rem' },
        th: { textAlign: 'left' as const, padding: '0.35rem 0.5rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontSize: '0.72rem', borderBottom: '1px solid rgba(255,255,255,0.08)' },
        td: { padding: '0.45rem 0.5rem', color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
        tdRight: { padding: '0.45rem 0.5rem', textAlign: 'right' as const, color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
        verdictBox: {
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '0.65rem 1rem', borderRadius: 10, marginTop: '0.75rem',
            background: refiVerdict?.bg ?? 'rgba(255,255,255,0.04)',
            border: `1px solid ${refiVerdict?.border ?? 'rgba(255,255,255,0.08)'}`,
        },
        verdictLabel: { fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: refiVerdict?.color ?? 'rgba(255,255,255,0.5)' },
        verdictText: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' },
        btnRow: { display: 'flex', gap: 8, marginTop: '1rem', flexWrap: 'wrap' as const },
        btn: {
            flex: 1, minWidth: 120, padding: '0.6rem 1rem', borderRadius: 10,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem', fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
        },
        btnPrimary: {
            flex: 1, minWidth: 120, padding: '0.6rem 1rem', borderRadius: 10,
            background: '#22c55e', border: 'none',
            color: '#000', fontSize: '0.82rem', fontWeight: 700,
            cursor: 'pointer', transition: 'opacity 0.15s',
        },
        sourceTag: { fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)', marginTop: '0.75rem', textAlign: 'right' as const },
    };

    return (
        <div style={cs.card}>
            {/* Header */}
            <div style={cs.header}>
                <div>
                    <div style={cs.addressLine}>{address}</div>
                    <div style={cs.valueLine}>{fmt$(estimatedValue)}</div>
                    {(estimatedValueLow && estimatedValueHigh) && (
                        <div style={cs.rangeTag}>
                            Range: {fmt$(estimatedValueLow, { compact: true })} – {fmt$(estimatedValueHigh, { compact: true })}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    {equityPct != null && (
                        <span style={cs.badge}>{equityPct}% equity</span>
                    )}
                    {(beds || baths || sqft) && (
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                            {[beds && `${beds} bd`, baths && `${baths} ba`, sqft && `${sqft.toLocaleString()} sqft`].filter(Boolean).join(' · ')}
                        </span>
                    )}
                </div>
            </div>

            {/* Stat grid */}
            <div style={cs.grid}>
                <div style={cs.stat}>
                    <div style={cs.statLabel}>Est. Equity</div>
                    <div style={{ ...cs.statValue, color: eqColor.text }}>{fmt$(estimatedEquity, { compact: true })}</div>
                    <div style={cs.statSub}>LTV {ltv ?? '?'}%</div>
                </div>
                <div style={cs.stat}>
                    <div style={cs.statLabel}>Remaining Bal.</div>
                    <div style={cs.statValue}>{fmt$(estimatedBalance, { compact: true })}</div>
                    <div style={cs.statSub}>Est. ~20% down</div>
                </div>
                <div style={cs.stat}>
                    <div style={cs.statLabel}>Last Sale</div>
                    <div style={cs.statValue}>{fmt$(lastSalePrice, { compact: true })}</div>
                    <div style={cs.statSub}>{lastSaleDate ?? '—'}</div>
                </div>
            </div>

            {/* Refi scenario table */}
            {refiScenarios && (
                <>
                    <div style={cs.divider} />
                    <div style={cs.sectionLabel}>Refi Scenarios · {fmtRate(liveRate)} today (FRED)</div>
                    <table style={cs.table}>
                        <thead>
                            <tr>
                                <th style={cs.th}>Scenario</th>
                                <th style={{ ...cs.th, textAlign: 'right' }}>Rate</th>
                                <th style={{ ...cs.th, textAlign: 'right' }}>Mo. P&I</th>
                                <th style={{ ...cs.th, textAlign: 'right' }}>vs. Current</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={cs.td}>Current (est.)</td>
                                <td style={cs.tdRight}>{fmtRate(purchaseRate)}</td>
                                <td style={cs.tdRight}>{refiScenarios.curPI ? fmt$(refiScenarios.curPI) : '—'}</td>
                                <td style={cs.tdRight}>Baseline</td>
                            </tr>
                            <tr>
                                <td style={cs.td}>Rate-term refi</td>
                                <td style={cs.tdRight}>{fmtRate(liveRate)}</td>
                                <td style={cs.tdRight}>{fmt$(refiScenarios.newPI)}</td>
                                <td style={{ ...cs.tdRight, color: refiScenarios.delta && refiScenarios.delta > 0 ? '#ef4444' : '#22c55e' }}>
                                    {refiScenarios.delta != null ? `+${fmt$(refiScenarios.delta)}/mo` : '—'}
                                    {refiScenarios.deltaPct != null ? ` (+${refiScenarios.deltaPct}%)` : ''}
                                </td>
                            </tr>
                            {refiScenarios.cashOutPI && refiScenarios.cashOut && (
                                <tr>
                                    <td style={cs.td}>Cash-out (80% LTV)</td>
                                    <td style={cs.tdRight}>{fmtRate(liveRate)}</td>
                                    <td style={cs.tdRight}>{fmt$(refiScenarios.cashOutPI)}</td>
                                    <td style={{ ...cs.tdRight, color: '#ef4444' }}>
                                        {refiScenarios.curPI ? `+${fmt$(refiScenarios.cashOutPI - refiScenarios.curPI)}/mo` : '—'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Verdict */}
                    {refiVerdict && (
                        <div style={cs.verdictBox}>
                            <span style={cs.verdictLabel}>{refiVerdict.label}</span>
                            <span style={cs.verdictText}>
                                {purchaseRate && liveRate > purchaseRate
                                    ? `Your current rate (${fmtRate(purchaseRate)}) is ${(liveRate - purchaseRate).toFixed(2)}% below today's market — hold unless you need cash.`
                                    : `Today's rate is ${Math.abs(liveRate - (purchaseRate ?? liveRate)).toFixed(2)}% below your current rate — breakeven worth calculating.`}
                            </span>
                        </div>
                    )}
                </>
            )}

            {/* Action buttons */}
            {onRunScenario && (
                <div style={cs.btnRow}>
                    <button
                        style={cs.btn}
                        onClick={() => onRunScenario(`What is my breakeven if I cash-out refinanced my home at ${address} from ${fmtRate(purchaseRate)} to ${fmtRate(liveRate)}? Balance ~${fmt$(estimatedBalance)}, property value ~${fmt$(estimatedValue)}.`)}
                    >
                        Run refi breakeven →
                    </button>
                    <button
                        style={cs.btnPrimary}
                        onClick={() => onRunScenario(`How can I build more equity faster at ${shortAddr}? My current value is ${fmt$(estimatedValue)}, equity ~${fmt$(estimatedEquity, { compact: true })}.`)}
                    >
                        Grow equity faster →
                    </button>
                </div>
            )}

            <div style={cs.sourceTag}>Values: Redfin AVM · Rate: FRED {liveRate}% 30Y fixed · Balance estimated (20% down assumed)</div>
        </div>
    );
}
