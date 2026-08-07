'use client';

import {
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  ReferenceDot,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { OBMMI_CITATION } from '../../lib/market-data/registry';

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

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Custom hover card: real segment criteria + the exact OBMMI methodology line,
// not a generic recharts tooltip — this is the "citation on hover" surface.
function SegmentTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { label: string; rate: number; isMine: boolean };
  return (
    <div style={{
      background: '#0e1420', border: `1px solid ${d.isMine ? YOURS_FILL : NEUTRAL_STROKE}`,
      borderRadius: 8, padding: '10px 12px', maxWidth: 240,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: d.isMine ? YOURS_FILL : '#f0f4ff', marginBottom: 2 }}>
        {d.label}{d.isMine ? ' (yours)' : ''}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#f0f4ff', marginBottom: 6 }}>
        {d.rate.toFixed(3)}%
      </div>
      <div style={{ fontSize: 10, color: AXIS_INK, lineHeight: 1.5 }}>
        OBMMI, via FRED release 473 — a real observed daily rate-lock average, not an estimate.
      </div>
    </div>
  );
}

function RankedSegmentChart({ segments, mySegmentId, myRank }: {
  segments: ConformingSegment[];
  mySegmentId: string | null | undefined;
  myRank: number;
}) {
  const rates = segments.map(s => s.rate);
  const mid = median(rates);
  const spread = Math.max(...rates) - Math.min(...rates) || 0.01;
  // sigma sized so the widest-spread segment sits at roughly 15% of peak height —
  // a stylistic envelope, not a claim about loan volume or population density.
  const sigma = spread / 2.5;

  const data = [...segments]
    .sort((a, b) => a.rate - b.rate)
    .map(s => ({
      label: shortLabel(s.label),
      seriesId: s.seriesId,
      rate: s.rate,
      isMine: s.seriesId === mySegmentId,
      weight: Math.exp(-((s.rate - mid) ** 2) / (2 * sigma * sigma)),
    }));
  const mine = data.find(d => d.isMine);

  return (
    <div>
      {myRank > 0 && (
        <p style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#e6edf3' }}>
          Your segment ranks <strong style={{ color: YOURS_FILL }}>{ordinal(myRank)}</strong> of{' '}
          {segments.length} OBMMI credit/LTV tiers today, at <strong style={{ color: YOURS_FILL }}>{mine?.rate.toFixed(3)}%</strong>.
        </p>
      )}
      <div style={{ height: 220, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              type="number"
              dataKey="rate"
              domain={['dataMin - 0.05', 'dataMax + 0.05']}
              tickFormatter={(v: number) => `${v.toFixed(2)}%`}
              stroke={AXIS_INK}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide domain={[0, 1.15]} />
            <Tooltip content={<SegmentTooltip />} cursor={{ stroke: NEUTRAL_STROKE, strokeDasharray: '3 3' }} />
            <Area
              type="natural"
              dataKey="weight"
              stroke={NEUTRAL_STROKE}
              strokeWidth={1.5}
              fill="url(#oracleFade)"
              isAnimationActive
              animationDuration={600}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                return (
                  <circle
                    key={payload.seriesId}
                    cx={cx} cy={cy}
                    r={payload.isMine ? 5 : 3}
                    fill={payload.isMine ? YOURS_FILL : NEUTRAL_FILL}
                    stroke={payload.isMine ? YOURS_FILL : NEUTRAL_STROKE}
                    strokeWidth={payload.isMine ? 2 : 1}
                  />
                );
              }}
            />
            <defs>
              <linearGradient id="oracleFade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={YOURS_FILL} stopOpacity={0.18} />
                <stop offset="100%" stopColor={YOURS_FILL} stopOpacity={0} />
              </linearGradient>
            </defs>
            {mine && (
              <ReferenceDot x={mine.rate} y={mine.weight} r={0} label={{
                value: '↓ yours', position: 'top', fill: YOURS_FILL, fontSize: 11, fontWeight: 700,
              }} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: AXIS_INK, lineHeight: 1.5 }}>
        Each point is a real OBMMI credit/LTV tier observed today — curve shape shows how far
        each sits from today's median rate, not loan volume. Hover a point for its exact criteria.
        Green = your segment.
      </p>
      <p style={{ margin: '6px 0 0', fontSize: '0.66rem', color: AXIS_INK, lineHeight: 1.5, opacity: 0.75 }}>
        {OBMMI_CITATION}
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
            <Tooltip content={<SegmentTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="rate" radius={4} barSize={20} isAnimationActive animationDuration={500}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.isMine ? YOURS_FILL : NEUTRAL_FILL} stroke={d.isMine ? YOURS_FILL : NEUTRAL_STROKE} />
              ))}
              <LabelList dataKey="rate" position="right" formatter={(v) => `${Number(v).toFixed(3)}%`} style={{ fontSize: 11, fill: '#f0f4ff' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: '0.66rem', color: AXIS_INK, lineHeight: 1.5, opacity: 0.75 }}>
        {OBMMI_CITATION}
      </p>
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
