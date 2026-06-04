// lib/tokens.ts
// Single source of truth for design system colors used in JS/TSX.
// Mirrors the CSS custom properties in app/globals.css :root.
// Import this wherever a card or component needs a hex color constant.

export const COLORS = {
    accent:      '#00e87a',   // green — primary brand accent (= var(--accent))
    blue:        '#3d8bff',   // info blue / P&I bar
    orange:      '#ff8c42',   // high-balance zone / warm warning
    red:         '#ff5f5f',   // jumbo zone / danger
    amber:       '#f59e0b',   // FHA + buydown card accent
    teal:        '#14b8a6',   // VA card accent
    indigo:      '#6366f1',   // loan amount section
    emerald:     '#10b981',   // refi savings track
    emeraldDark: '#059669',   // refi strong savings
    danger:      '#ef4444',   // hard red (LTV danger)
    purple:      '#a78bfa',   // jumbo / super-jumbo tier
} as const;
