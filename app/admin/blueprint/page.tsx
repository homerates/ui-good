'use client';
// app/admin/blueprint/page.tsx
// Full system architecture blueprint — scrollable engineering drawing.
// Shows all entry points, card registry, data pipeline, scoring engine,
// output surfaces, and linking between components.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminStatus } from '../../hooks/useAdminStatus';
import { CARD_REGISTRY, toggleAdminCardLabels, useAdminCardLabels } from '../../components/AdminCardBadge';

// ── Color tokens (blueprint aesthetic) ───────────────────────────────────────
const BP = {
  bg:       '#0a1628',
  grid:     'rgba(0,160,255,0.07)',
  border:   'rgba(0,180,255,0.25)',
  border2:  'rgba(0,180,255,0.12)',
  cyan:     '#00c8ff',
  cyan2:    '#7ee8fa',
  white:    '#e8f4ff',
  dim:      'rgba(232,244,255,0.45)',
  dim2:     'rgba(232,244,255,0.2)',
  accent:   '#ff6b35',
  green:    '#00e87a',
  yellow:   '#fbbf24',
  red:      '#f87171',
  purple:   '#a78bfa',
  box:      'rgba(0,80,160,0.25)',
  boxBrd:   'rgba(0,180,255,0.3)',
};

const MONO = "'DM Mono', 'Courier New', monospace";
const SANS = "system-ui, -apple-system, sans-serif";

// ── Reusable blueprint box ────────────────────────────────────────────────────
function Box({ title, code, color = BP.cyan, children, width, minHeight }: {
  title: string; code?: string; color?: string;
  children?: React.ReactNode; width?: number | string; minHeight?: number;
}) {
  return (
    <div style={{
      background: BP.box, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '10px 14px',
      width: width ?? 'auto', minHeight: minHeight ?? 'auto',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: children ? 8 : 0 }}>
        {code && (
          <span style={{ fontFamily: MONO, fontSize: '0.58rem', fontWeight: 800, color: BP.accent,
            background: `${BP.accent}20`, border: `1px solid ${BP.accent}50`,
            borderRadius: 3, padding: '1px 6px' }}>{code}</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 700, color: color, letterSpacing: '0.06em' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function Row({ children, gap = 12, wrap = false }: { children: React.ReactNode; gap?: number; wrap?: boolean }) {
  return <div style={{ display: 'flex', gap, alignItems: 'flex-start', flexWrap: wrap ? 'wrap' : 'nowrap', overflowX: wrap ? 'visible' : 'auto', paddingBottom: wrap ? 0 : 8 }}>{children}</div>;
}

function Label({ children, color }: { children: React.ReactNode; color?: string }) {
  return <div style={{ fontFamily: MONO, fontSize: '0.55rem', color: color ?? BP.dim2, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{children}</div>;
}

function Bullet({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
      <span style={{ color: color ?? BP.cyan, marginTop: 2, flexShrink: 0, fontSize: '0.6rem' }}>▸</span>
      <span style={{ fontFamily: SANS, fontSize: '0.65rem', color: BP.dim, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '8px 0', gap: 2 }}>
      {label && <span style={{ fontFamily: MONO, fontSize: '0.52rem', color: BP.dim2, letterSpacing: '0.08em' }}>{label}</span>}
      <div style={{ width: 2, height: 20, background: `${BP.cyan}60` }} />
      <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${BP.cyan}60` }} />
    </div>
  );
}

function HRule() {
  return <div style={{ height: 1, background: BP.grid, margin: '24px 0' }} />;
}

function SectionHeader({ num, title, sub }: { num: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: '0.65rem', color: BP.accent, fontWeight: 800 }}>{num}</span>
        <span style={{ fontFamily: MONO, fontSize: '0.9rem', fontWeight: 700, color: BP.white, letterSpacing: '0.04em' }}>{title}</span>
      </div>
      {sub && <div style={{ fontFamily: SANS, fontSize: '0.72rem', color: BP.dim, marginTop: 4, marginLeft: 36 }}>{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BlueprintPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAdminStatus();
  const labelsActive = useAdminCardLabels();
  const [labelState, setLabelState] = useState(labelsActive);

  if (loading) return null;
  if (!isAdmin) { router.push('/'); return null; }

  const handleToggleLabels = () => {
    const next = toggleAdminCardLabels();
    setLabelState(next);
  };

  return (
    <div className="page-standalone" style={{ background: BP.bg, minHeight: '100vh', fontFamily: SANS, color: BP.white,
      backgroundImage: `linear-gradient(${BP.grid} 1px, transparent 1px), linear-gradient(90deg, ${BP.grid} 1px, transparent 1px)`,
      backgroundSize: '32px 32px', width: '100%', boxSizing: 'border-box' }}>

      {/* ── Top bar ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: `${BP.bg}f0`,
        borderBottom: `1px solid ${BP.border2}`, padding: '10px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(8px)',
        width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/admin')} style={{ background: 'none', border: `1px solid ${BP.border2}`, borderRadius: 6, color: BP.dim, fontSize: '0.72rem', padding: '5px 12px', cursor: 'pointer', fontFamily: MONO }}>← Admin</button>
          <div>
            <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: BP.cyan, letterSpacing: '0.1em' }}>HOMERATES.AI</span>
            <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: BP.dim2, marginLeft: 12 }}>SYSTEM ARCHITECTURE · REV 2026.05</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleToggleLabels} style={{
            background: labelState ? `${BP.accent}22` : 'none',
            border: `1px solid ${labelState ? BP.accent : BP.border2}`,
            borderRadius: 6, color: labelState ? BP.accent : BP.dim,
            fontSize: '0.7rem', padding: '5px 14px', cursor: 'pointer', fontFamily: MONO,
          }}>
            {labelState ? '● Card Labels ON' : '○ Card Labels OFF'}
          </button>
          <a href="/admin/blueprint" target="_blank" style={{ background: 'none', border: `1px solid ${BP.border2}`, borderRadius: 6, color: BP.dim, fontSize: '0.72rem', padding: '5px 12px', cursor: 'pointer', fontFamily: MONO, textDecoration: 'none' }}>↗ Full screen</a>
        </div>
      </div>

      {/* ── Blueprint content — full width, horizontal scroll for wide sections ── */}
      <div style={{ padding: '40px 48px 120px', width: '100%', boxSizing: 'border-box', overflowX: 'auto' }}>

        {/* Title block */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: '1.6rem', fontWeight: 800, color: BP.cyan, letterSpacing: '0.04em', lineHeight: 1.1 }}>
              HOMERATES.AI
            </div>
            <div style={{ fontFamily: MONO, fontSize: '0.9rem', color: BP.white, letterSpacing: '0.08em', marginTop: 4 }}>
              SYSTEM ARCHITECTURE BLUEPRINT
            </div>
            <div style={{ fontFamily: MONO, fontSize: '0.62rem', color: BP.dim2, marginTop: 8, letterSpacing: '0.06em' }}>
              CONSUMER INTELLIGENCE PLATFORM · FULL COMPONENT SCHEMA · PROCESS FLOW
            </div>
          </div>
          <div style={{ border: `1px solid ${BP.border2}`, borderRadius: 6, padding: '12px 18px', textAlign: 'right', minWidth: 200 }}>
            <div style={{ fontFamily: MONO, fontSize: '0.55rem', color: BP.dim2, letterSpacing: '0.1em', marginBottom: 6 }}>DRAWING INFO</div>
            {[['REV', '2026.05.29'],['SCALE', 'SCHEMATIC'],['DRAWN BY', 'CLAUDE'],['STATUS', 'PRODUCTION']].map(([k,v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
                <span style={{ fontFamily: MONO, fontSize: '0.58rem', color: BP.dim2 }}>{k}</span>
                <span style={{ fontFamily: MONO, fontSize: '0.58rem', color: BP.cyan }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <HRule />

        {/* ═══════════════════════════════════════════════════════════════
            SECTION A — ENTRY POINTS
        ═══════════════════════════════════════════════════════════════ */}
        <SectionHeader num="A" title="CONSUMER ENTRY POINTS"
          sub="All paths a consumer or professional can use to begin an analysis" />

        <Row gap={12}>
          {[
            { label: 'A-01 CHAT', desc: 'Paste Redfin/Zillow URL or type address. Fires property_lookup intent → 4 cards simultaneously (PPC + ISC + IQC + DSC).', color: BP.green, url: '/chat' },
            { label: 'A-02 MY HOME', desc: 'Add a saved property. "Run My Numbers" seeds chat with address-only → property_lookup. "View Intel Report" → property-intel.', color: BP.green, url: '/my-home' },
            { label: 'A-03 INSTANT', desc: 'Paste-and-score surface. No login. Runs full pipeline (lookup → Grok → L1-L4) → score card + report link. Also partner API demo.', color: BP.cyan, url: '/instant' },
            { label: 'A-04 API', desc: 'POST /api/instant-score. Returns full L1-L4 JSON + report URL. Partner-facing. $29/month + credits.', color: BP.cyan, url: '/developers' },
            { label: 'A-05 CHECK PROPERTY', desc: 'Direct navigation with price/down/rate URL params. Fires ISC + IQC with pre-loaded scenario. No chat session.', color: BP.yellow, url: '/check-property' },
            { label: 'A-06 PROPERTY INTEL', desc: 'Deep analysis surface. Shows Grok intel, comps, L3/L4 scores, DSC CTA. Gated: Build Report requires Full Market Analysis first.', color: BP.purple, url: '/property-intel' },
          ].map(e => (
            <Box key={e.label} title={e.label} color={e.color} width={200} minHeight={120}>
              <div style={{ fontFamily: SANS, fontSize: '0.62rem', color: BP.dim, lineHeight: 1.5, marginBottom: 8 }}>{e.desc}</div>
              <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: '0.55rem', color: e.color, textDecoration: 'none' }}>{e.url} ↗</a>
            </Box>
          ))}
        </Row>

        <Arrow label="PROPERTY DATA PIPELINE" />

        {/* ═══════════════════════════════════════════════════════════════
            SECTION B — DATA PIPELINE
        ═══════════════════════════════════════════════════════════════ */}
        <SectionHeader num="B" title="DATA PIPELINE"
          sub="Property data acquisition, enrichment, and intelligence generation" />

        <Row gap={12}>
          <Box title="B-01 PROPERTY LOOKUP" code="/api/property/lookup" color={BP.yellow} width={260}>
            <Label>Inputs</Label>
            <Bullet>Redfin URL → Redfin script parser</Bullet>
            <Bullet>Address → Tavily search → Redfin URL → same path</Bullet>
            <Label>Processing</Label>
            <Bullet>Regex parsers (price, beds, baths, sqft, tax)</Bullet>
            <Bullet>GPT-4o structured extraction (fills gaps, extracts zillow views, saves, redfinViews)</Bullet>
            <Bullet color={BP.accent}>Computes socialProofScore + interestLevel from DOM velocity + view counts</Bullet>
            <Label>Outputs</Label>
            <Bullet>PropertyCardData: price, address, specs, photo, social proof</Bullet>
          </Box>

          <Box title="B-02 FRED® LIVE RATES" code="api.stlouisfed.org" color={BP.yellow} width={200}>
            <Label>Source</Label>
            <Bullet>Federal Reserve Bank of St. Louis</Bullet>
            <Label>Data</Label>
            <Bullet>30yr fixed (PMMS weekly)</Bullet>
            <Bullet>15yr fixed, 5/1 ARM</Bullet>
            <Bullet>10yr treasury, fed funds</Bullet>
            <Bullet>CPI, core PCE, housing starts</Bullet>
            <Label>Used by</Label>
            <Bullet>ISC, IQC, calcEngine, reports</Bullet>
          </Box>

          <Box title="B-03 GROK DEEP ANALYSIS" code="/api/beta/grok-property" color={BP.yellow} width={260}>
            <Label>Inputs</Label>
            <Bullet>Address + Redfin data snapshot</Bullet>
            <Bullet>Tavily web search (comps, market data)</Bullet>
            <Label>Processing</Label>
            <Bullet>Multi-model: Grok (xAI) + OpenAI + Claude</Bullet>
            <Bullet>Streams result via SSE</Bullet>
            <Label>Outputs (for L3 + L4 scoring)</Label>
            <Bullet>market_median_dom, market_sale_to_list, market_median_price</Bullet>
            <Bullet>location_intelligence (overall_score, sub_scores, wildfire)</Bullet>
            <Bullet>comparable_sales, zillow_estimate, redfin_estimate</Bullet>
            <Bullet>grok_intelligence_summary, buyer_strategy</Bullet>
          </Box>

          <Box title="B-04 CALC ENGINE" code="lib/calcEngine.ts" color={BP.yellow} width={220}>
            <Label>Type: Deterministic (no LLM)</Label>
            <Bullet>calcConventional, calcFHA, calcVA, calcJumbo</Bullet>
            <Bullet>calcAffordability, calcDSCR, calcRefi</Bullet>
            <Label>Inputs</Label>
            <Bullet>price, downPct, rate, term, taxRate, insRate, annualIncome, monthlyDebts</Bullet>
            <Label>Outputs</Label>
            <Bullet>pi, tax, ins, pmi/MIP, PITI, DTI, totalInterest, PMI removal date</Bullet>
          </Box>
        </Row>

        <Arrow label="CARD ASSEMBLY" />

        {/* ═══════════════════════════════════════════════════════════════
            SECTION C — CARD REGISTRY
        ═══════════════════════════════════════════════════════════════ */}
        <SectionHeader num="C" title="CARD REGISTRY"
          sub="All modular display blocks — assembled by the chat pipeline or rendered directly on pages" />

        {/* Property Lookup 4-card set */}
        <div style={{ border: `1px dashed ${BP.border2}`, borderRadius: 8, padding: '14px', marginBottom: 14 }}>
          <Label color={BP.green}>PROPERTY LOOKUP SET — fires together when address/URL is pasted in chat</Label>
          <Row gap={10}>
            {['PPC-001','ISC-002','IQC-003','DSC-004'].map(code => {
              const c = CARD_REGISTRY[code];
              return (
                <Box key={code} title={c.name} code={code} color={BP.green} width={230}>
                  <Bullet color={BP.dim2}>Family: {c.family}</Bullet>
                  <Bullet color={BP.dim2}>Trigger: {c.trigger}</Bullet>
                  <Bullet>Outputs: {c.outputs}</Bullet>
                </Box>
              );
            })}
          </Row>
        </div>

        {/* Other scenario cards */}
        <div style={{ border: `1px dashed ${BP.border2}`, borderRadius: 8, padding: '14px' }}>
          <Label color={BP.yellow}>STANDALONE SCENARIO CARDS — fire individually based on intent detection</Label>
          <Row gap={10}>
            {['DSCR-005','BD-006','REFI-007','GK-008','AFFD-009','CMA-010'].map(code => {
              const c = CARD_REGISTRY[code];
              return (
                <Box key={code} title={c.name} code={code} color={BP.yellow} width={200}>
                  <Bullet color={BP.dim2}>Family: {c.family}</Bullet>
                  <Bullet color={BP.dim2}>Trigger: {c.trigger}</Bullet>
                  <Bullet>Outputs: {c.outputs}</Bullet>
                </Box>
              );
            })}
          </Row>
        </div>

        <Arrow label="SCORING ENGINE" />

        {/* ═══════════════════════════════════════════════════════════════
            SECTION D — TRACK 5 SCORING
        ═══════════════════════════════════════════════════════════════ */}
        <SectionHeader num="D" title="TRACK 5 — AUTONOMOUS DECISION SCORE"
          sub="Composite Decision Score = L1–L4 only. Rate Intelligence and Personal Fit are separate, peer, first-class outputs — neither is part of the composite and neither is 'L5' (locked product decision, 2026-08-19; see below)." />

        <Row gap={10}>
          {[
            { lvl: 'L1', name: 'Financial Readiness', wt: '35%', color: BP.green,
              inputs: 'LTV, loan type (Conventional/FHA/VA/Jumbo), down%, DTI (if provided)',
              formula: 'Per-program LTV curve (Conv/FHA/VA/Jumbo each distinct) + DTI adj (≤28:+10, ≤36:+6, ≤43:0, ≤49:-7, 50+:-15). HomeRates scoring heuristic, not a republished agency threshold.',
              source: 'lib/scoring/decisionScore.ts — scoreL1()',
            },
            { lvl: 'L2', name: 'Property Evaluation', wt: '25%', color: BP.cyan,
              inputs: 'List price, AVM (avg of Zillow + Redfin when both available)',
              formula: 'AVM premium: <-5%→92, <0%→84, <3%→76, <7%→65, <12%→52, <20%→38, else→22',
              source: 'lib/scoring/decisionScore.ts — scoreL2() + resolveAvm()',
            },
            { lvl: 'L3', name: 'Market Intelligence', wt: '25%', color: BP.yellow,
              inputs: 'market_median_dom, market_sale_to_list, days_on_market, socialProofScore, zillowViews, redfinRank',
              formula: 'DOM score + S/L score avg, blended with socialProofScore at 35% weight when available',
              source: 'lib/scoring/decisionScore.ts — scoreL3()',
            },
            { lvl: 'L4', name: 'Location Intelligence', wt: '15%', color: BP.purple,
              inputs: 'walk_score, school_score, commute, neighborhood_appreciation_3yr, wildfire risk',
              formula: 'location_intelligence.overall_score (Grok wildfire-aware) or manual sub-score average',
              source: 'lib/scoring/decisionScore.ts — scoreL4()',
            },
          ].map(l => (
            <Box key={l.lvl} title={`${l.lvl} — ${l.name}`} color={l.color} width={220} minHeight={160}>
              <div style={{ fontFamily: MONO, fontSize: '0.58rem', color: l.color, marginBottom: 6 }}>WEIGHT: {l.wt}</div>
              <Label>Inputs</Label>
              <div style={{ fontFamily: SANS, fontSize: '0.6rem', color: BP.dim, lineHeight: 1.5, marginBottom: 6 }}>{l.inputs}</div>
              <Label>Formula</Label>
              <div style={{ fontFamily: MONO, fontSize: '0.58rem', color: BP.dim2, lineHeight: 1.5, marginBottom: 6 }}>{l.formula}</div>
              <Label>Source</Label>
              <div style={{ fontFamily: SANS, fontSize: '0.6rem', color: BP.dim, lineHeight: 1.5 }}>{l.source}</div>
            </Box>
          ))}
        </Row>

        {/* Composite formula */}
        <div style={{ marginTop: 12, padding: '12px 16px', background: `${BP.cyan}08`, border: `1px solid ${BP.border2}`, borderRadius: 6 }}>
          <Label color={BP.cyan}>COMPOSITE SCORE FORMULA</Label>
          <div style={{ fontFamily: MONO, fontSize: '0.7rem', color: BP.cyan }}>
            composite = round( (L1×0.35 + L2×0.25 + L3×0.25 + L4×0.15) / totalWeightUsed )
          </div>
          <div style={{ fontFamily: MONO, fontSize: '0.62rem', color: BP.dim2, marginTop: 6 }}>
            Verdict: 85–100 Strong Buy · 70–84 Ready to Offer · 55–69 Buy with Caution · 40–54 Watch the Market · 0–39 Hold Off
          </div>
        </div>

        {/* Peer outputs — NOT part of the composite, NOT numbered levels */}
        <div style={{ marginTop: 16 }}>
          <Label>PEER OUTPUTS — separate from the L1–L4 composite, never folded into it</Label>
          <div style={{ marginTop: 8 }}>
          <Row gap={10}>
            {[
              { name: 'Rate Intelligence', color: BP.dim,
                inputs: 'Decoded lender par rate, real OBMMI credit/LTV segment rates, FRED national par rate',
                formula: 'Par-rate rank within the real OBMMI segment distribution, or spread-vs-national-par fallback. Requires a completed Rate Engine decode — not automatic like L1-L4.',
                source: 'lib/scoring/decisionScore.ts — scoreL5() (kept as a standalone export; excluded from computeComposite/COMPOSITE_WEIGHTS)',
              },
              { name: 'Personal Fit', color: BP.dim,
                inputs: 'Actual property PITI vs. buyer\'s own stated scenario/budget PITI, AVM vs. list price',
                formula: 'PITI-gap-vs-budget score (65% weight) blended with AVM-premium score (35%) when AVM available, else PITI-gap alone.',
                source: 'lib/scoring/decisionScore.ts — scorePersonalFit(). Compute/display only — not persisted (pending product decision on retention).',
              },
            ].map(o => (
              <Box key={o.name} title={o.name} color={o.color} width={300} minHeight={140}>
                <Label>Inputs</Label>
                <div style={{ fontFamily: SANS, fontSize: '0.6rem', color: BP.dim, lineHeight: 1.5, marginBottom: 6 }}>{o.inputs}</div>
                <Label>Formula</Label>
                <div style={{ fontFamily: MONO, fontSize: '0.58rem', color: BP.dim2, lineHeight: 1.5, marginBottom: 6 }}>{o.formula}</div>
                <Label>Source</Label>
                <div style={{ fontFamily: SANS, fontSize: '0.6rem', color: BP.dim, lineHeight: 1.5 }}>{o.source}</div>
              </Box>
            ))}
          </Row>
          </div>
        </div>

        <Arrow label="OUTPUT SURFACES" />

        {/* ═══════════════════════════════════════════════════════════════
            SECTION E — OUTPUT SURFACES
        ═══════════════════════════════════════════════════════════════ */}
        <SectionHeader num="E" title="OUTPUT SURFACES"
          sub="Where data lands after processing. Each surface is a different consumer or professional touchpoint." />

        <Row gap={12}>
          {[
            { code:'E-01', name:'Track 5 Page', url:'/track5', color:BP.green,
              desc:'Get Matched section. Shows L1-L4 composite, verdict, Homeowner Journey tiles. Entry: DSC "Get Matched" → carries session+scores. Anonymous matching: ZIP shared first, full address only after consent.',
              deps:'session ID or URL params (l1_score, l2_score, l3_score, l4_score, address)' },
            { code:'E-02', name:'Property Intel', url:'/property-intel', color:BP.purple,
              desc:'Deep analysis page. Shows Grok intel, comps, L3/L4 cards, DSC CTA. Build Report gated on d.deep_analysis. "Edit my numbers" → chat seeded with address. Session linked via pi_sid_ localStorage.',
              deps:'address URL param + optional sid= for session linkage' },
            { code:'E-03', name:'Property Report', url:'/property-report', color:BP.cyan,
              desc:'HomeRates-branded 4-page PDF. Pages: Property Snapshot, Mortgage Scenario, Location Intel, Decision Score. Get Matched carries all 4 scores. Requires full deep analysis before build.',
              deps:'address + down + rate + photo URL params. Session via linkedSessionId.' },
            { code:'E-04', name:'WL Report', url:'/wl-report', color:BP.accent,
              desc:'White-label 4-page report. Partner logo throughout, no HomeRates links. Get Matched → partner email. Same content as E-03 with zero HomeRates external links. Canonical disclosures unchanged.',
              deps:'address + down + rate + partner= slug. Requires deep analysis.' },
            { code:'E-05', name:'Instant Score', url:'/instant', color:BP.cyan,
              desc:'Try-for-free surface. Paste address → full L1-L4 score in 60 seconds. With ?partner= → branded experience. "Download Report" → /wl-report if partner, /property-report otherwise.',
              deps:'URL or address input. Optional partner= param.' },
            { code:'E-06', name:'API', url:'/api/instant-score', color:BP.cyan,
              desc:'Partner-facing JSON endpoint. POST {address, scenario?}. Returns composite, verdict, all 4 scores, property data, report_url, instant_url, processing_ms. $29/month with credit allocation.',
              deps:'POST body: address or url. Optional scenario override.' },
          ].map(e => (
            <Box key={e.code} title={e.name} code={e.code} color={e.color} width={240}>
              <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: '0.55rem', color: e.color, textDecoration: 'none', display: 'block', marginBottom: 6 }}>{e.url} ↗</a>
              <div style={{ fontFamily: SANS, fontSize: '0.62rem', color: BP.dim, lineHeight: 1.5, marginBottom: 6 }}>{e.desc}</div>
              <Label>Depends on</Label>
              <div style={{ fontFamily: MONO, fontSize: '0.58rem', color: BP.dim2, lineHeight: 1.5 }}>{e.deps}</div>
            </Box>
          ))}
        </Row>

        <HRule />

        {/* ═══════════════════════════════════════════════════════════════
            SECTION F — PROCESS FLOW (CONSUMER JOURNEYS)
        ═══════════════════════════════════════════════════════════════ */}
        <SectionHeader num="F" title="PROCESS FLOW — CONSUMER JOURNEYS"
          sub="End-to-end paths a consumer takes from first touch to Get Matched" />

        <Row gap={16} wrap>

          {/* Journey 1 */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <Box title="JOURNEY 1 · CHAT PROPERTY LOOKUP" color={BP.green} width="100%">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {[
                  ['User', 'Pastes Redfin URL or address in chat', BP.white],
                  ['A-01', 'Chat detects property_lookup intent', BP.green],
                  ['B-01', 'Property lookup → PropertyCardData', BP.yellow],
                  ['C: PPC-001', 'PropertyPreviewCard renders', BP.green],
                  ['C: ISC-002', 'ISC renders with PITI + stacked bar', BP.green],
                  ['C: IQC-003', 'IQC renders income qualification', BP.green],
                  ['C: DSC-004', 'DSC renders computing (L1+L2 immediate)', BP.green],
                  ['B-03', 'Grok deep analysis fires (background)', BP.yellow],
                  ['DSC-004', 'DSC updates to complete (L3+L4 scored)', BP.green],
                  ['User', 'Adjusts scenario in IQC/ISC sliders', BP.white],
                  ['DSC "Get Matched"', 'Navigates to Track 5 with all scores', BP.cyan],
                  ['E-01', 'Track 5 shows composite, Get Matched fires', BP.green],
                ].map(([from, action, color], i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: MONO, fontSize: '0.52rem', color: color as string, flexShrink: 0, minWidth: 90, paddingTop: 2 }}>{from}</span>
                    <span style={{ fontFamily: SANS, fontSize: '0.62rem', color: BP.dim, lineHeight: 1.4 }}>{action}</span>
                  </div>
                ))}
              </div>
            </Box>
          </div>

          {/* Journey 2 */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <Box title="JOURNEY 2 · MY HOME → TRACK 5" color={BP.cyan} width="100%">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {[
                  ['User', 'Adds property to My Home', BP.white],
                  ['A-02', 'My Home shows homeowner intelligence cards', BP.cyan],
                  ['User', 'Clicks "Run My Numbers"', BP.white],
                  ['A-01', 'Chat opens in new tab, address-only seed', BP.green],
                  ['B-01', 'Property lookup → 4 cards fire', BP.yellow],
                  ['B-03', 'Grok deep analysis (background)', BP.yellow],
                  ['openBuyerChat', 'Session created async → stored localStorage', BP.dim2],
                  ['DSC-004', 'Complete state when Grok returns', BP.green],
                  ['DSC "Get Matched"', 'Track 5 URL: session OR score params + address', BP.cyan],
                  ['E-01', 'Effect 2: looks up session by address if no ?session=', BP.green],
                  ['Track 5', 'Get Matched fires with full score', BP.green],
                ].map(([from, action, color], i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: MONO, fontSize: '0.52rem', color: color as string, flexShrink: 0, minWidth: 90, paddingTop: 2 }}>{from}</span>
                    <span style={{ fontFamily: SANS, fontSize: '0.62rem', color: BP.dim, lineHeight: 1.4 }}>{action}</span>
                  </div>
                ))}
              </div>
            </Box>
          </div>

          {/* Journey 3 */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <Box title="JOURNEY 3 · PROPERTY INTEL → FULL REPORT" color={BP.purple} width="100%">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {[
                  ['User', 'Arrives at /property-intel via any CTA', BP.white],
                  ['A-06', 'Page loads + fetches property from cache/Supabase', BP.purple],
                  ['STEP 1', '"Full Market Analysis" must be run first', BP.accent],
                  ['B-03', 'Grok deep streams → L3 + L4 computed + saved', BP.yellow],
                  ['d.deep_analysis', 'Set to true → "Build Report" unlocks', BP.green],
                  ['STEP 2', '"Build Report ↗" now active (was greyed)', BP.green],
                  ['E-03', '/property-report opens in new tab with all 4 levels', BP.cyan],
                  ['DSC CTA', 'Get Matched → Track 5 with L1-L4 score params', BP.cyan],
                  ['E-01', 'Track 5 loads complete with all scores', BP.green],
                ].map(([from, action, color], i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: MONO, fontSize: '0.52rem', color: color as string, flexShrink: 0, minWidth: 90, paddingTop: 2 }}>{from}</span>
                    <span style={{ fontFamily: SANS, fontSize: '0.62rem', color: BP.dim, lineHeight: 1.4 }}>{action}</span>
                  </div>
                ))}
              </div>
            </Box>
          </div>
        </Row>

        <HRule />

        {/* ═══════════════════════════════════════════════════════════════
            SECTION G — SESSION LINKAGE
        ═══════════════════════════════════════════════════════════════ */}
        <SectionHeader num="G" title="SESSION LINKAGE SCHEMA"
          sub="How buyer_evaluation_sessions tie L1-L4 scores across chat → property-intel → track5 → report" />

        <Row gap={12}>
          <Box title="DB TABLE: buyer_evaluation_sessions" color={BP.yellow} width={320}>
            <Label>Supabase table schema</Label>
            {['id (uuid PK)', 'user_id (Clerk)', 'property_address (text)', 'session_name', 'status (active/closed)',
              'scenario_json (lt, price, dp_pct, rate, term)',
              'l1_score, l1_summary', 'l2_score, l2_summary', 'l3_score, l3_summary', 'l4_score, l4_summary',
              'composite_score', 'created_at, updated_at'].map(f => (
              <div key={f} style={{ fontFamily: MONO, fontSize: '0.58rem', color: BP.dim2, marginBottom: 2 }}>▸ {f}</div>
            ))}
          </Box>

          <Box title="LINKAGE CHAIN" color={BP.cyan} width={340}>
            <Label>How session flows across surfaces</Label>
            {[
              ['openBuyerChat (my-home)', 'POST /api/buyer-sessions → stores id in localStorage pi_sid_{address}'],
              ['ISC journeyAddress effect', 'Reads pi_sid_ from localStorage → PATCHes existing session'],
              ['Chat DSC "Full Analysis"', 'Now carries ?sid={sessionId} so property-intel loads existing session'],
              ['property-intel incomingSid', 'Reads ?sid= param → fetches session → PATCHes with L2/L3/L4'],
              ['Track 5 Effect 1', '?session= param → fetches full session → sets sessionId state'],
              ['Track 5 Effect 2', 'No session but ?address= → lookup by address OR create from URL params'],
              ['Get Matched API', 'POST { sessionId } → creates scenario_brief row'],
            ].map(([from, desc], i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: '0.58rem', color: BP.cyan }}>{from}</div>
                <div style={{ fontFamily: SANS, fontSize: '0.62rem', color: BP.dim, lineHeight: 1.4, marginLeft: 8 }}>{desc}</div>
              </div>
            ))}
          </Box>

          <Box title="ANTI-PATTERNS (known failure modes)" color={BP.red} width={280}>
            {[
              ['❌ Build Report before deep analysis', 'Fixed: Build Report gated on d.deep_analysis'],
              ['❌ Get Matched from report goes blank', 'Fixed: report now builds Track 5 URL with L1-L4'],
              ['❌ $200k/yr income parsed as price', 'Fixed: extractIncome + extractPrice regex updated'],
              ['❌ IQC income change seeds new chat', 'Fixed: handleDrawerRun only fires onRunScenario for scenario param changes'],
              ['❌ Conv. routes to Grok not calc engine', 'Fixed: isConventionalQuestion catches "Run my numbers: Conv."'],
              ['❌ Full Analysis drops session ID', 'Fixed: DSC fullAnalysisUrl now carries ?sid='],
            ].map(([bug, fix], i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: '0.58rem', color: BP.red }}>{bug}</div>
                <div style={{ fontFamily: SANS, fontSize: '0.62rem', color: BP.green, lineHeight: 1.4, marginLeft: 8 }}>{fix}</div>
              </div>
            ))}
          </Box>
        </Row>

        <HRule />

        {/* ═══════════════════════════════════════════════════════════════
            SECTION H — WHITE LABEL SCHEMA
        ═══════════════════════════════════════════════════════════════ */}
        <SectionHeader num="H" title="WHITE LABEL SCHEMA"
          sub="How partner branding flows through the platform" />

        <Row gap={12}>
          <Box title="H-01 ADMIN MANAGEMENT" color={BP.accent} width={220}>
            <Bullet>DB table: white_label_partners (slug, name, logo_url, accent_color, tagline, contact_email)</Bullet>
            <Bullet>Hardcoded demo config for groves-capital (works without DB)</Bullet>
            <Bullet>Admin page: add/edit/toggle/copy URL</Bullet>
          </Box>
          <Box title="H-02 BRANDED INSTANT SCORE" color={BP.accent} width={200}>
            <Bullet>URL: /instant?partner=slug</Bullet>
            <Bullet>Fetches partner config from /api/admin/white-label?slug=</Bullet>
            <Bullet>Swaps: logo, h1 accent, Analyze button color, description</Bullet>
            <Bullet>Download Report → /wl-report (not /property-report)</Bullet>
          </Box>
          <Box title="H-03 WL REPORT (/wl-report)" color={BP.accent} width={220}>
            <Bullet>Partner logo on all 4 page navs</Bullet>
            <Bullet>No HomeRates external links anywhere</Bullet>
            <Bullet>Get Matched → mailto: partner contact</Bullet>
            <Bullet>Footer: partner name + tagline</Bullet>
            <Bullet color={BP.yellow}>Disclosures: lib/disclosures.ts — UNCHANGED (data attribution is non-negotiable)</Bullet>
          </Box>
          <Box title="H-04 API RESPONSE" color={BP.accent} width={200}>
            <Bullet>POST /api/instant-score returns instant_url with ?partner= threaded</Bullet>
            <Bullet>report_url carries ?partner= to /wl-report</Bullet>
            <Bullet>$29/month credit allocation</Bullet>
          </Box>
        </Row>

        {/* ── Title block (bottom-right, architectural convention) ── */}
        <div style={{ marginTop: 60, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ border: `1px solid ${BP.border}`, borderRadius: 6, padding: '16px 20px', minWidth: 280, background: BP.box }}>
            <div style={{ fontFamily: MONO, fontSize: '0.55rem', color: BP.dim2, letterSpacing: '0.12em', marginBottom: 10 }}>TITLE BLOCK · END OF DRAWING</div>
            <div style={{ fontFamily: MONO, fontSize: '0.85rem', fontWeight: 800, color: BP.cyan, marginBottom: 4 }}>HOMERATES.AI</div>
            <div style={{ fontFamily: MONO, fontSize: '0.7rem', color: BP.white, marginBottom: 8 }}>SYSTEM ARCHITECTURE BLUEPRINT</div>
            <div style={{ height: 1, background: BP.border2, marginBottom: 8 }} />
            {[['Document', 'SYS-ARCH-001'],['Revision', '2026.05.29'],['Classification', 'ADMIN / INTERNAL'],['Not for distribution', '']].map(([k,v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontFamily: MONO, fontSize: '0.55rem', color: BP.dim2 }}>{k}</span>
                <span style={{ fontFamily: MONO, fontSize: '0.55rem', color: BP.cyan }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
