// lib/property/qualityCheck.ts
// Hard data checklist for every property lookup.
// Defines exactly which fields are required per listing status,
// scores completeness 0-100, and logs alerts to Vercel function logs.
// A 'fail' means data is unreliable and the user will see wrong numbers.

export interface QualityReport {
    score:   number;                    // 0–100, 100 = fully complete
    status:  'pass' | 'warn' | 'fail'; // fail = critical field missing
    errors:  string[];                  // critical — data is wrong or absent
    warnings: string[];                 // non-critical — data is incomplete
}

type Snapshot = Record<string, unknown>;

// ── Checklist definitions ───────────────────────────────────────────────────

interface FieldDef {
    label:    string;
    weight:   number;  // points deducted from 100 when missing
    critical: boolean; // critical = 'fail' status, not just 'warn'
}

const UNIVERSAL_FIELDS: Record<string, FieldDef> = {
    price:         { label: 'Price',          weight: 20, critical: true  },
    address:       { label: 'Address',         weight: 20, critical: true  },
    listingStatus: { label: 'Listing Status',  weight: 15, critical: true  },
    beds:          { label: 'Bedrooms',        weight:  8, critical: false },
    baths:         { label: 'Bathrooms',       weight:  8, critical: false },
    sqft:          { label: 'Square Footage',  weight:  8, critical: false },
    photoUrl:      { label: 'Property Photo',  weight:  5, critical: false },
    annualTaxes:   { label: 'Annual Taxes',    weight:  3, critical: false },
};

// FOR_SALE / PENDING: Redfin AVM is important but not critical (price = listing price)
const FOR_SALE_FIELDS: Record<string, FieldDef> = {
    estimatedValue: { label: 'Redfin AVM',      weight: 8, critical: false },
    daysOnMarket:   { label: 'Days on Market',   weight: 3, critical: false },
};

// SOLD / OFF_MARKET: AVM or sold price is CRITICAL — without one, price shown is wrong
const SOLD_FIELDS: Record<string, FieldDef> = {
    estimatedValue: { label: 'Redfin AVM',       weight: 0,  critical: false }, // checked as pair below
    lastSalePrice:  { label: 'Sold Price',        weight: 0,  critical: false }, // checked as pair below
    lastSaleDate:   { label: 'Last Sale Date',    weight: 5,  critical: false },
};

// ── Main checker ─────────────────────────────────────────────────────────────

export function checkPropertyQuality(data: Snapshot, source: string): QualityReport {
    const errors:   string[] = [];
    const warnings: string[] = [];
    let deducted = 0;
    const status = (data.listingStatus as string | null) ?? null;

    // 1. Universal fields — required for every status
    for (const [key, def] of Object.entries(UNIVERSAL_FIELDS)) {
        const val = data[key];
        if (val === null || val === undefined || val === '') {
            deducted += def.weight;
            (def.critical ? errors : warnings).push(`Missing: ${def.label}`);
        }
    }

    // 2. Status-specific fields
    const isSold = status === 'SOLD' || status === 'OFF_MARKET';
    const isActive = status === 'FOR_SALE' || status === 'PENDING';

    if (isActive) {
        for (const [key, def] of Object.entries(FOR_SALE_FIELDS)) {
            const val = data[key];
            if (val === null || val === undefined) {
                deducted += def.weight;
                (def.critical ? errors : warnings).push(`Missing: ${def.label}`);
            }
        }
    }

    if (isSold) {
        // Both missing = critical failure — SOLD property will display wrong price
        const hasValue = data.lastSalePrice != null || data.estimatedValue != null;
        if (!hasValue) {
            deducted += 25;
            errors.push('CRITICAL: No sold price AND no Redfin AVM — SOLD property will show original listing price (wrong)');
        } else {
            // At least one present — check the other as a warning
            if (data.lastSalePrice == null) warnings.push('Missing: Sold Price (have AVM as fallback)');
            if (data.estimatedValue == null) warnings.push('Missing: Redfin AVM (have Sold Price as fallback)');
        }

        for (const [key, def] of Object.entries(SOLD_FIELDS)) {
            if (def.weight === 0) continue; // handled above as pair
            const val = data[key];
            if (val === null || val === undefined) {
                deducted += def.weight;
                (def.critical ? errors : warnings).push(`Missing: ${def.label}`);
            }
        }
    }

    // 3. Price sanity check
    if (data.price != null) {
        const p = data.price as number;
        if (p < 50_000 || p > 50_000_000) {
            deducted += 15;
            errors.push(`Price $${p.toLocaleString()} is outside valid range ($50k – $50M)`);
        }
    }

    // 4. SOLD price consistency — price should equal lastSalePrice or estimatedValue
    if (isSold && data.price != null && (data.lastSalePrice != null || data.estimatedValue != null)) {
        const correctPrice = (data.lastSalePrice ?? data.estimatedValue) as number;
        const diff = Math.abs((data.price as number) - correctPrice);
        const pctDiff = diff / correctPrice;
        if (pctDiff > 0.05) { // >5% drift
            errors.push(`Price drift: displayed $${(data.price as number).toLocaleString()} vs correct $${correctPrice.toLocaleString()} (${Math.round(pctDiff * 100)}% off) — normalizePropertyPrice may not have run`);
            deducted += 10;
        }
    }

    const score        = Math.max(0, 100 - deducted);
    const qualityStatus: QualityReport['status'] =
        errors.length > 0   ? 'fail' :
        warnings.length > 0 ? 'warn' : 'pass';

    // ── Alert logging (visible in Vercel function logs) ─────────────────────
    const icon = qualityStatus === 'pass' ? '✅' : qualityStatus === 'warn' ? '⚠️' : '❌';
    const addr = (data.address as string | null) ?? 'unknown address';

    console.log(
        `[PROPERTY QUALITY] ${icon} ${qualityStatus.toUpperCase()} | score=${score}/100 | source=${source} | status=${status ?? 'null'} | "${addr}"`
    );
    if (errors.length)   console.log('[PROPERTY QUALITY] ERRORS  :', errors);
    if (warnings.length) console.log('[PROPERTY QUALITY] warnings:', warnings);

    return { score, status: qualityStatus, errors, warnings };
}
