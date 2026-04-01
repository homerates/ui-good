'use client';
// app/components/LenderChecklistCard.tsx
// "Ready to talk to a lender?" — personalized checklist of questions
// to ask any lender, based on the borrower's specific scenario.

import { useState } from 'react';
import PdfDownloadButton from './PdfDownloadButton';

export interface LenderChecklistData {
    loanType: 'conventional' | 'fha' | 'va' | 'jumbo' | 'dscr';
    price:       number;
    loanAmount:  number;
    ltv:         number;   // decimal e.g. 0.80
    marketRate:  number;   // FRED live rate used in calc
    monthlyPITI: number;
    termYears:   number;
    isInvestment: boolean;
    rent?:       number;   // monthly rent — DSCR only, needed for PDF
    vacancyRate?: number;
    taxRate?:    number;
    insRate?:    number;
}

function fmt$(n: number) { return `$${Math.round(n).toLocaleString()}`; }
function fmtPct(n: number) { return `${n.toFixed(2)}%`; }

function getPricingFactors(d: LenderChecklistData): string[] {
    const factors: string[] = [];
    if (d.loanType === 'va') {
        factors.push('VA loans have no LLPAs and no PMI — only a one-time VA Funding Fee (waived if service-connected disability).');
        factors.push('Ask your lender if they hold VA loans in-house or sell to GNMA — impacts turn times and lock flexibility.');
    } else if (d.loanType === 'fha') {
        factors.push('FHA has no LLPAs, but monthly MIP (0.55%/yr) runs the life of the loan if you put less than 10% down — no automatic cancellation.');
        factors.push('At ≥10% down, MIP cancels at year 11. Ask your lender to run the FHA vs conventional PMI comparison for your credit score tier.');
    } else if (d.loanType === 'jumbo') {
        factors.push('Jumbo loans are non-conforming — GSE pricing doesn\'t apply. Each lender sets their own rate, spread, and fee structure independently.');
        factors.push('Ask if the lender holds the loan in portfolio or sells it. Portfolio lenders often have more flexibility on rate and underwriting.');
    } else if (d.isInvestment || d.loanType === 'dscr') {
        factors.push('Investment property LLPA: +1.25–3.75% added to your rate vs an equivalent primary residence loan — this is baked into every non-QM/DSCR quote.');
        factors.push('No-income DSCR loans trade higher rate for flexibility. If you can document income, a conventional investment loan often prices better.');
        if (d.ltv > 0.75) factors.push(`LTV ${Math.round(d.ltv * 100)}% on an investment property: most DSCR lenders cap at 75–80% — confirm max LTV for your property type.`);
    } else {
        // Conventional
        if (d.ltv > 0.80) {
            factors.push(`LTV ${Math.round(d.ltv * 100)}%: PMI is required AND a Fannie/Freddie LLPA surcharge applies. Reaching 20% down eliminates both.`);
        } else if (d.ltv > 0.75) {
            factors.push(`LTV ${Math.round(d.ltv * 100)}%: In the LLPA pricing tier — 20% down (LTV 80%) removes the surcharge and improves pricing slightly.`);
        } else if (d.ltv <= 0.60) {
            factors.push(`LTV ${Math.round(d.ltv * 100)}%: Best pricing tier — you're below the 60% LTV threshold where LLPAs are minimal.`);
        } else {
            factors.push(`LTV ${Math.round(d.ltv * 100)}%: Clean pricing tier with no PMI. Your credit score is the primary remaining pricing lever.`);
        }
        factors.push('Credit score matters: a 740+ score gets the best conventional pricing. 720–739 adds ~0.125–0.25%. Ask what tier your score puts you in.');
    }
    return factors;
}

const ITEMS = [
    {
        num: '1',
        icon: '🔍',
        title: 'Shop 2–3 lenders — all in the same 14-day window',
        body: (d: LenderChecklistData) =>
            `Multiple mortgage credit inquiries within 14 days count as a single pull under FICO scoring rules. Today's FRED 30yr benchmark: ${fmtPct(d.marketRate)}. A quote more than 0.25% above that is negotiable — always ask for the lender's best rate before deciding.`,
    },
    {
        num: '2',
        icon: '📊',
        title: 'Ask for the APR, not just the note rate',
        body: (d: LenderChecklistData) => {
            const cleanAPRMax = parseFloat((d.marketRate + 0.25).toFixed(2));
            const highFeeAPR  = parseFloat((d.marketRate + 0.50).toFixed(2));
            return `On a ${fmt$(d.loanAmount)} loan, APR should be no more than 0.25% above the note rate for a clean deal (e.g. rate ${fmtPct(d.marketRate)} → APR ≤ ${fmtPct(cleanAPRMax)}). APR at ${fmtPct(highFeeAPR)} or higher means high origination charges — ask the lender to itemize Section A of the Loan Estimate.`;
        },
    },
    {
        num: '3',
        icon: '⚡',
        title: 'Understand pricing adjustments for your scenario (LLPAs)',
        body: (d: LenderChecklistData) => getPricingFactors(d).join(' '),
    },
    {
        num: '4',
        icon: '⏱️',
        title: 'Pin down turn time, rate lock, and float-down policy',
        body: () =>
            `Ask every lender: (1) How many days to close? Typical purchase: 30–45 days. (2) What does a 60-day lock cost vs 30-day? (3) Is there a float-down option — if rates drop 0.25%+ before closing, can you reprice? (4) What's the daily cost of a lock extension if closing slips?`,
    },
    {
        num: '5',
        icon: '📄',
        title: 'Request a Loan Estimate — you\'re entitled to one within 3 business days',
        body: (d: LenderChecklistData) =>
            `Federal law (RESPA) requires lenders to issue a Loan Estimate within 3 business days of your application — no cost, no commitment. Compare Section A (origination fee — the lender controls this) across all 3 quotes. Section B fees (appraisal, title) are similar everywhere. Nothing in Section A/B should increase by more than 10% from LE to Closing Disclosure.`,
    },
];

export default function LenderChecklistCard({ data }: { data: LenderChecklistData }) {
    const [open, setOpen] = useState(false);

    const loanLabel =
        data.loanType === 'fha'  ? 'FHA loan' :
        data.loanType === 'va'   ? 'VA loan' :
        data.loanType === 'jumbo' ? 'Jumbo loan' :
        data.loanType === 'dscr' ? 'DSCR / investment loan' :
        'Conventional loan';

    return (
        <div style={{
            marginTop: 12,
            background: '#0e1420',
            border: '1px solid rgba(148,163,184,0.12)',
            borderRadius: 12,
            overflow: 'hidden',
            fontFamily: 'inherit',
        }}>
            {/* Header — always visible */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: 12,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🏦</span>
                    <div>
                        <div style={{ color: '#f0f4ff', fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
                            Ready to talk to a lender?
                        </div>
                        <div style={{ color: 'rgba(160,192,168,0.7)', fontSize: 12, marginTop: 2 }}>
                            5 questions to ask about your {loanLabel} — {fmt$(data.loanAmount)} at {fmtPct(data.marketRate)}
                        </div>
                    </div>
                </div>
                <span style={{ color: 'rgba(160,192,168,0.5)', fontSize: 12, flexShrink: 0 }}>
                    {open ? '▲ Hide' : '▼ Show checklist'}
                </span>
            </button>

            {/* Expandable checklist */}
            {open && (
                <div style={{ borderTop: '1px solid rgba(148,163,184,0.1)', padding: '4px 0 12px' }}>
                    {ITEMS.map((item, i) => (
                        <div key={i} style={{
                            display: 'flex',
                            gap: 14,
                            padding: '12px 18px',
                            borderBottom: i < ITEMS.length - 1 ? '1px solid rgba(148,163,184,0.07)' : 'none',
                        }}>
                            {/* Number badge */}
                            <div style={{
                                flexShrink: 0,
                                width: 26,
                                height: 26,
                                borderRadius: '50%',
                                background: 'rgba(0,232,122,0.12)',
                                border: '1px solid rgba(0,232,122,0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#00e87a',
                                marginTop: 1,
                            }}>
                                {item.num}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <span style={{ fontSize: 14 }}>{item.icon}</span>
                                    <span style={{ color: '#f0f4ff', fontWeight: 600, fontSize: 13 }}>
                                        {item.title}
                                    </span>
                                </div>
                                <p style={{
                                    margin: 0,
                                    color: 'rgba(160,192,168,0.85)',
                                    fontSize: 12.5,
                                    lineHeight: 1.6,
                                }}>
                                    {item.body(data)}
                                </p>
                            </div>
                        </div>
                    ))}

                    {/* Footer note */}
                    <div style={{
                        margin: '8px 18px 0',
                        padding: '10px 14px',
                        background: 'rgba(148,163,184,0.06)',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                    }}>
                        <span style={{ color: 'rgba(160,192,168,0.55)', fontSize: 11.5, lineHeight: 1.5 }}>
                            💡 Save this analysis as a PDF and share it with your lender.
                        </span>
                        {data.loanType === 'dscr' && data.rent ? (
                            <PdfDownloadButton
                                type="dscr"
                                getParams={() => ({
                                    price: data.price,
                                    rent: data.rent,
                                    downPct: Math.round((1 - data.ltv) * 100),
                                    rate: data.marketRate,
                                    vacancyRate: data.vacancyRate ?? 0.05,
                                    taxRate: data.taxRate ?? 0.011,
                                    insRate: data.insRate ?? 0.005,
                                })}
                            />
                        ) : data.loanType !== 'dscr' ? (
                            <PdfDownloadButton
                                type={data.loanType === 'va' || data.loanType === 'jumbo' ? 'conventional' : data.loanType}
                                getParams={() => ({
                                    price: data.price,
                                    downPct: Math.round((1 - data.ltv) * 100),
                                    rate: data.marketRate,
                                    term: data.termYears,
                                    taxRate: data.taxRate ?? 0.011,
                                    insRate: data.insRate ?? 0.003,
                                    loanType: data.loanType === 'fha' ? 'fha' : 'conventional',
                                })}
                            />
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
