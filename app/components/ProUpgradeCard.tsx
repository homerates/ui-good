'use client';

// app/components/ProUpgradeCard.tsx
// Inline upgrade prompt rendered in the chat thread when a Pro-gated feature is triggered.

import Link from 'next/link';

export type ProGatePayload = {
    feature: string;
    featureKey: string;
    description: string;
};

const FEATURE_BULLETS: Record<string, string[]> = {
    cma: [
        'Live rent estimate — Redfin & AI analysis',
        'Cap rate analysis (35% expense model)',
        'DSCR ratio at investor rate (rate + 1.25%)',
        'Monthly cash flow & cash-on-cash return',
        'Full Investment Intelligence Panel',
        'Comps from Redfin · Tavily & AI Analysis',
    ],
};

const DEFAULT_BULLETS = [
    'Full AI property analysis',
    'Live market data + investment metrics',
    'Unlimited reports',
];

export default function ProUpgradeCard({ feature, featureKey, description }: ProGatePayload) {
    const bullets = FEATURE_BULLETS[featureKey] ?? DEFAULT_BULLETS;

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0e1420 0%, #111827 100%)',
            border: '1px solid rgba(255,215,0,0.25)',
            borderRadius: 16,
            padding: '24px 24px 20px',
            maxWidth: 520,
            marginTop: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,215,0,0.08)',
            fontFamily: 'var(--font-dm-sans, system-ui, sans-serif)',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{
                    background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                    color: '#1a0a00',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '3px 10px',
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                }}>
                    ⭐ Pro Feature
                </span>
            </div>

            {/* Feature name */}
            <h3 style={{
                margin: '0 0 8px',
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.3,
            }}>
                {feature}
            </h3>

            {/* Description */}
            <p style={{
                margin: '0 0 18px',
                fontSize: '0.875rem',
                color: 'rgba(185,208,192,0.8)',
                lineHeight: 1.6,
            }}>
                {description}
            </p>

            {/* Feature bullet list */}
            <div style={{ marginBottom: 20 }}>
                <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,215,0,0.6)',
                    marginBottom: 10,
                }}>
                    Included in Pro — $19/mo
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {bullets.map((b) => (
                        <li key={b} style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            fontSize: '0.825rem',
                            color: 'rgba(224,240,232,0.85)',
                            lineHeight: 1.4,
                        }}>
                            <span style={{ color: '#00e87a', flexShrink: 0, marginTop: 1, fontSize: 12 }}>✓</span>
                            {b}
                        </li>
                    ))}
                </ul>
            </div>

            {/* CTA */}
            <Link
                href="/pricing"
                style={{
                    display: 'block',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                    color: '#1a0a00',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    textAlign: 'center',
                    padding: '13px 20px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    transition: 'opacity 0.15s, transform 0.15s',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'; (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; }}
            >
                Unlock Pro — $19/mo →
            </Link>

            {/* Already subscribed hint */}
            <p style={{
                margin: '12px 0 0',
                fontSize: '0.75rem',
                color: 'rgba(185,208,192,0.45)',
                textAlign: 'center',
            }}>
                Already subscribed?{' '}
                <Link href="/pricing" style={{ color: 'rgba(0,232,122,0.6)', textDecoration: 'none' }}>
                    Sign in to unlock
                </Link>
            </p>
        </div>
    );
}
