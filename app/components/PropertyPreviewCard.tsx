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

export default function PropertyPreviewCard({ data }: { data: PropertyCardData }) {
    const sourceName = SOURCE_LABEL[data.source] ?? data.source;
    const hasPhoto = !!data.photoUrl;

    const taxNote =
        data.taxSource === 'scraped'
            ? 'Property taxes from listing'
            : data.taxSource === 'table'
            ? `Estimated taxes (${data.state ?? 'state'} avg)`
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
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </div>
            )}

            <div className="property-info">
                {/* Price + source badge */}
                <div className="property-header-row">
                    <span className="property-price">{fmtPrice(data.price)}</span>
                    <a
                        href={data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="property-source-badge"
                    >
                        {sourceName} ↗
                    </a>
                </div>

                {/* Address */}
                {data.address && (
                    <div className="property-address">{data.address}</div>
                )}

                {/* Beds / baths / sqft */}
                <div className="property-stats">
                    {data.beds != null && (
                        <span className="property-stat">{fmtNum(data.beds)} bd</span>
                    )}
                    {data.baths != null && (
                        <span className="property-stat">{fmtNum(data.baths, 1)} ba</span>
                    )}
                    {data.sqft != null && (
                        <span className="property-stat">{fmtNum(data.sqft)} sqft</span>
                    )}
                    {data.annualTaxes != null && (
                        <span className="property-stat">{fmtPrice(data.annualTaxes)}/yr taxes</span>
                    )}
                </div>

                {/* Tax source note */}
                {taxNote && (
                    <div className="property-tax-note">{taxNote}</div>
                )}

                {/* Parse warnings (debug, only shown if non-empty) */}
                {data.parseWarnings.length > 0 && (
                    <div className="property-warnings">
                        {data.parseWarnings.join(' · ')}
                    </div>
                )}
            </div>
        </div>
    );
}
