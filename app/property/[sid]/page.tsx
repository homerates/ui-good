'use client';
// app/property/[sid]/page.tsx
// Canonical route for PropertyJourneyHub (Build 6) — reads a real
// buyer_evaluation_sessions row and renders the radial "front door" that,
// until now, only ever existed with sample data (app/property-hub-demo).
//
// Read-only: no session mutation happens here. Every level links to
// /track5?session={sid} rather than re-deriving track5's own per-level
// scenario-aware deep links a second time — track5 already has those.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppNav from '../../components/AppNav';
import { PropertyJourneyHub, type PropertyJourneyLevel } from '../../components/PropertyJourneyHub';
import { verdict } from '../../../lib/scoring/decisionScore';

interface SessionRow {
    id: string;
    property_address: string | null;
    composite_score: number | null;
    l1_score: number | null; l1_summary: string | null;
    l2_score: number | null; l2_summary: string | null;
    l3_score: number | null; l3_summary: string | null;
    l4_score: number | null; l4_summary: string | null;
    l5_score: number | null; l5_summary: string | null;
}

type EmptyStateKind = 'unauthorized' | 'not-found';

const LEVEL_META = [
    { id: 'l1', label: 'Financial Readiness' },
    { id: 'l2', label: 'Property Evaluation' },
    { id: 'l3', label: 'Market Intelligence' },
    { id: 'l4', label: 'Location Intelligence' },
    { id: 'l5', label: 'Rate Intelligence' },
] as const;

// Same tier boundaries verdict() already uses — reuses the app's
// established "score quality" language rather than a new scale.
function relevanceFor(score: number | null): number {
    if (score == null) return 0.9;
    if (score < 40) return 0.75;
    if (score < 55) return 0.6;
    if (score < 70) return 0.45;
    if (score < 85) return 0.3;
    return 0.15;
}

function EmptyState({ kind }: { kind: EmptyStateKind }) {
    const copy = kind === 'unauthorized'
        ? { title: 'Sign in to view this property journey', body: 'This page belongs to a signed-in account.', ctaHref: '/sign-in', ctaLabel: '→ Sign in' }
        : { title: "We couldn't find that session", body: 'It may have been deleted, or you may not have access to it.', ctaHref: '/my-home', ctaLabel: '→ Go to My Home' };
    return (
        <div className="page-standalone" style={{ background: '#080c12', minHeight: '100vh' }}>
            <AppNav />
            <main style={{ maxWidth: 480, margin: '0 auto', padding: '4rem 1.25rem', textAlign: 'center' as const, color: '#f0f4ff' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔮</div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{copy.title}</div>
                <div style={{ fontSize: '0.875rem', color: '#8fa3b8', marginBottom: 18 }}>{copy.body}</div>
                <a href={copy.ctaHref} style={{ color: '#00e87a', fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none' }}>{copy.ctaLabel}</a>
            </main>
        </div>
    );
}

export default function PropertyJourneyPage() {
    const params = useParams();
    const sid = Array.isArray(params?.sid) ? params.sid[0] : (params?.sid as string | undefined);

    const [session, setSession] = useState<SessionRow | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
    const [emptyState, setEmptyState] = useState<EmptyStateKind | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!sid) return;
        fetch(`/api/buyer-sessions/${sid}`)
            .then(async r => {
                if (r.status === 401) { setEmptyState('unauthorized'); return; }
                if (!r.ok) { setEmptyState('not-found'); return; }
                const { session: row } = await r.json();
                if (!row) { setEmptyState('not-found'); return; }
                setSession(row);
            })
            .catch(() => setEmptyState('not-found'))
            .finally(() => setLoading(false));
    }, [sid]);

    // Progressive photo upgrade — real listing photo when available, otherwise
    // PropertyJourneyHub's own PropertyPhoto (Street View → satellite) fallback.
    useEffect(() => {
        if (!session?.property_address) return;
        fetch('/api/property/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: session.property_address }),
        })
            .then(r => r.ok ? r.json() : null)
            .then(lj => { if (lj?.ok && lj.data?.photoUrl) setPhotoUrl(lj.data.photoUrl as string); })
            .catch(() => { /* PropertyJourneyHub's own fallback covers this */ });
    }, [session?.property_address]);

    if (emptyState) return <EmptyState kind={emptyState} />;
    if (loading || !session) {
        return (
            <div className="page-standalone" style={{ background: '#080c12', minHeight: '100vh' }}>
                <AppNav />
                <main style={{ maxWidth: 480, margin: '0 auto', padding: '4rem 1.25rem', textAlign: 'center' as const, color: '#8fa3b8' }}>
                    Loading your property journey…
                </main>
            </div>
        );
    }

    const levels: PropertyJourneyLevel[] = LEVEL_META.map(({ id, label }) => {
        const score = session[`${id}_score` as const];
        const summary = session[`${id}_summary` as const];
        return {
            id,
            label,
            score,
            href: `/track5?session=${sid}`,
            relevance: relevanceFor(score),
            summary,
        };
    });

    const v = session.composite_score != null ? verdict(session.composite_score) : null;

    return (
        <div className="page-standalone" style={{ background: '#080c12', minHeight: '100vh' }}>
            <AppNav />
            <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.25rem 4rem', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#f0f4ff' }}>
                <div style={{ marginBottom: 8, textAlign: 'center' as const }}>
                    <div style={{ fontSize: '0.68rem', color: '#8fa3b8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
                        Your Homeownership Intelligence
                    </div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>{session.property_address ?? 'Your scenario'}</h1>
                    <div style={{ fontSize: '0.78rem', color: '#8fa3b8', marginTop: 4 }}>
                        Decision Levels for your primary wealth asset
                    </div>
                    {v && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '6px 14px', borderRadius: 10, background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.28)' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: v.color }}>{v.label}</span>
                        </div>
                    )}
                </div>
                <div style={{ marginTop: 24 }}>
                    <PropertyJourneyHub
                        propertyAddress={session.property_address ?? ''}
                        photoUrl={photoUrl}
                        levels={levels}
                        compositeScore={session.composite_score}
                    />
                </div>
            </main>
        </div>
    );
}
