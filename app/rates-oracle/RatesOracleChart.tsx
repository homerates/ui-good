'use client';

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';

interface ConformingSegment {
  label: string;
  seriesId: string;
  rate: number;
}

interface RatesOracleChartProps {
  /** Conventional path: 10 real OBMMI credit/LTV segments, already sorted ascending by rate. */
  segments?: ConformingSegment[] | null;
  mySegmentId?: string | null;
  myRank?: number;
  /** Flagship path (fha/va/jumbo): a single national OBMMI average vs. the FRED 30yr par rate. */
  flagshipRate?: number | null;
  flagshipLabel?: string | null;
  parRate?: number | null;
}

const NEUTRAL_FILL = 'rgba(255,255,255,0.14)';
const NEUTRAL_STROKE = 'rgba(255,255,255,0.28)';
const YOURS_FILL = '#00e87a';
const AXIS_INK = '#8fa3b8';
const GRID_STROKE = 'rgba(255,255,255,0.07)';

// Segment labels come from lib/market-data/registry.ts as e.g.
// "30Y Conforming: LTV<=80, FICO<680" — strip the constant prefix so the
// Y-axis reads as a compact "LTV<=80, FICO<680" across all 10 rows.
function shortLabel(label: string): string {
  return label.replace(/^30Y Conforming:\s*/, '');
}

function RankedSegmentChart({ segments, mySegmentId, myRank }: {
  segments: ConformingSegment[];
  mySegmentId: string | null | undefined;
  myRank: number;
}) {
  const data = segments.map(s => ({
    label: shortLabel(s.label),
    seriesId: s.seriesId,
    rate: s.rate,
    isMine: s.seriesId === mySegmentId,
  }));

  return (
    <div>
      {myRank > 0 && (
        <p style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#e6edf3' }}>
          Your segment ranks <strong style={{ color: YOURS_FILL }}>{ordinal(myRank)}</strong> of{' '}
          {segments.length} OBMMI credit/LTV tiers today — highlighted below.
        </p>
      )}
      <div style={{ height: 320, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
            <XAxis
              type="number"
              domain={['dataMin - 0.1', 'dataMax + 0.1']}
              tickFormatter={(v: number) => `${v.toFixed(2)}%`}
              stroke={AXIS_INK}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              stroke={AXIS_INK}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(3)}%`, 'Rate']}
              contentStyle={{ background: '#0e1420', border: `1px solid ${NEUTRAL_STROKE}`, borderRadius: 8, color: '#f0f4ff' }}
              labelStyle={{ color: '#f0f4ff' }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar dataKey="rate" radius={4} barSize={16} isAnimationActive animationDuration={500}>
              {data.map(d => (
                <Cell key={d.seriesId} fill={d.isMine ? YOURS_FILL : NEUTRAL_FILL} stroke={d.isMine ? YOURS_FILL : NEUTRAL_STROKE} />
              ))}
              <LabelList
                dataKey="rate"
                position="right"
                formatter={(v) => `${Number(v).toFixed(3)}%`}
                style={{ fontSize: 11, fill: '#f0f4ff' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: AXIS_INK, lineHeight: 1.5 }}>
        Green bar = your credit/LTV segment. Gray bars = the other 9 OBMMI-tracked conforming
        tiers, all real observed rates today, not estimates.
      </p>
    </div>
  );
}

function FlagshipChart({ flagshipRate, flagshipLabel, parRate }: {
  flagshipRate: number;
  flagshipLabel: string;
  parRate: number;
}) {
  const data = [
    { label: `${flagshipLabel} average today`, rate: flagshipRate, isMine: true },
    { label: '30yr conventional national average', rate: parRate, isMine: false },
  ];
  return (
    <div>
      <p style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#e6edf3' }}>
        {flagshipLabel} is a single national average — there's no credit/LTV segmentation to
        rank against, so here it is against the broader conventional market for context.
      </p>
      <div style={{ height: 140, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
            <XAxis
              type="number"
              domain={['dataMin - 0.1', 'dataMax + 0.1']}
              tickFormatter={(v: number) => `${v.toFixed(2)}%`}
              stroke={AXIS_INK}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis type="category" dataKey="label" width={190} stroke={AXIS_INK} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(3)}%`, 'Rate']}
              contentStyle={{ background: '#0e1420', border: `1px solid ${NEUTRAL_STROKE}`, borderRadius: 8, color: '#f0f4ff' }}
              labelStyle={{ color: '#f0f4ff' }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar dataKey="rate" radius={4} barSize={20} isAnimationActive animationDuration={500}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.isMine ? YOURS_FILL : NEUTRAL_FILL} stroke={d.isMine ? YOURS_FILL : NEUTRAL_STROKE} />
              ))}
              <LabelList dataKey="rate" position="right" formatter={(v) => `${Number(v).toFixed(3)}%`} style={{ fontSize: 11, fill: '#f0f4ff' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function RatesOracleChart(props: RatesOracleChartProps) {
  const { segments, mySegmentId, myRank = 0, flagshipRate, flagshipLabel, parRate } = props;

  if (segments && segments.length > 0) {
    return <RankedSegmentChart segments={segments} mySegmentId={mySegmentId} myRank={myRank} />;
  }
  if (flagshipRate != null && flagshipLabel && parRate != null) {
    return <FlagshipChart flagshipRate={flagshipRate} flagshipLabel={flagshipLabel} parRate={parRate} />;
  }
  return null;
}
