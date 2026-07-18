'use client';

// PropertyCompareCard (PCMP-001) — side-by-side comparison of 2-3 properties.
//
// Fired from chat when a message has compare intent + multiple plain
// addresses (see the multi-property branch in chat/page.tsx send()).
// Each column is real lookup data (/api/property/lookup per address);
// payment math is computed here from the live ticker rate + 20% down —
// same deterministic approach as the other cards, no LLM numbers.
//
// Photo rule (feedback_photo_source): <img> only for ssl.cdn-redfin.com
// URLs; anything else falls back to PropertyPhoto (Street View chain).

import PropertyPhoto from '@/components/PropertyPhoto';
import AdminCardBadge from './AdminCardBadge';
import { calcPI } from '../../lib/math';
import { SHORT_DISCLOSURE } from '../../lib/disclosures';

export interface CompareProperty {
    address:        string;
    price:          number | null;
    beds:           number | null;
    baths:          number | null;
    sqft:           number | null;
    yearBuilt:      number | null;
    listingStatus:  string | null;
    annualTaxes:    number | null;
    taxRate:        number | null;
    hoaMonthly:     number | null;
    estimatedValue: number | null;
    photoUrl:       string | null;
}

export interface PropertyCompareCardProps {
    properties: CompareProperty[];
    rate:       number;
    rateIsLive: boolean;
    downPct:    number;
}

const INS_RATE = 0.003;      // annual homeowner's insurance estimate
const CA_TAX_FALLBACK = 0.011;
const CLOSING_PCT = 0.03;    // rough closing-cost estimate for cash-to-close

function fmt$(n: number): string {
    return '$' + Math.round(n).toLocaleString('en-US');
}
function fmtK(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    return `$${Math.round(n / 1000)}k`;
}

interface ColCalc {
    piti: number | null;
    down: number | null;
    loan: number | null;
    pi: number | null;
    taxMo: number | null;
    insMo: number | null;
    cashToClose: number | null;
    pricePerSqft: number | null;
}

function calcCol(p: CompareProperty, rate: number, downPct: number): ColCalc {
    if (!p.price) {
        return { piti: null, down: null, loan: null, pi: null, taxMo: null, insMo: null, cashToClose: null, pricePerSqft: null };
    }
    const down  = p.price * downPct / 100;
    const loan  = p.price - down;
    const pi    = calcPI(loan, rate, 30);
    const taxMo = p.annualTaxes ? p.annualTaxes / 12 : (p.price * (p.taxRate ?? CA_TAX_FALLBACK)) / 12;
    const insMo = (p.price * INS_RATE) / 12;
    const piti  = pi + taxMo + insMo + (p.hoaMonthly ?? 0);
    return {
        piti, down, loan, pi, taxMo, insMo,
        cashToClose: down + p.price * CLOSING_PCT,
        pricePerSqft: p.sqft ? p.price / p.sqft : null,
    };
}

export default function PropertyCompareCard({ properties, rate, rateIsLive, downPct }: PropertyCompareCardProps) {
    const cols = properties.slice(0, 3).map(p => ({ p, c: calcCol(p, rate, downPct) }));

    const pitiVals = cols.map(({ c }) => c.piti).filter((v): v is number => v !== null);
    const psfVals  = cols.map(({ c }) => c.pricePerSqft).filter((v): v is number => v !== null);
    const bestPiti = pitiVals.length >= 2 ? Math.min(...pitiVals) : null;
    const bestPsf  = psfVals.length  >= 2 ? Math.min(...psfVals)  : null;

    return (
        <div className="pcmp" style={{ position: 'relative' }}>
            <AdminCardBadge code="PCMP-001" />

            {/* Topbar */}
            <div className="pcmp-top">
                <div className="pcmp-top-l">
                    <span className="pcmp-dot" />
                    <span className="pcmp-title">Property Comparison</span>
                    <span className="pcmp-count">{cols.length} properties</span>
                </div>
                <span className="pcmp-rate">
                    {rate.toFixed(2)}% · {downPct}% down · 30yr{rateIsLive ? <span className="pcmp-live"> LIVE</span> : ''}
                </span>
            </div>

            {/* Columns */}
            <div className="pcmp-scroll">
                <div className="pcmp-grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(215px, 1fr))` }}>
                    {cols.map(({ p, c }, i) => {
                        const isBestPiti = bestPiti !== null && c.piti !== null && Math.abs(c.piti - bestPiti) < 0.5;
                        const isBestPsf  = bestPsf  !== null && c.pricePerSqft !== null && Math.abs(c.pricePerSqft - bestPsf) < 0.005;
                        const short = p.address.split(',')[0];
                        const isRedfinPhoto = !!p.photoUrl && p.photoUrl.startsWith('https://ssl.cdn-redfin.com/');
                        return (
                            <div key={i} className={`pcmp-col${isBestPiti ? ' pcmp-col-best' : ''}`}>
                                {/* Photo */}
                                <div className="pcmp-photo">
                                    {isRedfinPhoto ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={p.photoUrl!} alt="" />
                                    ) : (
                                        <PropertyPhoto address={p.address} width={430} height={240}
                                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                    )}
                                    {p.listingStatus && (
                                        <span className={`pcmp-status${p.listingStatus === 'FOR_SALE' ? ' pcmp-status-sale' : ''}`}>
                                            {p.listingStatus.replace(/_/g, ' ')}
                                        </span>
                                    )}
                                    {isBestPiti && <span className="pcmp-badge">Lowest payment</span>}
                                </div>

                                {/* Identity */}
                                <div className="pcmp-addr" title={p.address}>{short}</div>
                                <div className="pcmp-price">{p.price ? fmt$(p.price) : 'Price unavailable'}</div>
                                {p.estimatedValue != null && (
                                    <div className="pcmp-est">Est. value {fmtK(p.estimatedValue)}</div>
                                )}
                                <div className="pcmp-facts">
                                    {[
                                        p.beds != null ? `${p.beds} bd` : null,
                                        p.baths != null ? `${p.baths} ba` : null,
                                        p.sqft != null ? `${p.sqft.toLocaleString()} sqft` : null,
                                        p.yearBuilt != null ? `built ${p.yearBuilt}` : null,
                                    ].filter(Boolean).join(' · ') || '—'}
                                </div>

                                {/* Financing rows */}
                                <div className="pcmp-rows">
                                    <div className="pcmp-row"><span>$/sqft</span><b>{c.pricePerSqft ? `$${Math.round(c.pricePerSqft)}` : '—'}{isBestPsf && <i className="pcmp-mini"> best</i>}</b></div>
                                    <div className="pcmp-row"><span>Down ({downPct}%)</span><b>{c.down ? fmtK(c.down) : '—'}</b></div>
                                    <div className="pcmp-row"><span>Loan</span><b>{c.loan ? fmtK(c.loan) : '—'}</b></div>
                                    <div className="pcmp-row"><span>P&amp;I</span><b>{c.pi ? `${fmt$(c.pi)}/mo` : '—'}</b></div>
                                    <div className="pcmp-row"><span>Taxes</span><b>{c.taxMo ? `${fmt$(c.taxMo)}/mo` : '—'}</b></div>
                                    <div className="pcmp-row"><span>Insurance</span><b>{c.insMo ? `${fmt$(c.insMo)}/mo` : '—'}</b></div>
                                    {p.hoaMonthly != null && p.hoaMonthly > 0 && (
                                        <div className="pcmp-row"><span>HOA</span><b>{fmt$(p.hoaMonthly)}/mo</b></div>
                                    )}
                                    <div className="pcmp-row pcmp-row-piti">
                                        <span>Est. PITI</span>
                                        <b>{c.piti ? `${fmt$(c.piti)}/mo` : '—'}</b>
                                    </div>
                                    {c.piti !== null && bestPiti !== null && !isBestPiti && (
                                        <div className="pcmp-delta">+{fmt$(c.piti - bestPiti)}/mo vs lowest</div>
                                    )}
                                    <div className="pcmp-row"><span>Cash to close*</span><b>{c.cashToClose ? fmtK(c.cashToClose) : '—'}</b></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="pcmp-foot">
                *Down payment + ~3% estimated closing costs. {SHORT_DISCLOSURE}
            </div>

            <style>{`
.pcmp{background:linear-gradient(160deg,rgba(10,18,32,0.95),rgba(6,12,24,0.98));border:1px solid rgba(0,232,122,0.16);border-radius:16px;padding:16px 16px 12px;margin:14px 0;overflow:hidden}
.pcmp-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.pcmp-top-l{display:flex;align-items:center;gap:9px}
.pcmp-dot{width:8px;height:8px;border-radius:50%;background:#00e87a;box-shadow:0 0 8px rgba(0,232,122,0.6)}
.pcmp-title{font-weight:800;font-size:.95rem;color:#f0f4ff;letter-spacing:-.01em}
.pcmp-count{font-size:.68rem;font-weight:700;color:rgba(185,208,192,0.55);padding:2px 9px;border-radius:999px;border:1px solid rgba(255,255,255,0.1)}
.pcmp-rate{font-size:.7rem;font-weight:700;color:rgba(0,232,122,0.8);font-variant-numeric:tabular-nums}
.pcmp-live{font-size:.56rem;font-weight:800;letter-spacing:.08em;color:#00e87a}
.pcmp-scroll{overflow-x:auto;scrollbar-width:thin}
.pcmp-grid{display:grid;gap:12px;min-width:min-content}
.pcmp-col{border:1.5px solid rgba(255,255,255,0.09);border-radius:13px;padding:11px;background:rgba(255,255,255,0.015);min-width:0}
.pcmp-col-best{border-color:rgba(0,232,122,0.45);background:rgba(0,232,122,0.04)}
.pcmp-photo{position:relative;width:100%;height:120px;border-radius:9px;overflow:hidden;margin-bottom:10px;background:rgba(255,255,255,0.04)}
.pcmp-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pcmp-status{position:absolute;top:7px;left:7px;padding:2px 8px;border-radius:999px;background:rgba(4,10,20,0.85);border:1px solid rgba(255,255,255,0.2);color:rgba(240,244,255,0.8);font-size:.56rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase}
.pcmp-status-sale{border-color:rgba(0,232,122,0.5);color:#00e87a}
.pcmp-badge{position:absolute;top:7px;right:7px;padding:2px 8px;border-radius:999px;background:#00e87a;color:#04120a;font-size:.56rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.pcmp-addr{font-size:.86rem;font-weight:800;color:#f0f4ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pcmp-price{font-size:1.28rem;font-weight:800;color:#00e87a;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin:2px 0 1px}
.pcmp-est{font-size:.68rem;color:rgba(185,208,192,0.55);margin-bottom:4px}
.pcmp-facts{font-size:.72rem;color:rgba(185,208,192,0.7);margin-bottom:10px}
.pcmp-rows{display:flex;flex-direction:column;gap:5px}
.pcmp-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:.75rem;color:rgba(185,208,192,0.6)}
.pcmp-row b{color:rgba(240,244,255,0.85);font-weight:700;font-variant-numeric:tabular-nums}
.pcmp-mini{font-style:normal;font-size:.58rem;font-weight:800;color:#00e87a;text-transform:uppercase;letter-spacing:.05em;margin-left:4px}
.pcmp-row-piti{margin-top:4px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.09);font-size:.8rem}
.pcmp-row-piti span{color:rgba(240,244,255,0.75);font-weight:700}
.pcmp-row-piti b{color:#00e87a;font-size:.95rem;font-weight:800}
.pcmp-delta{font-size:.64rem;color:#f5b04b;text-align:right;font-variant-numeric:tabular-nums}
.pcmp-foot{margin-top:12px;font-size:.62rem;line-height:1.5;color:rgba(185,208,192,0.4)}
            `}</style>
        </div>
    );
}
