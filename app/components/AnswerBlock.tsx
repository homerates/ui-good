'use client';

import * as React from 'react';

/**
 * Minimal types for the legacy / calc answer layout.
 * This does NOT have to match the page.tsx type name exactly — it's structurally compatible.
 */

type CalcAnswer = {
    loanAmount: number;
    monthlyPI: number;
    sensitivities?: Array<{ rate: number; pi: number }>;
    monthlyTax?: number;
    monthlyIns?: number;
    monthlyHOA?: number;
    monthlyMI?: number;
    monthlyTotalPITI?: number;
};

type FredMeta = {
    tenYearYield: number | null;
    mort30Avg: number | null;
    spread: number | null;
    asOf?: string | null;
};

type AnswerMeta = {
    path?: 'concept' | 'market' | 'dynamic' | 'error' | 'calc' | string;
    usedFRED?: boolean;
    message?: string;
    summary?: string;
    tldr?: string[] | string;
    answer?: string | CalcAnswer;
    borrowerSummary?: string | null;
    fred?: FredMeta;
    paymentDelta?: { perQuarterPt: number; loanAmount: number };
    generatedAt?: string;
};

export type AnswerBlockProps = {
    meta?: AnswerMeta;
    friendly?: string;
};

/* ===== Helpers duplicated from page.tsx (safe, local) ===== */

const fmtISOshort = (iso?: string) =>
    iso ? iso.replace('T', ' ').replace('Z', 'Z') : 'n/a';

const fmtMoney = (n: unknown) =>
    (typeof n === 'number' && Number.isFinite(n) ? n : 0).toLocaleString(
        undefined,
        { maximumFractionDigits: 2 }
    );

/* ===== Component ===== */

const AnswerBlock: React.FC<AnswerBlockProps> = ({ meta, friendly }) => {
    if (!meta) return null;

    const m = meta;

    const headerPath = (m.path ?? '—') as AnswerMeta['path'] | '—';
    const headerUsedFRED = typeof m.usedFRED === 'boolean' ? m.usedFRED : false;
    const headerAt: string | undefined = m.generatedAt;

    // ----- Special layout for calc answers -----
    if (headerPath === 'calc' && m.answer && typeof m.answer === 'object') {
        const a = m.answer as CalcAnswer;
        return (
            <div className="answer-block" style={{ display: 'grid', gap: 10 }}>
                <div className="meta">
                    <span>
                        path: <b>{String(headerPath)}</b>
                    </span>
                    <span>
                        {' '}
                        | usedFRED: <b>{String(headerUsedFRED)}</b>
                    </span>
                    {headerAt && (
                        <span>
                            {' '}
                            | at: <b>{fmtISOshort(headerAt)}</b>
                        </span>
                    )}
                </div>

                <div>
                    <div>
                        <b>Loan amount:</b> ${fmtMoney(a.loanAmount)}
                    </div>
                    <div>
                        <b>Monthly P&I:</b> ${fmtMoney(a.monthlyPI)}
                    </div>
                </div>

                {typeof a.monthlyTotalPITI === 'number' &&
                    a.monthlyTotalPITI > 0 && (
                        <div className="panel">
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>
                                PITI breakdown
                            </div>
                            <ul style={{ marginTop: 0 }}>
                                <li>Taxes: ${fmtMoney(a.monthlyTax)}</li>
                                <li>Insurance: ${fmtMoney(a.monthlyIns)}</li>
                                <li>HOA: ${fmtMoney(a.monthlyHOA)}</li>
                                <li>MI: ${fmtMoney(a.monthlyMI)}</li>
                                <li>
                                    <b>
                                        Total PITI: $
                                        {fmtMoney(a.monthlyTotalPITI)}
                                    </b>
                                </li>
                            </ul>
                        </div>
                    )}

                {Array.isArray(a.sensitivities) &&
                    a.sensitivities.length > 0 && (
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>
                                ±0.25% Sensitivity
                            </div>
                            <ul style={{ marginTop: 0 }}>
                                {a.sensitivities.map((s, i) => (
                                    <li key={i}>
                                        Rate:{' '}
                                        {(Number(s.rate) * 100).toFixed(2)}% → P&I $
                                        {fmtMoney(s.pi)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                {typeof m.tldr === 'string' && (
                    <div style={{ fontStyle: 'italic' }}>{m.tldr}</div>
                )}
            </div>
        );
    }

    // ----- Fallback layout for non-calc / legacy answers -----

    const primary =
        m.message ??
        m.summary ??
        (m.fred &&
            m.fred.tenYearYield != null &&
            m.fred.mort30Avg != null &&
            m.fred.spread != null
            ? `As of ${m.fred.asOf ?? 'recent data'
            }: ${typeof m.fred.tenYearYield === 'number'
                ? m.fred.tenYearYield.toFixed(2)
                : m.fred.tenYearYield
            }%, 30Y ${typeof m.fred.mort30Avg === 'number'
                ? m.fred.mort30Avg.toFixed(2)
                : m.fred.mort30Avg
            }%, spread ${typeof m.fred.spread === 'number'
                ? m.fred.spread.toFixed(2)
                : m.fred.spread
            }%.`
            : typeof m.answer === 'string'
                ? m.answer
                : '');

    const lines = (typeof m.answer === 'string' ? m.answer : '')
        .split('\n')
        .map((s) => s.trim());

    const takeaway = friendly || primary || lines[0] || '';

    const bullets = lines
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2));

    const nexts = lines
        .filter((l) => l.toLowerCase().startsWith('next:'))
        .map((l) => l.slice(5).trim());

    return (
        <div className="answer-block" style={{ display: 'grid', gap: 10 }}>
            <div className="meta">
                <span>
                    path: <b>{String(m.path ?? '—')}</b>
                </span>
                <span>
                    {' '}
                    | usedFRED: <b>{String(headerUsedFRED)}</b>
                </span>
                {headerAt && (
                    <span>
                        {' '}
                        | at: <b>{fmtISOshort(headerAt)}</b>
                    </span>
                )}
            </div>

            {takeaway && <div>{takeaway}</div>}

            {Array.isArray(m.tldr) && m.tldr.length > 0 && (
                <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>TL;DR</div>
                    <ul style={{ marginTop: 0 }}>
                        {m.tldr.map((t, i) => (
                            <li key={i}>{t}</li>
                        ))}
                    </ul>
                </div>
            )}

            {bullets.length > 0 && (
                <ul style={{ marginTop: 0 }}>
                    {bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                    ))}
                </ul>
            )}

            {nexts.length > 0 && (
                <div style={{ display: 'grid', gap: 4 }}>
                    {nexts.map((n, i) => (
                        <div key={i}>
                            <b>Next:</b> {n}
                        </div>
                    ))}
                </div>
            )}

            {m.path === 'market' && headerUsedFRED && m.borrowerSummary && (
                <div className="panel">
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                        Borrower Summary
                    </div>
                    <ul style={{ marginTop: 0 }}>
                        {m.borrowerSummary.split('\n').map((l, i) => (
                            <li key={i}>{l.replace(/^\s*[-|*]\s*/, '')}</li>
                        ))}
                    </ul>
                </div>
            )}

            {m.paymentDelta && (
                <div style={{ fontSize: 13 }}>
                    Every 0.25% ~{' '}
                    <b>${fmtMoney(m.paymentDelta.perQuarterPt)}/mo</b> on $
                    {m.paymentDelta.loanAmount.toLocaleString()}.
                </div>
            )}
        </div>
    );
};

export default AnswerBlock;
