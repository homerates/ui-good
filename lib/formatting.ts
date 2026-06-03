/**
 * lib/formatting.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical display-formatting helpers for mortgage / financial values.
 *
 * Import from here — do NOT copy-paste into components or route handlers.
 * All functions are pure (no side effects, no React imports).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Re-use one formatter instance to avoid repeated object construction
const _usd = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
});

// ── Dollar formats ────────────────────────────────────────────────────────────

/** Full dollar: $1,234,567  (rounds to nearest dollar, no cents) */
export function formatDollars(n: number): string {
    return _usd.format(Math.round(n));
}

/**
 * Short dollar: $875k, $1.5M, or full dollar if < $100k.
 * Trims trailing zeros from M suffix: $1.500M → $1.5M.
 */
export function formatDollarsShort(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return formatDollars(n);
}

/** Monthly: $1,234/mo */
export function formatMonthly(n: number): string {
    return `${formatDollars(n)}/mo`;
}

/** Yearly: $1,234/yr */
export function formatYearly(n: number): string {
    return `${formatDollars(n)}/yr`;
}

// ── Percentage formats ────────────────────────────────────────────────────────

/** 1 decimal: 6.5% */
export function formatPct(n: number): string {
    return `${n.toFixed(1)}%`;
}

/** 2 decimal: 6.50% */
export function formatPct2(n: number): string {
    return `${n.toFixed(2)}%`;
}

/** 3 decimal: 6.500% (rates) */
export function formatPct3(n: number): string {
    return `${n.toFixed(3)}%`;
}

// ── Time formats ──────────────────────────────────────────────────────────────

/** Months with unit: "18 months" */
export function formatMonths(n: number): string {
    return `${Math.ceil(n)} months`;
}

/** Years with 1 decimal: "8.3 yrs" */
export function formatYears(n: number): string {
    return `${n.toFixed(1)} yrs`;
}

// ── Short aliases ─────────────────────────────────────────────────────────────
// Used by cardBuilders.ts (short names) and card components (fmt$ names).
// New code should prefer the verbose names above for clarity.

export const f$      = formatDollars;
export const fK      = formatDollarsShort;
export const fPct    = formatPct2;
export const fPct1   = formatPct;
export const fMo     = formatMonths;
export const fYr     = formatYears;

export const fmt$    = formatDollars;
export const fmtK    = formatDollarsShort;
export const fmtRate = formatPct2;
