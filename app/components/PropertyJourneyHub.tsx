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
// fallback: a real image (Street View → satellite, via PropertyPhoto's
// existing fallback chain — this component never constructs a Google Maps
// URL itself, per components/CLAUDE.md) animated through a zoom/orbit/
// descend/land keyframe sequence. Once a flyover-video vendor is chosen (or
// deemed not cost-effective — Higgsfield priced out at our likely volume,
// 2026-08-05), a <video> element would play through a comparable duration
// before landing in the same place — not a separate implementation, just a
// different source feeding this sequence. The real "wow" this component
// controls is the code-generated animation itself, not the backing image.

import { useEffect, useState, useMemo } from 'react';
import { motion, useReducedMotion, type Transition } from 'framer-motion';
import PropertyPhoto from './PropertyPhoto';

export interface PropertyJourneyLevel {
  id: 'l1' | 'l2' | 'l3' | 'l4' | 'l5';
  label: string;
  /** null = not yet analyzed. */
  score: number | null;
  href: string;
  /** 0-1 — how relevant this level is right now for this property/person. Drives connector emphasis. */
  relevance: number;
}

interface PropertyJourneyHubProps {
  /** A real listing photo (e.g. Redfin CDN), if the caller has one — takes priority. Falls back to PropertyPhoto's Street View → satellite chain when absent. */
  photoUrl?: string;
  /** Optional — once a flyover-video vendor is wired in, pass its URL here. Falls back to the static-image sequence when absent. */
  flyoverVideoUrl?: string;
  propertyAddress: string;
  levels: PropertyJourneyLevel[];
  onSelectLevel?: (id: PropertyJourneyLevel['id']) => void;
}

const SIZE = 480;
const CENTER = SIZE / 2;
const RADIUS = 180;
const NODE_SIZE = 84;
const CENTER_SIZE = 148;

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

function Connector({ x, y, relevance, reduced }: { x: number; y: number; relevance: number; reduced: boolean }) {
  const strokeWidth = 2 + relevance * 3;
  const strokeOpacity = 0.3 + relevance * 0.5;
  const duration = 3.2 - relevance * 2; // higher relevance = faster pulse
  const dash = 10;

  return (
    <g>
      {/* Static base line — always visible, even under reduced motion */}
      <line x1={CENTER} y1={CENTER} x2={x} y2={y} stroke={ACCENT} strokeOpacity={strokeOpacity * 0.35} strokeWidth={strokeWidth} />
      {/* Animated "energy flowing toward the level" overlay */}
      {!reduced && (
        <motion.line
          x1={CENTER} y1={CENTER} x2={x} y2={y}
          stroke={ACCENT}
          strokeOpacity={strokeOpacity}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${dash * 2.5}`}
          animate={{ strokeDashoffset: [0, -(dash * 3.5)] }}
          transition={{ duration, repeat: Infinity, ease: 'linear' }}
        />
      )}
    </g>
  );
}

function LevelNode({
  level, x, y, selected, mostRelevant, reduced, onSelect,
}: {
  level: PropertyJourneyLevel;
  x: number; y: number;
  selected: boolean;
  mostRelevant: boolean;
  reduced: boolean;
  onSelect: () => void;
}) {
  const springTap: Transition = reduced
    ? { duration: 0.12 }
    : { type: 'spring', stiffness: 380, damping: 14 };

  return (
    <motion.a
      href={level.href}
      onClick={onSelect}
      role="button"
      aria-pressed={selected}
      whileHover={reduced ? { opacity: 0.85 } : { scale: 1.08 }}
      whileTap={reduced ? { opacity: 0.7 } : { scale: 0.94 }}
      animate={selected ? { scale: 1.1 } : { scale: 1 }}
      transition={springTap}
      style={{
        position: 'absolute',
        left: x - NODE_SIZE / 2,
        top: y - NODE_SIZE / 2,
        width: NODE_SIZE,
        height: NODE_SIZE,
        borderRadius: '50%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        textDecoration: 'none',
        background: SURFACE,
        border: `2px solid ${selected || mostRelevant ? ACCENT : 'rgba(255,255,255,0.14)'}`,
        boxShadow: mostRelevant ? '0 0 0 4px rgba(0,232,122,0.12)' : 'none',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: level.score != null ? INK : INK_DIM }}>
        {level.score != null ? level.score : '—'}
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
  );
}

export function PropertyJourneyHub({
  photoUrl, flyoverVideoUrl, propertyAddress, levels, onSelectLevel,
}: PropertyJourneyHubProps) {
  const reducedMotionPref = useReducedMotion();
  const reduced = !!reducedMotionPref;
  const [phase, setPhase] = useState<'flyover' | 'settled'>(reduced ? 'settled' : 'flyover');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (reduced) setPhase('settled');
  }, [reduced]);

  const mostRelevantId = useMemo(
    () => levels.reduce((best, l) => (l.relevance > (levels.find(x => x.id === best)?.relevance ?? -1) ? l.id : best), levels[0]?.id),
    [levels],
  );

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, margin: '0 auto' }}>
      {/* ── Flyover / property image — same element serves as entrance and center ── */}
      <motion.div
        initial={reduced ? false : { scale: 2.2, x: 60, y: -40, rotate: 6, opacity: 0.4, filter: 'blur(6px)' }}
        animate={reduced ? { scale: 1, opacity: 1 } : {
          scale: phase === 'flyover' ? [2.2, 1.7, 1.15, 1] : 1,
          x: phase === 'flyover' ? [60, -30, 10, 0] : 0,
          y: phase === 'flyover' ? [-40, 10, -6, 0] : 0,
          rotate: phase === 'flyover' ? [6, -3, 1, 0] : 0,
          opacity: 1,
          filter: phase === 'flyover' ? ['blur(6px)', 'blur(2px)', 'blur(0px)', 'blur(0px)'] : 'blur(0px)',
        }}
        transition={reduced ? { duration: 0.2 } : { duration: 2.2, times: [0, 0.4, 0.75, 1], ease: 'easeInOut' }}
        onAnimationComplete={() => { if (phase === 'flyover') setPhase('settled'); }}
        style={{
          position: 'absolute',
          left: CENTER - CENTER_SIZE / 2,
          top: CENTER - CENTER_SIZE / 2,
          width: CENTER_SIZE,
          height: CENTER_SIZE,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `3px solid ${ACCENT}`,
          zIndex: 2,
        }}
      >
        {flyoverVideoUrl ? (
          <video src={flyoverVideoUrl} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onEnded={() => setPhase('settled')} />
        ) : photoUrl ? (
          <img src={photoUrl} alt={propertyAddress} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <PropertyPhoto address={propertyAddress} width={CENTER_SIZE} height={CENTER_SIZE} style={{ width: '100%', height: '100%' }} />
        )}
        {/* Ambient "breathing" ring — center, at rest only */}
        {!reduced && phase === 'settled' && (
          <motion.div
            animate={{ opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `2px solid ${ACCENT}`, pointerEvents: 'none' }}
          />
        )}
      </motion.div>

      {/* ── Connectors + level nodes — fade in once the flyover has landed ── */}
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: phase === 'settled' ? 1 : 0 }}
        transition={{ duration: 0.5 }}
        style={{ position: 'absolute', inset: 0, pointerEvents: phase === 'settled' ? 'auto' : 'none' }}
      >
        <svg width={SIZE} height={SIZE} style={{ position: 'absolute', inset: 0 }}>
          {levels.map((level, i) => {
            const { x, y } = levelPosition(i, levels.length);
            return <Connector key={level.id} x={x} y={y} relevance={level.relevance} reduced={reduced} />;
          })}
        </svg>
        {levels.map((level, i) => {
          const { x, y } = levelPosition(i, levels.length);
          return (
            <LevelNode
              key={level.id}
              level={level}
              x={x} y={y}
              selected={selectedId === level.id}
              mostRelevant={level.id === mostRelevantId}
              reduced={reduced}
              onSelect={() => { setSelectedId(level.id); onSelectLevel?.(level.id); }}
            />
          );
        })}
      </motion.div>
    </div>
  );
}
