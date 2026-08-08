'use client';
// app/components/PropertyJourneyHub.tsx
// Radial "front door" for the 5 existing decisioning levels (L1-L5) — visualizes
// data handed to it and deep-links into the real L1-L5 pages that already exist
// (chat, check-property, property-intel, rate-intelligence-engine). Owns no
// scoring logic and fetches nothing, matching the canonical-route proposal: the
// duplicate-formula mess across those 5 pages is a separate cleanup, not
// something this component tries to resolve.
//
// The flyover entrance is deliberately the SAME code path as the graceful
// fallback: a wide satellite/map view (location context — PropertyMap,
// already-enabled Static Maps API) cross-fades into the Street View photo of
// the actual home (PropertyPhoto's existing fallback chain) partway through
// one continuous zoom/orbit/descend/land camera move — this component never
// constructs a Google Maps URL itself, per components/CLAUDE.md.
//
// Visual/interaction polish pass (post-Build-6): composite score ring around
// the photo, continuous score-driven color banding on the ring/nodes (layered
// on top of, not replacing, verdict()'s discrete label thresholds elsewhere in
// the app), connector energy that dims away from whatever's selected, and a
// click-to-expand detail card using each level's real deterministic summary
// text (l1_summary..l5_summary — never AI-generated, so no AIDisclosureTag
// belongs here per lib/disclosures.ts's own scoping rule). No trend arrows or
// wealth-impact dollar figures: no score-history table exists anywhere in this
// schema to compute a real one from, and inventing one would violate this
// codebase's data-grounding rule.

import { useEffect, useState, useMemo } from 'react';
import { motion, animate, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import PropertyPhoto from './PropertyPhoto';
import PropertyMap from './PropertyMap';

export interface PropertyJourneyLevel {
  id: 'l1' | 'l2' | 'l3' | 'l4' | 'l5';
  label: string;
  /** null = not yet analyzed. */
  score: number | null;
  href: string;
  /** 0-1 — how relevant this level is right now for this property/person. Drives connector emphasis. */
  relevance: number;
  /** Real deterministic "why this score" text (session l*_summary) — optional, used for hover/expand content. */
  summary?: string | null;
}

interface PropertyJourneyHubProps {
  /** A real listing photo (e.g. Redfin CDN), if the caller has one — takes priority. Falls back to PropertyPhoto's Street View → satellite chain when absent. */
  photoUrl?: string;
  /** Optional — once a flyover-video vendor is wired in, pass its URL here. Falls back to the static-image sequence when absent. */
  flyoverVideoUrl?: string;
  propertyAddress: string;
  levels: PropertyJourneyLevel[];
  /** Overall composite score — drives the ring around the photo. Absent = no ring shown. */
  compositeScore?: number | null;
  onSelectLevel?: (id: PropertyJourneyLevel['id']) => void;
}

const SIZE = 480;
const CENTER = SIZE / 2;
const RADIUS = 180;
const NODE_SIZE = 84;
const CENTER_SIZE = 148;
const RING_SIZE = CENTER_SIZE + 22;
const STAGGER_STEP = 0.09;

const ACCENT = '#00e87a';
const INK = '#f0f4ff';
const INK_DIM = '#8fa3b8';
const SURFACE = '#0e1420';

function levelPosition(index: number, total: number) {
  const angleDeg = -90 + (360 / total) * index;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + RADIUS * Math.cos(angleRad),
    y: CENTER + RADIUS * Math.sin(angleRad),
  };
}

// ── Continuous score → color (red → amber → yellow-green → green) ──────────
// A smooth visual gradient layered on top of verdict()'s existing discrete
// label thresholds (lib/scoring/decisionScore.ts) — labels stay categorical,
// this is purely for ring/glow/node color so the treatment reads as continuous
// rather than a 3-tier traffic light.
const SCORE_STOPS: [number, number, number, number][] = [
  [0, 0, 85, 66],     // red    ~ #f87171
  [40, 40, 92, 58],   // amber  ~ #fbbf24
  [70, 100, 55, 52],  // yellow-green transitional
  [100, 152, 90, 45], // green  ~ #00e87a
];

function scoreColor(score: number | null | undefined, alpha = 1): string {
  if (score == null) return `rgba(255,255,255,${(0.14 * alpha).toFixed(3)})`;
  const s = Math.max(0, Math.min(100, score));
  let lo = SCORE_STOPS[0], hi = SCORE_STOPS[SCORE_STOPS.length - 1];
  for (let i = 0; i < SCORE_STOPS.length - 1; i++) {
    if (s >= SCORE_STOPS[i][0] && s <= SCORE_STOPS[i + 1][0]) { lo = SCORE_STOPS[i]; hi = SCORE_STOPS[i + 1]; break; }
  }
  const t = hi[0] === lo[0] ? 0 : (s - lo[0]) / (hi[0] - lo[0]);
  const h = lo[1] + (hi[1] - lo[1]) * t;
  const sat = lo[2] + (hi[2] - lo[2]) * t;
  const l = lo[3] + (hi[3] - lo[3]) * t;
  return `hsl(${h.toFixed(0)} ${sat.toFixed(0)}% ${l.toFixed(0)}% / ${alpha})`;
}

/** Ticks a level's score up from 0 once it appears — reads as "the system just computed this," not a static label. */
function CountUpScore({ value, active, reduced }: { value: number | null; active: boolean; reduced: boolean }) {
  const [display, setDisplay] = useState(reduced || !active ? (value ?? 0) : 0);

  useEffect(() => {
    if (value == null) return;
    if (reduced || !active) { setDisplay(value); return; }
    const controls = animate(0, value, {
      duration: 1,
      ease: 'easeOut',
      delay: 0.15,
      onUpdate: v => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, active, reduced]);

  return <>{value != null ? display : '—'}</>;
}

// ── Composite ring around the photo — same stroke-dasharray progress-ring
// technique already used in app/report/[token]/page.tsx's CircleGauge, kept
// consistent with that pattern rather than inventing a new one. Animated via
// the same imperative animate() CountUpScore already uses so the ring fills
// in lockstep with the number.
function CompositeRing({ score, active, reduced }: { score: number | null | undefined; active: boolean; reduced: boolean }) {
  const strokeW = 6;
  const r = RING_SIZE / 2 - strokeW / 2 - 1;
  const circ = 2 * Math.PI * r;
  const target = score != null ? Math.max(0, Math.min(100, score)) : 0;
  const [filled, setFilled] = useState(reduced || !active ? circ * (target / 100) : 0);

  useEffect(() => {
    if (score == null) return;
    if (reduced || !active) { setFilled(circ * (target / 100)); return; }
    const controls = animate(0, target, {
      duration: 1,
      ease: 'easeOut',
      delay: 0.15,
      onUpdate: v => setFilled(circ * (v / 100)),
    });
    return () => controls.stop();
  }, [target, active, reduced, circ, score]);

  if (score == null) return null;
  const color = scoreColor(score);

  return (
    <svg
      width={RING_SIZE} height={RING_SIZE}
      style={{ position: 'absolute', left: -( (RING_SIZE - CENTER_SIZE) / 2 ), top: -( (RING_SIZE - CENTER_SIZE) / 2 ), transform: 'rotate(-90deg)', pointerEvents: 'none' }}
    >
      <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW} />
      <circle
        cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={circ - filled}
      />
    </svg>
  );
}

function Connector({ x, y, relevance, reduced, delay, visible, dimmed }: {
  x: number; y: number; relevance: number; reduced: boolean; delay: number; visible: boolean; dimmed: boolean;
}) {
  const dimFactor = dimmed ? 0.32 : 1;
  const strokeWidth = (2 + relevance * 3) * (dimmed ? 0.75 : 1);
  const strokeOpacity = (0.35 + relevance * 0.55) * dimFactor;
  const duration = (3.2 - relevance * 2) * (dimmed ? 1.7 : 1); // higher relevance = faster pulse; dimmed slows it further
  const dash = 10;
  const gradId = `hub-connector-grad-${x.toFixed(0)}-${y.toFixed(0)}`;

  return (
    <motion.g
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={reduced ? { duration: 0.2 } : { delay, duration: 0.5 }}
      style={{ transition: 'opacity 0.3s ease' }}
    >
      <defs>
        <linearGradient id={gradId} x1={CENTER} y1={CENTER} x2={x} y2={y} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={ACCENT} stopOpacity={strokeOpacity * 0.15} />
          <stop offset="1" stopColor={ACCENT} stopOpacity={strokeOpacity} />
        </linearGradient>
      </defs>
      {/* Static gradient base — always visible, even under reduced motion */}
      <line x1={CENTER} y1={CENTER} x2={x} y2={y} stroke={`url(#${gradId})`} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Animated "energy flowing toward the level" overlay */}
      {!reduced && (
        <motion.line
          x1={CENTER} y1={CENTER} x2={x} y2={y}
          stroke={ACCENT}
          strokeOpacity={strokeOpacity}
          strokeWidth={Math.max(1, strokeWidth - 1)}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${dash * 2.5}`}
          animate={{ strokeDashoffset: [0, -(dash * 3.5)] }}
          transition={{ duration, repeat: Infinity, ease: 'linear' }}
        />
      )}
    </motion.g>
  );
}

function LevelNode({
  level, selected, mostRelevant, reduced, active, hovered, onSelect, onHoverStart, onHoverEnd,
}: {
  level: PropertyJourneyLevel;
  selected: boolean;
  mostRelevant: boolean;
  reduced: boolean;
  active: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const springTap: Transition = reduced
    ? { duration: 0.12 }
    : { type: 'spring', stiffness: 380, damping: 14 };
  const nodeColor = scoreColor(level.score);

  return (
    <>
      <motion.a
        href={level.href}
        onClick={(e) => {
          // Let modifier/middle clicks behave natively (open in new tab, etc.)
          // — only plain clicks open the in-place detail card.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onSelect();
        }}
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
        role="button"
        aria-pressed={selected}
        whileHover={reduced ? { opacity: 0.85 } : { scale: 1.08 }}
        whileTap={reduced ? { opacity: 0.7 } : { scale: 0.94 }}
        animate={selected ? { scale: 1.1 } : { scale: 1 }}
        transition={springTap}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          textDecoration: 'none',
          background: SURFACE,
          border: `2px solid ${selected ? nodeColor : nodeColor}`,
          boxShadow: selected
            ? `0 0 0 4px ${scoreColor(level.score, 0.2)}, 0 6px 18px rgba(0,0,0,0.45)`
            : mostRelevant
              ? '0 0 0 4px rgba(0,232,122,0.12), 0 6px 18px rgba(0,0,0,0.45)'
              : '0 6px 18px rgba(0,0,0,0.45)',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: level.score != null ? INK : INK_DIM, fontVariantNumeric: 'tabular-nums' }}>
          <CountUpScore value={level.score} active={active} reduced={reduced} />
        </span>
        <span style={{ fontSize: '0.55rem', fontWeight: 700, color: INK_DIM, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', lineHeight: 1.15, padding: '0 4px' }}>
          {level.label}
        </span>
        {mostRelevant && (
          <span style={{ position: 'absolute', bottom: -18, fontSize: '0.58rem', fontWeight: 700, color: ACCENT, whiteSpace: 'nowrap' }}>
            → Next step
          </span>
        )}
      </motion.a>
      {/* Continuous gentle invitation on the current "next step" node — same
          breathing pattern as the center photo's ambient ring, not just a
          one-time static label. */}
      {mostRelevant && active && !reduced && (
        <motion.div
          animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.07, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `2px solid ${ACCENT}`, pointerEvents: 'none' }}
        />
      )}
      {/* Hover preview — desktop progressive enhancement, real summary text only. */}
      <AnimatePresence>
        {hovered && !reduced && level.summary && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
              width: 176, background: SURFACE, border: `1px solid ${scoreColor(level.score, 0.45)}`,
              borderRadius: 10, padding: '9px 11px', fontSize: '0.66rem', color: INK_DIM, lineHeight: 1.45,
              pointerEvents: 'none', zIndex: 6, textAlign: 'center',
              boxShadow: '0 10px 24px rgba(0,0,0,0.45)',
            }}
          >
            {level.summary}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Click-to-expand detail card — progressive disclosure, never navigates
// away from the Hub on its own; "Go deeper" is the only thing that leaves. ──
function LevelDetailCard({ level, onClose }: { level: PropertyJourneyLevel; onClose: () => void }) {
  const color = scoreColor(level.score);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(5,8,15,0.72)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '78%', background: SURFACE, border: `1px solid ${color}`,
          borderRadius: 16, padding: '20px 20px 18px', textAlign: 'center',
          boxShadow: '0 20px 48px rgba(0,0,0,0.55)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: INK_DIM, fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1, padding: 4 }}
        >
          ×
        </button>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: INK_DIM, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          {level.label}
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>
          {level.score ?? '—'}
        </div>
        {level.summary && (
          <div style={{ fontSize: '0.78rem', color: INK, lineHeight: 1.55, marginBottom: 16 }}>
            {level.summary}
          </div>
        )}
        <a
          href={level.href}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: ACCENT, fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none' }}
        >
          Go deeper ↗
        </a>
      </motion.div>
    </motion.div>
  );
}

export function PropertyJourneyHub({
  photoUrl, flyoverVideoUrl, propertyAddress, levels, compositeScore, onSelectLevel,
}: PropertyJourneyHubProps) {
  const reducedMotionPref = useReducedMotion();
  const reduced = !!reducedMotionPref;
  const [phase, setPhase] = useState<'flyover' | 'settled'>(reduced ? 'settled' : 'flyover');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (reduced) setPhase('settled');
  }, [reduced]);

  const mostRelevantId = useMemo(
    () => levels.reduce((best, l) => (l.relevance > (levels.find(x => x.id === best)?.relevance ?? -1) ? l.id : best), levels[0]?.id),
    [levels],
  );

  const settled = phase === 'settled';
  const selectedLevel = selectedId ? levels.find(l => l.id === selectedId) ?? null : null;

  return (
    <div className="pjh-scale-wrap">
      <style>{`
        .pjh-scale-wrap { width: ${SIZE}px; margin: 0 auto; }
        @media (max-width: 520px) {
          .pjh-scale-wrap { transform: scale(0.78); transform-origin: top center; margin-bottom: -105px; }
        }
        @media (max-width: 400px) {
          .pjh-scale-wrap { transform: scale(0.66); margin-bottom: -163px; }
        }
      `}</style>
      <div
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          margin: '0 auto',
          background: 'radial-gradient(circle at center, rgba(0,232,122,0.07), transparent 65%)',
          borderRadius: '50%',
        }}
      >
        {/* ── Flyover / property image — same element serves as entrance and center ── */}
        <motion.div
          // Isolated wrapper for hover tilt — kept separate from the flyover
          // motion.div below, which already drives its own multi-stage
          // keyframe `animate`. Mixing an interaction-driven whileHover onto
          // that same element previously fought its explicit animate array
          // and silently broke completion callbacks (see codebase history);
          // this wrapper avoids that class of bug entirely.
          whileHover={reduced ? undefined : { rotateX: -4, rotateY: 4, scale: 1.015 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          style={{
            position: 'absolute',
            left: CENTER - CENTER_SIZE / 2,
            top: CENTER - CENTER_SIZE / 2,
            width: CENTER_SIZE,
            height: CENTER_SIZE,
            perspective: 800,
            zIndex: 2,
          }}
        >
          <motion.div
            initial={reduced ? false : { scale: 2.2, x: 60, y: -40, rotate: 6, opacity: 0.4, filter: 'blur(6px) saturate(1.15) contrast(1.08)' }}
            animate={reduced ? { scale: 1, opacity: 1 } : {
              scale: phase === 'flyover' ? [2.2, 1.7, 1.15, 1] : 1,
              x: phase === 'flyover' ? [60, -30, 10, 0] : 0,
              y: phase === 'flyover' ? [-40, 10, -6, 0] : 0,
              rotate: phase === 'flyover' ? [6, -3, 1, 0] : 0,
              opacity: 1,
              filter: phase === 'flyover'
                ? ['blur(6px) saturate(1.15) contrast(1.08)', 'blur(2px) saturate(1.15) contrast(1.08)', 'blur(0px) saturate(1.15) contrast(1.08)', 'blur(0px) saturate(1.15) contrast(1.08)']
                : 'blur(0px) saturate(1.15) contrast(1.08)',
            }}
            transition={reduced ? { duration: 0.2 } : { duration: 2.2, times: [0, 0.4, 0.75, 1], ease: 'easeInOut' }}
            onAnimationComplete={() => { if (phase === 'flyover') setPhase('settled'); }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              overflow: 'hidden',
              border: `3px solid ${compositeScore != null ? scoreColor(compositeScore) : ACCENT}`,
              boxShadow: `0 0 44px ${scoreColor(compositeScore, 0.28)}, 0 24px 48px rgba(0,0,0,0.5)`,
            }}
          >
            {flyoverVideoUrl ? (
              <video src={flyoverVideoUrl} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onEnded={() => setPhase('settled')} />
            ) : (
              <>
                {/* Stage 1 — wide location context, visible at the start of the flyover, fades out mid-sequence. */}
                {!reduced && phase === 'flyover' && (
                  <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: [1, 1, 0, 0] }}
                    transition={{ duration: 2.2, times: [0, 0.4, 0.75, 1], ease: 'easeInOut' }}
                    style={{ position: 'absolute', inset: 0 }}
                  >
                    <PropertyMap address={propertyAddress} variant="thumbnail" mapType="satellite" zoom={14} width={CENTER_SIZE} height={CENTER_SIZE} style={{ width: '100%', height: '100%' }} />
                  </motion.div>
                )}
                {/* Stage 2 — the actual home, fades in mid-sequence, remains as the permanent center. */}
                <motion.div
                  initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                  animate={reduced ? { opacity: 1 } : { opacity: [0, 0, 1, 1] }}
                  transition={reduced ? { duration: 0.2 } : { duration: 2.2, times: [0, 0.4, 0.75, 1], ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: 0 }}
                >
                  {photoUrl ? (
                    <img src={photoUrl} alt={propertyAddress} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <PropertyPhoto address={propertyAddress} width={CENTER_SIZE} height={CENTER_SIZE} style={{ width: '100%', height: '100%' }} />
                  )}
                </motion.div>
              </>
            )}
            {/* Vignette — pulls focus toward the center, reads as depth rather than a flat cutout */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(circle, transparent 45%, rgba(0,0,0,0.45) 100%)',
            }} />
            {/* Ambient "breathing" ring — center, at rest only. Color + amplitude
                follow the composite score so a stronger score reads as a
                marginally more pronounced glow, not just a static accent. */}
            {!reduced && phase === 'settled' && (
              <motion.div
                animate={{ opacity: compositeScore != null && compositeScore >= 70 ? [0.55, 0.95, 0.55] : [0.5, 0.85, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `2px solid ${compositeScore != null ? scoreColor(compositeScore) : ACCENT}`, pointerEvents: 'none' }}
              />
            )}
          </motion.div>
          {/* Composite score ring — sits just outside the photo's own border/glow. */}
          {compositeScore != null && <CompositeRing score={compositeScore} active={settled} reduced={reduced} />}
        </motion.div>

        {/* ── Connectors — each staggers in as its level node reveals ── */}
        <svg width={SIZE} height={SIZE} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {levels.map((level, i) => {
            const { x, y } = levelPosition(i, levels.length);
            return (
              <Connector
                key={level.id} x={x} y={y} relevance={level.relevance} reduced={reduced}
                delay={i * STAGGER_STEP}
                visible={settled}
                dimmed={selectedId != null && selectedId !== level.id}
              />
            );
          })}
        </svg>

        {/* ── Level nodes — staggered spring-in, one after another around the circle ── */}
        {levels.map((level, i) => {
          const { x, y } = levelPosition(i, levels.length);
          return (
            <motion.div
              key={level.id}
              initial={reduced ? false : { opacity: 0, scale: 0.4 }}
              animate={settled ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
              transition={reduced ? { duration: 0.2 } : { delay: i * STAGGER_STEP, type: 'spring', stiffness: 260, damping: 20 }}
              style={{
                position: 'absolute',
                left: x - NODE_SIZE / 2,
                top: y - NODE_SIZE / 2,
                width: NODE_SIZE,
                height: NODE_SIZE,
                pointerEvents: settled ? 'auto' : 'none',
              }}
            >
              <LevelNode
                level={level}
                selected={selectedId === level.id}
                mostRelevant={level.id === mostRelevantId}
                reduced={reduced}
                active={settled}
                hovered={hoveredId === level.id}
                onSelect={() => { setSelectedId(level.id); onSelectLevel?.(level.id); }}
                onHoverStart={() => setHoveredId(level.id)}
                onHoverEnd={() => setHoveredId(null)}
              />
            </motion.div>
          );
        })}

        {/* ── Progressive disclosure overlay — never navigates on its own ── */}
        <AnimatePresence>
          {selectedLevel && <LevelDetailCard level={selectedLevel} onClose={() => setSelectedId(null)} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
