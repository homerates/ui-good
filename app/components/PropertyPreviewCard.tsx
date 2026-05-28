'use client';

// app/components/PropertyPreviewCard.tsx
// Displays a scraped property listing snapshot — photo, address, price, beds/baths/sqft, tax note.
// Rendered in the chat when a user pastes a Zillow/Redfin URL.

import React, { useEffect } from 'react';
import { prefetchGrokProperty } from '@/prefetchGrokProperty';

export interface PropertyCardData {
    source: string;
    url: string;
    price: number | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    annualTaxes: number | null;
    taxRateEffective: number | null;
    taxSource: string | null;
    photoUrl: string | null;
    parsedBy: string;
    parseWarnings: string[];
    // Extended fields
    listingStatus?: 'FOR_SALE' | 'OFF_MARKET' | 'PENDING' | 'SOLD' | 'UNKNOWN';
    daysOnMarket?: number | null;
    lastSaleDate?: string | null;
    lastSalePrice?: number | null;
    estimatedValue?: number | null;
    estimatedValueLow?: number | null;
    estimatedValueHigh?: number | null;
    estimatedBalance?: number | null;
    estimatedEquity?: number | null;
    purchaseRate?: number | null;
    remainingMonths?: number | null;
    hoaMonthly?: number | null;
    pricePerSqft?: number | null;
    // Social proof / engagement signals
    zillowViews?: number | null;
    zillowSaves?: number | null;
    zillowDaysOnMarket?: number | null;
    redfinViews?: string | null;
    redfinSaves?: number | null;
    socialProofScore?: number | null;
    interestLevel?: 'Very High' | 'High' | 'Moderate' | 'Low' | null;
    yearBuilt?: number | null;
    lotSqft?: number | null;
    keyHighlights?: string[] | null;
}

function fmtPrice(n: number | null): string {
    if (n == null) return '—';
    return '$' + n.toLocaleString();
}

function fmtNum(n: number | null, decimals = 0): string {
    if (n == null) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

const SOURCE_LABEL: Record<string, string> = {
    zillow: 'Zillow',
    redfin: 'Redfin',
    realtor: 'Realtor.com',
    trulia: 'Trulia',
    homes: 'Homes.com',
    unknown: 'Listing',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    FOR_SALE:   { label: 'For Sale',   color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
    PENDING:    { label: 'Pending',    color: '#facc15', bg: 'rgba(250,204,21,0.12)' },
    OFF_MARKET: { label: 'Off Market', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    SOLD:       { label: 'Sold',       color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

export default function PropertyPreviewCard({ data }: { data: PropertyCardData }) {
    const sourceName  = SOURCE_LABEL[data.source] ?? data.source;
    const hasPhoto    = !!data.photoUrl;
    const status      = data.listingStatus && data.listingStatus !== 'UNKNOWN' ? STATUS_CONFIG[data.listingStatus] : null;
    const isOffMarket = data.listingStatus === 'OFF_MARKET' || data.listingStatus === 'SOLD';
    // Homeowner analysis mode: off-market with equity data from Rentcast
    const isHomeowner = isOffMarket && data.estimatedEquity != null && data.estimatedBalance != null;

    const fullAddress = [data.address, data.city, data.state, data.zip].filter(Boolean).join(', ');

    // Fire-and-forget: warm the Grok cache so "View Intelligence Report →" loads instantly
    useEffect(() => {
        if (!fullAddress) return;
        prefetchGrokProperty(fullAddress, {
            current_status:     data.listingStatus ?? undefined,
            current_list_price: data.price ?? undefined,
            bedrooms:           data.beds ?? undefined,
            bathrooms:          data.baths ?? undefined,
            sqft:               data.sqft ?? undefined,
            days_on_market:     data.daysOnMarket ?? undefined,
            hoa_monthly:        data.hoaMonthly ?? undefined,
            last_sold_price:    data.lastSalePrice ?? undefined,
            last_sold_date:     data.lastSaleDate ?? undefined,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fullAddress]);

    const taxNote =
        data.taxSource === 'scraped' ? 'Property taxes from listing'
        : data.taxSource === 'table' ? `Estimated taxes (${data.state ?? 'state'} avg)`
        : null;

    const displayValue = isOffMarket && data.estimatedValue ? data.estimatedValue : data.price;
    const ltvPct = displayValue && data.estimatedBalance != null
        ? Math.round((data.estimatedBalance / displayValue) * 100) : null;
    const equityPct = ltvPct !== null ? 100 - ltvPct : null;

    // ── Homeowner / off-market equity card ────────────────────────────────────
    if (isHomeowner) {
        const val       = displayValue ?? 0;
        const equity    = data.estimatedEquity ?? 0;
        const balance   = data.estimatedBalance ?? 0;
        const valFmt    = val >= 1_000_000
            ? `$${(val / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
            : `$${Math.round(val / 1_000)}k`;
        const equityFmt = equity >= 1_000_000
            ? `$${(equity / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
            : `$${Math.round(equity / 1_000)}k`;
        const balFmt    = `$${Math.round(balance / 1_000)}k`;

        return (
            <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#0e1420', maxWidth: 560, margin: '8px 0', fontFamily: 'inherit' }}>

                {/* ── Gradient header ── */}
                {hasPhoto ? (
                    <div style={{ position: 'relative', height: 160, overflow: 'hidden' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={data.photoUrl!} alt={data.address ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(14,20,32,0.95) 0%, transparent 55%)' }} />
                        <div style={{ position: 'absolute', bottom: 12, left: 16, right: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff', lineHeight: 1.3 }}>{data.address}</div>
                            <div style={{ fontSize: 11, color: 'rgba(240,244,255,0.6)', marginTop: 2 }}>
                                {data.beds}bd · {data.baths}ba · {data.sqft?.toLocaleString()} sqft
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ background: 'linear-gradient(135deg, #0e1420 0%, #141b28 100%)', padding: '18px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                            Homeowner Analysis · Rentcast AVM
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f4ff', lineHeight: 1.3 }}>{data.address}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                            {[data.beds != null && `${data.beds}bd`, data.baths != null && `${data.baths}ba`, data.sqft != null && `${data.sqft.toLocaleString()} sqft`].filter(Boolean).join(' · ')}
                            {' · '}
                            <span style={{ color: '#94a3b8' }}>Off Market</span>
                        </div>
                    </div>
                )}

                {/* ── AVM value + equity hero ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ textAlign: 'center', padding: '12px 8px' }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>AVM Value</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#f0f4ff' }}>{valFmt}</div>
                        {data.estimatedValueLow && data.estimatedValueHigh && (
                            <div style={{ fontSize: 10, color: '#eaf8f7', marginTop: 2 }}>
                                ${Math.round((data.estimatedValueLow) / 1_000)}k–${Math.round((data.estimatedValueHigh) / 1_000)}k
                            </div>
                        )}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', height: 40 }} />
                    <div style={{ textAlign: 'center', padding: '12px 8px' }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Est. Equity</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#00e87a' }}>{equityFmt}</div>
                        {equityPct !== null && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{equityPct}% owned</div>}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', height: 40 }} />
                    <div style={{ textAlign: 'center', padding: '12px 8px' }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Est. Balance</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#f0f4ff' }}>{balFmt}</div>
                        {ltvPct !== null && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{ltvPct}% LTV</div>}
                    </div>
                </div>

                {/* ── Equity bar ── */}
                {equityPct !== null && (
                    <div style={{ padding: '10px 18px 8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 10, color: '#94a3b8' }}>
                            <span style={{ color: '#00e87a', fontWeight: 700 }}>{equityPct}% equity</span>
                            <span>{ltvPct}% remaining balance</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${equityPct}%`, background: 'linear-gradient(90deg, #00e87a, #3d8bff)', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        </div>
                    </div>
                )}

                {/* ── Purchase history ── */}
                {data.lastSaleDate && data.lastSalePrice && (
                    <div style={{ margin: '0 18px 14px', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#94a3b8', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>Purchased</span>
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{data.lastSaleDate}</span>
                        <span>for</span>
                        <span style={{ color: '#f0f4ff', fontWeight: 700 }}>{fmtPrice(data.lastSalePrice)}</span>
                        {data.purchaseRate && (
                            <><span style={{ color: '#eaf8f7' }}>·</span><span>~{data.purchaseRate}% rate est.</span></>
                        )}
                        {data.remainingMonths && (
                            <><span style={{ color: '#eaf8f7' }}>·</span><span>{Math.round(data.remainingMonths / 12)}yr remaining</span></>
                        )}
                    </div>
                )}


                {/* ── Footer ── */}
                <div style={{ padding: '7px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 10, color: '#eaf8f7', display: 'flex', justifyContent: 'space-between' }}>
                    <span>HomeRates.ai · Rentcast AVM · Educational only</span>
                    <span style={{ color: '#00e87a', fontWeight: 600 }}>Live estimate</span>
                </div>
            </div>
        );
    }

    // ── Standard listing card (Zillow / Redfin URL pastes) ───────────────────
    return (
        <div className="property-preview-card">
            {/* Photo */}
            {hasPhoto && (
                <div className="property-photo-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={data.photoUrl!}
                        alt={data.address ?? 'Property photo'}
                        className="property-photo"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>
            )}

            <div className="property-info">
                {/* Status badge + source link */}
                <div className="property-header-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    {status && (
                        <span style={{
                            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                            textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4,
                            color: status.color, background: status.bg,
                        }}>
                            {status.label}
                            {data.daysOnMarket != null && data.listingStatus === 'FOR_SALE'
                                ? ` · ${data.daysOnMarket}d on market` : ''}
                        </span>
                    )}
                    {data.url && (
                        <a href={data.url} target="_blank" rel="noopener noreferrer"
                            className="property-source-badge" style={{ marginLeft: 'auto' }}>
                            {sourceName} ↗
                        </a>
                    )}
                </div>

                {/* Price */}
                <div style={{ marginTop: 6 }}>
                    <span className="property-price">
                        {isOffMarket && data.estimatedValue
                            ? fmtPrice(data.estimatedValue)
                            : fmtPrice(data.price)}
                    </span>
                    {isOffMarket && data.estimatedValue && (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 6 }}>
                            est. value
                        </span>
                    )}
                </div>

                {/* Address */}
                {data.address && <div className="property-address">{data.address}</div>}

                {/* Beds / baths / sqft / price-per-sqft */}
                <div className="property-stats">
                    {data.beds  != null && <span className="property-stat">{fmtNum(data.beds)} bd</span>}
                    {data.baths != null && <span className="property-stat">{fmtNum(data.baths, 1)} ba</span>}
                    {data.sqft  != null && <span className="property-stat">{fmtNum(data.sqft)} sqft</span>}
                    {data.pricePerSqft != null && (
                        <span className="property-stat">{fmtPrice(data.pricePerSqft)}/sqft</span>
                    )}
                    {data.hoaMonthly != null && (
                        <span className="property-stat">{fmtPrice(data.hoaMonthly)}/mo HOA</span>
                    )}
                </div>

                {/* Key insight row — last sale or estimated value range */}
                {isOffMarket && data.lastSaleDate && data.lastSalePrice && (
                    <div style={{
                        marginTop: 10, padding: '8px 10px', borderRadius: 8,
                        background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)',
                        fontSize: '0.75rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                        <div>
                            <span style={{ color: '#cbd5e1' }}>Last sold {data.lastSaleDate}</span>
                            {' for '}
                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{fmtPrice(data.lastSalePrice)}</span>
                        </div>
                        {data.estimatedEquity != null && data.estimatedBalance != null && (
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                <span>Est. balance <strong style={{ color: '#e2e8f0' }}>{fmtPrice(data.estimatedBalance)}</strong></span>
                                <span>Est. equity <strong style={{ color: '#4ade80' }}>{fmtPrice(data.estimatedEquity)}</strong></span>
                            </div>
                        )}
                        {(data.estimatedValueLow || data.estimatedValueHigh) && (
                            <div>
                                Value range{' '}
                                <strong style={{ color: '#e2e8f0' }}>
                                    {fmtPrice(data.estimatedValueLow ?? null)} – {fmtPrice(data.estimatedValueHigh ?? null)}
                                </strong>
                            </div>
                        )}
                    </div>
                )}

                {/* For-sale metrics */}
                {!isOffMarket && data.annualTaxes != null && (
                    <div className="property-stats" style={{ marginTop: 6 }}>
                        <span className="property-stat">{fmtPrice(data.annualTaxes)}/yr taxes</span>
                    </div>
                )}

                {taxNote && <div className="property-tax-note">{taxNote}</div>}

                {data.parseWarnings.length > 0 && (
                    <div className="property-warnings">{data.parseWarnings.join(' · ')}</div>
                )}

            </div>
        </div>
    );
}
