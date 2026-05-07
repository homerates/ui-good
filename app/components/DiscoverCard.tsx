'use client';
// app/components/DiscoverCard.tsx
// HomeRates Discover Card — mortgage prompt coach.
// Renders questions to ask before sharing contact info with a lender.

import { useState } from 'react';
import type { DiscoverCard as DiscoverCardData, DiscoverItem } from '@/lib/discoverCard';

function fmt$(n: number) { return '$' + Math.round(n).toLocaleString(); }
function fmtPct(n: number) { return n.toFixed(2) + '%'; }

const SCORE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    'Ready to compare':         { bg: 'rgba(0,232,122,0.10)', border: 'rgba(0,232,122,0.30)', text: '#00e87a' },
    'Needs clarification':      { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.30)', text: '#fbbf24' },
    'Get another estimate first': { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)', text: '#f87171' },
};

function ItemRow({ item, index, total }: { item: DiscoverItem; index: number; total: number }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{
            borderBottom: index < total - 1 ? '1px solid rgba(148,163,184,0.07)' : 'none',
        }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start',
                    gap: 12, padding: '12px 18px',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
            >
                <div style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                    background: 'rgba(0,232,122,0.10)', border: '1px solid rgba(0,232,122,0.20)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#00e87a', marginTop: 1,
                }}>
                    {index + 1}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ color: '#f0f4ff', fontWeight: 600, fontSize: 13, lineHeight: 1.3, marginBottom: 3 }}>
                        {item.title}
                    </div>
                    <div style={{ color: 'rgba(185,208,192,0.75)', fontSize: 12, lineHeight: 1.5 }}>
                        {item.question}
                    </div>
                </div>
                <span style={{ color: 'rgba(185,208,192,0.4)', fontSize: 11, flexShrink: 0, marginTop: 2 }}>
                    {open ? '▲' : '▼'}
                </span>
            </button>

            {open && (
                <div style={{ padding: '0 18px 14px 54px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <DetailRow label="Why it matters" text={item.whyItMatters} color="rgba(185,208,192,0.85)" />
                    <DetailRow label="Likely answer" text={item.likelyAnswer} color="rgba(185,208,192,0.75)" />
                    <DetailRow label="Gap to watch" text={item.gapToWatch} color="#fbbf24" />
                    <div style={{
                        marginTop: 4,
                        background: 'rgba(0,232,122,0.07)',
                        border: '1px solid rgba(0,232,122,0.18)',
                        borderRadius: 7, padding: '8px 12px',
                    }}>
                        <span style={{ color: '#00e87a', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Ask this:&nbsp;
                        </span>
                        <span style={{ color: '#c8dfc8', fontSize: 12, lineHeight: 1.5 }}>
                            "{item.followUpPrompt}"
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function DetailRow({ label, text, color }: { label: string; text: string; color: string }) {
    return (
        <div>
            <span style={{ color: 'rgba(185,208,192,0.45)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}&nbsp;
            </span>
            <span style={{ color, fontSize: 12.5, lineHeight: 1.6 }}>{text}</span>
        </div>
    );
}

export default function DiscoverCard({ data }: { data: DiscoverCardData }) {
    const [open, setOpen] = useState(false);
    const score = data.contactReadinessScore;
    const scoreStyle = score ? SCORE_COLORS[score] : undefined;
    const s = data.scenarioSummary;

    return (
        <div style={{
            marginTop: 12,
            background: '#0a0f1a',
            border: '1px solid rgba(148,163,184,0.14)',
            borderRadius: 12,
            overflow: 'hidden',
            fontFamily: 'inherit',
        }}>
            {/* Header */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left', gap: 12,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🔍</span>
                    <div>
                        <div style={{ color: '#f0f4ff', fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>
                            {data.title}
                        </div>
                        <div style={{ color: 'rgba(185,208,192,0.6)', fontSize: 11.5, marginTop: 2 }}>
                            {data.subtitle}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {score && scoreStyle && (
                        <span style={{
                            fontSize: 10.5, fontWeight: 600, padding: '3px 8px',
                            borderRadius: 20, background: scoreStyle.bg,
                            border: `1px solid ${scoreStyle.border}`, color: scoreStyle.text,
                            whiteSpace: 'nowrap',
                        }}>
                            {score}
                        </span>
                    )}
                    <span style={{ color: 'rgba(185,208,192,0.4)', fontSize: 11 }}>
                        {open ? '▲' : '▼'}
                    </span>
                </div>
            </button>

            {/* Scenario summary row */}
            {s && (
                <div style={{
                    borderTop: '1px solid rgba(148,163,184,0.08)',
                    padding: '10px 18px',
                    display: 'flex', flexWrap: 'wrap', gap: '6px 20px',
                    background: 'rgba(255,255,255,0.02)',
                }}>
                    {s.purchasePrice   && <SummaryChip label="Price"    value={fmt$(s.purchasePrice)} />}
                    {s.loanAmount      && <SummaryChip label="Loan"     value={fmt$(s.loanAmount)} />}
                    {s.downPaymentPercent && <SummaryChip label="Down"  value={fmtPct(s.downPaymentPercent)} />}
                    {s.loanType        && <SummaryChip label="Type"     value={s.loanType.toUpperCase()} />}
                    {s.estimatedClosingCosts && (
                        <SummaryChip
                            label="Closing costs"
                            value={`${fmt$(s.estimatedClosingCosts)}${s.estimatedClosingCostPercent ? ` (${s.estimatedClosingCostPercent.toFixed(1)}%)` : ''}`}
                        />
                    )}
                    {s.estimatedCashToClose && <SummaryChip label="Cash to close" value={fmt$(s.estimatedCashToClose)} />}
                    {s.sellerCredit    && <SummaryChip label="Seller credit" value={fmt$(s.sellerCredit)} />}
                    {s.points != null  && <SummaryChip label="Points"   value={String(s.points)} />}
                    {s.lenderCredit    && <SummaryChip label="Lender credit" value={fmt$(s.lenderCredit)} />}
                </div>
            )}

            {/* Discovery items */}
            {open && (
                <div style={{ borderTop: '1px solid rgba(148,163,184,0.10)' }}>
                    {data.items.map((item, i) => (
                        <ItemRow key={item.id} item={item} index={i} total={data.items.length} />
                    ))}
                </div>
            )}

            {/* Final CTA */}
            <div style={{
                borderTop: '1px solid rgba(148,163,184,0.10)',
                padding: '12px 18px',
                background: 'rgba(0,0,0,0.15)',
                display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>💡</span>
                <p style={{
                    margin: 0, fontSize: 12, lineHeight: 1.65,
                    color: 'rgba(185,208,192,0.75)', fontStyle: 'italic',
                }}>
                    {data.finalCta}
                </p>
            </div>
        </div>
    );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'rgba(185,208,192,0.45)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {label}
            </span>
            <span style={{ color: '#c8e6c9', fontSize: 12, fontWeight: 600 }}>
                {value}
            </span>
        </div>
    );
}
