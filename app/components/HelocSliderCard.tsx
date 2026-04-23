'use client';

// app/components/HelocSliderCard.tsx
// HELOC analyzer — max line, draw payment, repayment payment, vs cash-out comparison
// Hero: Max Available | Draw Payment | Repayment Payment

import React, { useState, useMemo } from 'react';
import SliderField from './SliderField';

export interface HelocSliderParams {
    homeValue:    number;  // current estimated home value
    balance:      number;  // existing mortgage balance
    drawAmount?:  number;  // initial draw (defaults to max available)
    helocRate?:   number;  // HELOC rate % (defaults to ~9%)
    cashOutRate?: number;  // market rate for cash-out comparison (from FRED)
    onRunScenario?: (seed: string) => void;
}

// ── Math helpers ─────────────────────────────────────────────────────────────
function calcPI(principal: number, annualRatePct: number, termMonths: number): number {
    if (termMonths <= 0 || principal <= 0) return 0;
    if (annualRatePct === 0) return principal / termMonths;
    const r = annualRatePct / 100 / 12;
    return principal * r * Math.pow(1 + r, termMonths) / (Math.pow(1 + r, termMonths) - 1);
}

function fmt$(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (n >= 1_000)     return `$${Math.round(n).toLocaleString()}`;
    return `$${Math.round(n)}`;
}
function fmtRate(r: number) { return `${r.toFixed(2)}%`; }

const DRAW_PERIOD_MO = 120; // 10yr standard draw period

// ── Component ─────────────────────────────────────────────────────────────────
export default function HelocSliderCard(props: HelocSliderParams) {
    const initMaxLine = Math.max(0, Math.round(props.homeValue * 0.85 - props.balance));
    const initDraw    = props.drawAmount ?? Math.min(100_000, initMaxLine);
    const initRate    = props.helocRate ?? 9.0;

    const [homeValue,     setHomeValue]    = useState(props.homeValue);
    const [balance,       setBalance]      = useState(props.balance);
    const [drawAmount,    setDrawAmount]   = useState(Math.min(initDraw, initMaxLine));
    const [helocRate,     setHelocRate]    = useState(initRate);
    const [repayYears,    setRepayYears]   = useState(20);

    const maxLine      = Math.max(0, Math.round(homeValue * 0.85 - balance));
    const equity       = Math.max(0, homeValue - balance);
    const equityPct    = homeValue > 0 ? (equity / homeValue) * 100 : 0;
    const safeDrawAmt  = Math.min(drawAmount, maxLine);
    const repayMo      = repayYears * 12;
    const cashOutRate  = props.cashOutRate ?? helocRate;

    const calc = useMemo(() => {
        // Draw period: interest-only on drawn amount
        const drawMonthly = safeDrawAmt > 0 ? safeDrawAmt * (helocRate / 100 / 12) : 0;
        // Repayment period: P&I on drawn amount
        const repayMonthly = calcPI(safeDrawAmt, helocRate, repayMo);
        // Total HELOC interest
        const totalDrawInt   = drawMonthly * DRAW_PERIOD_MO;
        const totalRepayInt  = Math.max(0, repayMonthly * repayMo - safeDrawAmt);
        const totalHelocInt  = totalDrawInt + totalRepayInt;

        // Cash-out refi comparison (same draw amount rolled into mortgage)
        const cashOutBal     = balance + safeDrawAmt;
        const cashOutMonthly = calcPI(cashOutBal, cashOutRate, 360);
        const existingMonthly = calcPI(balance, cashOutRate, 360);
        const cashOutTotalInt = Math.max(0, cashOutMonthly * 360 - cashOutBal);
        const helocTotalCost  = totalHelocInt; // interest only (no closing costs)
        const cashOutClosing  = Math.round(cashOutBal * 0.02);
        const cashOutTotalCost = cashOutTotalInt + cashOutClosing;

        return {
            drawMonthly:   Math.round(drawMonthly),
            repayMonthly:  Math.round(repayMonthly),
            totalDrawInt:  Math.round(totalDrawInt),
            totalHelocInt: Math.round(totalHelocInt),
            cashOutMonthly: Math.round(cashOutMonthly),
            existingMonthly: Math.round(existingMonthly),
            cashOutTotalInt: Math.round(cashOutTotalInt),
            cashOutClosing,
            helocTotalCost:  Math.round(helocTotalCost),
            cashOutTotalCost: Math.round(cashOutTotalCost),
        };
    }, [safeDrawAmt, helocRate, repayMo, balance, cashOutRate]);

    function buildSeed() {
        return `I have a home worth ${fmt$(homeValue)} with a ${fmt$(balance)} balance. I want to take out a HELOC for ${fmt$(safeDrawAmt)} at ${fmtRate(helocRate)}. Walk me through the draw period payments, repayment period, and compare it to a cash-out refi at ${fmtRate(cashOutRate)}.`;
    }

    const cltv = homeValue > 0 ? ((balance + safeDrawAmt) / homeValue) * 100 : 0;
    const cltvColor = cltv > 90 ? '#dc2626' : cltv > 85 ? '#d97706' : '#059669';

    return (
        <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
            padding: '20px 20px 16px', marginTop: 12, width: '100%', boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden',
        }}>
        <style>{`
          .heloc-hero-val{font-size:22px;font-weight:800;letter-spacing:-0.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          @media(max-width:420px){.heloc-hero-val{font-size:16px;}}
        `}</style>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
                    HELOC Explorer
                </div>
                <div style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    background: equityPct >= 20 ? 'rgba(5,150,105,0.08)' : 'rgba(217,119,6,0.08)',
                    border: `1px solid ${equityPct >= 20 ? 'rgba(5,150,105,0.3)' : 'rgba(217,119,6,0.3)'}`,
                    color: equityPct >= 20 ? '#059669' : '#d97706',
                }}>
                    {equityPct.toFixed(0)}% equity · {fmt$(equity)}
                </div>
            </div>

            {/* ── Hero: 3 big numbers ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
                {/* Max available */}
                <div style={{
                    background: maxLine > 0 ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${maxLine > 0 ? '#6ee7b7' : '#fca5a5'}`,
                    borderRadius: 10, padding: '10px 8px', textAlign: 'center', minWidth: 0, overflow: 'hidden',
                }}>
                    <div className="heloc-hero-val" style={{ color: maxLine > 0 ? '#059669' : '#dc2626' }}>
                        {maxLine > 0 ? fmt$(maxLine) : 'None'}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 500 }}>Max line (85% CLTV)</div>
                </div>

                {/* Draw payment */}
                <div style={{
                    background: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: 10, padding: '10px 8px', textAlign: 'center', minWidth: 0, overflow: 'hidden',
                }}>
                    <div className="heloc-hero-val" style={{ color: '#1d4ed8' }}>
                        {fmt$(calc.drawMonthly)}/mo
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 500 }}>Draw period (int. only)</div>
                </div>

                {/* Repayment payment */}
                <div style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 10, padding: '10px 8px', textAlign: 'center', minWidth: 0, overflow: 'hidden',
                }}>
                    <div className="heloc-hero-val" style={{ color: '#334155' }}>
                        {fmt$(calc.repayMonthly)}/mo
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 500 }}>Repayment ({repayYears}yr P&I)</div>
                </div>
            </div>

            {/* ── CLTV indicator ── */}
            {safeDrawAmt > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                    fontSize: 11, padding: '5px 10px', borderRadius: 6,
                    background: cltv > 85 ? '#fef3c7' : '#f0fdf4',
                    border: `1px solid ${cltv > 85 ? '#fcd34d' : '#6ee7b7'}`,
                }}>
                    <span style={{ color: cltvColor, fontWeight: 700 }}>CLTV {cltv.toFixed(0)}%</span>
                    <span style={{ color: '#64748b' }}>
                        {cltv <= 80 ? '— excellent (under 80%)' :
                         cltv <= 85 ? '— good (85% CLTV limit)' :
                         cltv <= 90 ? '— at the cap — reduce draw to qualify' :
                         '— over 85% cap — not eligible'}
                    </span>
                </div>
            )}

            {/* ── Sliders ── */}
            <div style={{ marginBottom: 14 }}>
                <SliderField
                    label="Home Value" value={homeValue}
                    min={100_000} max={Math.max(5_000_000, Math.ceil(homeValue * 1.5 / 500_000) * 500_000)}
                    step={homeValue >= 1_000_000 ? 25_000 : 5_000}
                    onChange={setHomeValue}
                    format={fmt$}
                    trackColor="#10b981" theme="light"
                />
            </div>

            <div style={{ marginBottom: 14 }}>
                <SliderField
                    label="Mortgage Balance" value={balance}
                    min={0} max={Math.max(3_000_000, Math.ceil(homeValue * 0.97 / 100_000) * 100_000)}
                    step={balance >= 1_000_000 ? 25_000 : 5_000}
                    onChange={setBalance}
                    format={fmt$}
                    trackColor="#94a3b8" theme="light"
                />
            </div>

            <div style={{ marginBottom: 14 }}>
                <SliderField
                    label={`HELOC Draw${maxLine > 0 ? ` (max ${fmt$(maxLine)})` : ' (none available)'}`}
                    value={safeDrawAmt}
                    min={0} max={Math.max(maxLine, 1)}
                    step={safeDrawAmt >= 500_000 ? 25_000 : safeDrawAmt >= 100_000 ? 5_000 : 1_000}
                    onChange={v => setDrawAmount(Math.min(v, maxLine))}
                    format={fmt$}
                    trackColor="#3b82f6" theme="light"
                />
            </div>

            <div style={{ marginBottom: 14 }}>
                <SliderField
                    label="HELOC Rate" value={helocRate}
                    min={6} max={14} step={0.125}
                    onChange={setHelocRate}
                    format={fmtRate}
                    trackColor="#f59e0b" theme="light"
                />
            </div>

            {/* Repayment period toggle */}
            <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Repayment Period</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {[10, 15, 20].map(yr => (
                        <button key={yr}
                            onClick={() => setRepayYears(yr)}
                            style={{
                                flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                cursor: 'pointer',
                                border: repayYears === yr ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                                background: repayYears === yr ? '#eff6ff' : '#f8fafc',
                                color: repayYears === yr ? '#1d4ed8' : '#64748b',
                            }}
                        >{yr}yr</button>
                    ))}
                </div>
            </div>

            {/* ── Interest breakdown ── */}
            <div style={{
                background: '#f8fafc', borderRadius: 10, padding: '10px 14px',
                marginBottom: 12, fontSize: 12,
            }}>
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: 8 }}>HELOC total cost on {fmt$(safeDrawAmt)} draw</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ color: '#64748b' }}>Interest during draw (10yr × {fmt$(calc.drawMonthly)}/mo)</span>
                    <span style={{ fontWeight: 600, color: '#334155' }}>{fmt$(calc.totalDrawInt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ color: '#64748b' }}>Interest during repayment ({repayYears}yr)</span>
                    <span style={{ fontWeight: 600, color: '#334155' }}>{fmt$(Math.max(0, calc.repayMonthly * repayMo - safeDrawAmt))}</span>
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Total interest on HELOC</span>
                    <span style={{ fontWeight: 800, color: '#1d4ed8' }}>{fmt$(calc.totalHelocInt)}</span>
                </div>
            </div>

            {/* ── vs Cash-Out Refi comparison ── */}
            {safeDrawAmt > 0 && (
                <div style={{
                    background: '#f8fafc', borderRadius: 10, padding: '10px 14px',
                    marginBottom: 12, fontSize: 12,
                    border: '1px solid #e2e8f0',
                }}>
                    <div style={{ fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                        vs. Cash-Out Refi @ {fmtRate(cashOutRate)}
                        {props.cashOutRate && <span style={{ fontWeight: 400, color: '#64748b', fontSize: 11 }}> (live market rate)</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ color: '#64748b' }}>New balance ({fmt$(balance)} + {fmt$(safeDrawAmt)})</span>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{fmt$(balance + safeDrawAmt)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ color: '#64748b' }}>Monthly P&I (30yr)</span>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{fmt$(calc.cashOutMonthly)}/mo</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ color: '#64748b' }}>Est. closing costs (~2%)</span>
                        <span style={{ fontWeight: 600, color: '#ef4444' }}>{fmt$(calc.cashOutClosing)}</span>
                    </div>
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#475569', fontWeight: 600 }}>HELOC vs refi: total interest diff</span>
                        <span style={{
                            fontWeight: 800,
                            color: calc.helocTotalCost < calc.cashOutTotalCost - calc.cashOutClosing ? '#059669' : '#d97706',
                        }}>
                            {calc.helocTotalCost < calc.cashOutTotalCost - calc.cashOutClosing
                                ? `HELOC saves ${fmt$(calc.cashOutTotalCost - calc.cashOutClosing - calc.helocTotalCost)}`
                                : `Refi saves ${fmt$(calc.helocTotalCost - (calc.cashOutTotalCost - calc.cashOutClosing))}`}
                        </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
                        Cash-out comparison assumes 30yr fixed. HELOC keeps your existing mortgage rate.
                    </div>
                </div>
            )}

            {/* ── Footer stats ── */}
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b', marginBottom: 12, flexWrap: 'wrap' }}>
                <span>Home value <strong style={{ color: '#334155' }}>{fmt$(homeValue)}</strong></span>
                <span>Balance <strong style={{ color: '#334155' }}>{fmt$(balance)}</strong></span>
                <span>Equity <strong style={{ color: equityPct >= 20 ? '#059669' : '#d97706' }}>{equityPct.toFixed(0)}%</strong></span>
                <span>CLTV <strong style={{ color: cltvColor }}>{cltv.toFixed(0)}%</strong></span>
            </div>

            {/* ── Action ── */}
            {props.onRunScenario && safeDrawAmt > 0 && (
                <button
                    onClick={() => props.onRunScenario!(buildSeed())}
                    style={{
                        width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
                        background: '#0f172a', color: '#fff', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', letterSpacing: '-0.01em',
                    }}
                >
                    Analyze this HELOC scenario →
                </button>
            )}
        </div>
    );
}
