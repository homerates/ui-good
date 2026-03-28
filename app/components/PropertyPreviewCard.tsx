'use client';

// app/components/PropertyPreviewCard.tsx
// Displays a scraped property listing snapshot — photo, address, price, beds/baths/sqft, tax note.
// Rendered in the chat when a user pastes a Zillow/Redfin URL.

import React from 'react';

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
    const sourceName = SOURCE_LABEL[data.source] ?? data.source;
    const hasPhoto   = !!data.photoUrl;
    const status     = data.listingStatus && data.listingStatus !== 'UNKNOWN' ? STATUS_CONFIG[data.listingStatus] : null;
    const isOffMarket = data.listingStatus === 'OFF_MARKET' || data.listingStatus === 'SOLD';

    const taxNote =
        data.taxSource === 'scraped' ? 'Property taxes from listing'
        : data.taxSource === 'table' ? `Estimated taxes (${data.state ?? 'state'} avg)`
        : null;

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
