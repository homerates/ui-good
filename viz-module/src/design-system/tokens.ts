// Design system tokens — colors, type scale, spacing, and motion presets shared across every
// module in this presentation layer (Payment Composition Explorer today; Offer Comparison Tool,
// Readiness Coaching, etc. later). Change a value here, not in an individual component.
//
// Consumed two ways:
//   1. Tailwind reads `colors`/`fontSizes` at build time (see tailwind.config.ts) so components
//      can use utility classes like `bg-brand-600`.
//   2. Components import `motion`/`colors` directly where a raw value is needed — Recharts and
//      Framer Motion take style/props objects, not Tailwind classes, so chart fills, stroke
//      colors, and animation variants reference these constants directly instead of a second,
//      independently-maintained set of numbers.

// ── Color ────────────────────────────────────────────────────────────────────
// Semantic names, not "blue-500" — a future contributor swapping the brand palette should never
// need to touch a component file. `chart` is a distinct semantic group: chart series colors are
// chosen for sequential/categorical legibility (colorblind-safe-ish spacing), not brand emphasis.
// `brand.600` (#00e87a) is HomeRates' actual accent color — matches `var(--accent)` in
// app/globals.css and COLORS.accent in lib/tokens.ts. Do not swap this back to a generic
// blue "primary" default; this module is meant to look like HomeRates, not a chart-library demo.
export const colors = {
  brand: {
    50: '#e8fdf3',
    100: '#c3fadf',
    300: '#5cf0ac',
    500: '#0dec8a',
    600: '#00e87a',
    700: '#00b862',
  },
  neutral: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    400: '#94a3b8',
    600: '#475569',
    800: '#1e293b',
    900: '#0f172a',
  },
  semantic: {
    good: '#16a34a',      // e.g. "within typical range"
    warning: '#d97706',   // e.g. "outside typical range" — a data-quality flag, NEVER a lender/product judgment
    info: '#2563eb',
  },
  // Payment-composition series — principal/interest/tax/insurance/PMI/HOA each get a fixed,
  // stable color so the same category always reads the same way across every chart in the module.
  chart: {
    principal: '#2563eb',
    interest: '#93c5fd',
    taxes: '#16a34a',
    insurance: '#d97706',
    pmi: '#a855f7',
    hoa: '#64748b',
  },
} as const;

// ── Type scale ───────────────────────────────────────────────────────────────
export const fontSizes = {
  xs: ['0.75rem', { lineHeight: '1rem' }],
  sm: ['0.875rem', { lineHeight: '1.25rem' }],
  base: ['1rem', { lineHeight: '1.5rem' }],
  lg: ['1.125rem', { lineHeight: '1.75rem' }],
  xl: ['1.25rem', { lineHeight: '1.75rem' }],
  '2xl': ['1.5rem', { lineHeight: '2rem' }],
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
} as const;

// ── Motion ───────────────────────────────────────────────────────────────────
// Framer Motion owns UI chrome (cards, tooltips, panel transitions); Recharts owns
// chart-internal transitions (its own animationDuration/easing props, kept in sync with
// `durationMs.base` below so a slider-driven chart update and its surrounding UI move at the
// same tempo). See README "Animation ownership" for the full split.
export const motion = {
  durationMs: {
    fast: 150,   // hover states, small value ticks
    base: 300,   // card mount/unmount, tooltip fade
    slow: 500,   // chart-adjacent transitions (kept in step with Recharts' animationDuration)
  },
  easing: {
    standard: [0.4, 0, 0.2, 1] as const,
    decelerate: [0, 0, 0.2, 1] as const,
  },
  variants: {
    fadeInUp: {
      hidden: { opacity: 0, y: 8 },
      visible: { opacity: 1, y: 0 },
    },
    popIn: {
      hidden: { opacity: 0, scale: 0.96 },
      visible: { opacity: 1, scale: 1 },
    },
  },
} as const;

export const spacing = {
  card: '1.25rem',
  section: '2rem',
} as const;
