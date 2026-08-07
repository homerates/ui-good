'use client';
// app/components/CompactRateChartCard.tsx
// Thin wrapper around the Rates Oracle chart (app/rates-oracle/RatesOracleChart.tsx)
// for embedding directly in the chat card stack — no new chart logic here.
//
// Display-only: the data behind this card is computed with a default 740
// credit score (chat has never collected a real one — see chat/page.tsx's
// rateChart meta field comment), so it is NEVER written back to the session.
// Only a real /rate-intelligence-engine visit does that. The "tap to refine"
// link is how a user corrects the default to their real credit score.

import { RatesOracleChart } from '../rates-oracle/RatesOracleChart';

export interface CompactRateChartData {
    segments: { label: string; seriesId: string; rate: number }[] | null;
    mySegmentId: string | null;
    myRank: number;
    estimated: boolean;
    flagshipRate: number | null;
    flagshipLabel: string | null;
    parRate: number | null;
    sessionId: string;
}

export default function CompactRateChartCard({ data }: { data: CompactRateChartData }) {
    const hasSegments = !!data.segments && data.segments.length > 0;
    const hasFlagship = data.flagshipRate != null && !!data.flagshipLabel && data.parRate != null;
    if (!hasSegments && !hasFlagship) return null;

    return (
        <div style={{
            background: '#0e1420', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '1.1rem 1.25rem', marginTop: 10,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: '0.7rem', color: '#8fa3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    🔮 Where Your Rate Ranks
                </div>
                <a
                    href={`/rates-oracle?sid=${data.sessionId}`}
                    style={{ fontSize: '0.72rem', color: '#00e87a', fontWeight: 700, textDecoration: 'none' }}
                >
                    See full breakdown →
                </a>
            </div>

            <RatesOracleChart
                segments={hasSegments ? data.segments : null}
                mySegmentId={data.mySegmentId}
                myRank={data.myRank}
                estimated={data.estimated}
                flagshipRate={!hasSegments ? data.flagshipRate : null}
                flagshipLabel={!hasSegments ? data.flagshipLabel : null}
                parRate={!hasSegments ? data.parRate : null}
            />

            <p style={{ margin: '10px 0 0', fontSize: '0.68rem', color: '#6b7f94', lineHeight: 1.5 }}>
                Estimated at 740 credit score (chat doesn't collect yours) —{' '}
                <a href={`/rates-oracle?sid=${data.sessionId}`} style={{ color: '#8fa3b8' }}>
                    tap to refine with your real number
                </a>.
            </p>
        </div>
    );
}
