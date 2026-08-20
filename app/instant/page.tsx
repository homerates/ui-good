'use client';

import { Suspense, useState, useRef, useCallback, useEffect } from 'react';
import { SHORT_DISCLOSURE } from '../../lib/disclosures';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import { scoreL1, scoreL2, scoreL3, scoreL4, computeComposite, verdict } from '../../lib/scoring/decisionScore';

// L1-L4 scoring, composite, and verdict now come from the canonical engine
// (lib/scoring/decisionScore.ts) instead of this page's own hand-copied
// formulas -- Decision Score consolidation, 2026-08-19. This was the
// sharpest confirmed inconsistency in the audit: app/api/instant-score/
// route.ts already imports canonical and links directly to this page, so a
// partner could see two different scores for the same address in one flow.

function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function barColor(s: number | null) {
  if (s == null)  return 'rgba(255,255,255,0.08)';
  if (s >= 70)    return '#4ade80';
  if (s >= 50)    return '#fbbf24';
  return '#f87171';
}

// ── Step labels ───────────────────────────────────────────────────────────────

const STEPS = [
  'Fetching property data',
  'Computing financial readiness',
  'Running market intelligence',
  'Analysing location factors',
  'Generating report',
];

// ── Score ring ────────────────────────────────────────────────────────────────

function Ring({ score, size = 96 }: { score: number | null; size?: number }) {
  const r    = size * 0.4;
  const circ = 2 * Math.PI * r;
  const fill = score != null ? circ * (score / 100) : 0;
  const cx   = size / 2;
  const col  = score == null ? 'rgba(255,255,255,0.08)' : score >= 70 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={size * 0.07} />
      {score != null && (
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={col} strokeWidth={size * 0.07}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1) 0.3s' }} />
      )}
      <text x={cx} y={cx - size * 0.04} textAnchor="middle"
        fill={score != null ? '#f0f4ff' : 'rgba(255,255,255,0.15)'}
        fontSize={size * 0.22} fontWeight={900} fontFamily="system-ui,sans-serif">
        {score ?? '···'}
      </text>
      <text x={cx} y={cx + size * 0.14} textAnchor="middle"
        fill="rgba(255,255,255,0.22)" fontSize={size * 0.1} fontFamily="system-ui,sans-serif">
        /100
      </text>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ScoreResult {
  address: string;
  price: number;
  beds: number | null; baths: number | null; sqft: number | null;
  photoUrl: string | null;
  l1Score: number;   l1Summary: string;
  l2Score: number | null; l2Summary: string;
  l3Score: number;   l3Summary: string;
  l4Score: number | null; l4Summary: string;
  composite: number | null;
  reportUrl: string;
  downPct: number; rate: number;
}

interface WhiteLabelPartner {
  slug: string; name: string; logo_url: string | null;
  tagline: string | null; accent_color: string; contact_email: string | null;
}

function InstantInner() {
  const params    = useSearchParams();
  const prefill   = params?.get('url') ?? params?.get('address') ?? '';
  const partnerSlug = params?.get('partner') ?? null;

  const [input,    setInput]    = useState(prefill);
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [step,     setStep]     = useState(0);
  const [result,   setResult]   = useState<ScoreResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied,   setCopied]   = useState(false);
  const [partner,  setPartner]  = useState<WhiteLabelPartner | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Load white-label partner config if slug present
  useEffect(() => {
    if (!partnerSlug) return;
    fetch(`/api/admin/white-label?slug=${encodeURIComponent(partnerSlug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.partner) setPartner(d.partner); })
      .catch(() => {});
  }, [partnerSlug]);

  const handleAnalyze = useCallback(async () => {
    const raw = input.trim();
    if (!raw) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setStatus('loading');
    setStep(0);
    setResult(null);
    setErrorMsg('');

    try {
      // ── Step 1: property lookup ─────────────────────────────────────────────
      setStep(0);
      const lookupRes = await fetch('/api/property/lookup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: raw.startsWith('http') ? raw : undefined, address: raw.startsWith('http') ? undefined : raw }),
        signal:  abortRef.current.signal,
      });
      if (!lookupRes.ok) throw new Error('Property not found. Try a Redfin URL or full street address.');
      const lookupJson = await lookupRes.json();
      if (!lookupJson.ok) throw new Error('Could not fetch property data. Try a different URL or address.');
      const d = lookupJson.data as Record<string, unknown>;
      if (!d.address) throw new Error('Address could not be determined from that input.');

      const address  = d.address as string;
      const price    = (d.price as number) ?? 0;
      const liveRate = 6.875;  // FRED default; Grok deep result may override
      const defaultDown = ((price > 832_750) ? 20 : 10);
      const loanAmt  = price * (1 - defaultDown / 100);
      const avm      = (d.estimatedValue as number | null) ?? null;
      const spScore  = (d.socialProofScore as number | null) ?? null;
      const spLevel  = (d.interestLevel as string | null) ?? null;
      const spViews  = (d.zillowViews as number | null) ?? null;
      const spRank   = (d.redfinViews as string | null) ?? null;

      // ── Step 2: L1 ──────────────────────────────────────────────────────────
      setStep(1);
      // No VA/FHA path collected on this page -- jumbo determined by amount,
      // same threshold as before this migration.
      const l1 = scoreL1({ downPct: defaultDown, loanType: loanAmt > 832_750 ? 'jumbo' : 'conventional' });

      // ── Step 3: L2 (AVM) ────────────────────────────────────────────────────
      setStep(2);
      const l2raw = scoreL2({ listPrice: price, avm });

      // ── Step 3–4: Grok deep analysis (L3 + L4) ─────────────────────────────
      const grokRes = await fetch('/api/beta/grok-property', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          address,
          deep: true,
          redfin: {
            current_status:     d.listingStatus ?? 'FOR_SALE',
            current_list_price: price,
            bedrooms:           d.beds,
            bathrooms:          d.baths,
            sqft:               d.sqft,
            year_built:         d.yearBuilt,
            days_on_market:     d.daysOnMarket,
            last_sold_price:    d.lastSalePrice,
            last_sold_date:     d.lastSaleDate,
            tax_rate_effective: d.taxRateEffective,
            hoa_monthly:        d.hoaMonthly,
            photo_url:          d.photoUrl,
          },
        }),
        signal: abortRef.current.signal,
      });

      let deepResult: Record<string, unknown> = {};
      if (grokRes.ok && grokRes.body) {
        const reader = grokRes.body.getReader();
        const dec    = new TextDecoder();
        let buf      = '';
        setStep(3);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(t.slice(6));
              if (ev.done && ev.result) deepResult = ev.result as Record<string, unknown>;
            } catch { /* ignore partials */ }
          }
        }
      }

      setStep(4);

      // ── Compute L2 from deep result if needed ─────────────────────────────
      let l2Score   = l2raw?.score ?? null;
      let l2Summary = l2raw?.summary ?? 'AVM data unavailable';
      if (l2Score == null && price) {
        const deepAvm = (deepResult.zillow_estimate as number | null)
            ?? (deepResult.redfin_estimate as number | null)
            ?? null;
        const l2deep  = scoreL2({ listPrice: price, avm: deepAvm });
        if (l2deep) { l2Score = l2deep.score; l2Summary = l2deep.summary; }
        else { l2Score = 65; l2Summary = 'AVM limited — visit Property Intel'; }
      }

      // ── L3 ────────────────────────────────────────────────────────────────
      const dom = (deepResult.market_median_dom  as number | null) ?? null;
      const stl = (deepResult.market_sale_to_list as number | null) ?? null;
      const sub = (deepResult.days_on_market     as number | null) ?? (d.daysOnMarket as number | null) ?? null;
      const socialProofNotes: string[] = [];
      if (spViews != null) socialProofNotes.push(`${spViews.toLocaleString()} Zillow views`);
      if (spRank) socialProofNotes.push(spRank);
      if (spLevel && spLevel !== 'Moderate') socialProofNotes.push(`${spLevel} demand`);
      const l3 = scoreL3({
        domMedian: dom, saleToList: stl, subjectDom: sub,
        socialProofScore: spScore, socialProofNotes, interestLevel: spLevel,
      });

      // ── L4 ────────────────────────────────────────────────────────────────
      const li = deepResult.location_intelligence as { overall_score?: number; sub_scores?: { metric: string; rating: string }[] } | null;
      const l4 = scoreL4({
        overallScore: li?.overall_score ?? null,
        subScores: li?.sub_scores,
        school: (deepResult.school_score as number | null) ?? null,
        walk: (deepResult.walk_score as number | null) ?? null,
      });
      const l4Score   = l4?.score ?? null;
      const l4Summary = l4?.summary ?? '';

      const composite = computeComposite({ l1: l1.score, l2: l2Score, l3: l3.score, l4: l4Score });

      // ── Build report URL — white-label path uses /wl-report (no HomeRates links)
      const rp = new URLSearchParams({ address, down: String(defaultDown), rate: liveRate.toFixed(3) });
      if (d.photoUrl)    rp.set('photo',   d.photoUrl as string);
      if (partnerSlug)   rp.set('partner', partnerSlug);
      const reportUrl = partnerSlug
        ? `/wl-report?${rp.toString()}`
        : `/property-report?${rp.toString()}`;

      setResult({
        address, price,
        beds:  (d.beds as number | null) ?? null,
        baths: (d.baths as number | null) ?? null,
        sqft:  (d.sqft as number | null) ?? null,
        photoUrl: (d.photoUrl as string | null) ?? null,
        l1Score: l1.score,    l1Summary: l1.summary,
        l2Score,               l2Summary,
        l3Score: l3.score,    l3Summary: l3.summary,
        l4Score,               l4Summary,
        composite, reportUrl,
        downPct: defaultDown,  rate: liveRate,
      });
      setStatus('done');

    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') return;
      setErrorMsg((e instanceof Error) ? e.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }, [input]);

  const shareUrl = result
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://chat.homerates.ai'}/instant?address=${encodeURIComponent(result.address)}`
    : '';

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* noop */ }
  };

  const verd = result?.composite != null ? verdict(result.composite) : null;
  const levels = result ? [
    { num: 'L1', name: 'Financial Readiness', weight: '35%', score: result.l1Score, summary: result.l1Summary },
    { num: 'L2', name: 'Property Evaluation',  weight: '25%', score: result.l2Score, summary: result.l2Summary },
    { num: 'L3', name: 'Market Intelligence',  weight: '25%', score: result.l3Score, summary: result.l3Summary },
    ...(result.l4Score != null ? [{ num: 'L4', name: 'Location Intelligence', weight: '15%', score: result.l4Score, summary: result.l4Summary }] : []),
  ] : [];

  return (
    <div className="page-standalone inst-root">
      <style>{`
        .inst-root { background:#080c12; color:#f1f5f9; font-family:system-ui,-apple-system,sans-serif; }

        .inst-hero { max-width:680px; margin:0 auto; padding:4rem 1.5rem 2rem; text-align:center; }
        .inst-tag { display:inline-flex; align-items:center; gap:6px; font-size:0.62rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#00e87a; background:rgba(0,232,122,0.08); border:1px solid rgba(0,232,122,0.2); border-radius:20px; padding:4px 12px; margin-bottom:20px; }
        .inst-h1 { font-size:clamp(1.8rem,5vw,2.8rem); font-weight:900; letter-spacing:-0.03em; line-height:1.15; color:#f0f4ff; margin-bottom:14px; }
        .inst-sub { font-size:1rem; color:#6b80a0; line-height:1.65; max-width:520px; margin:0 auto 36px; }

        .inst-box { max-width:680px; margin:0 auto; padding:0 1.5rem; }
        .inst-input-wrap { display:flex; gap:10px; background:#0d1117; border:1.5px solid rgba(255,255,255,0.1); border-radius:14px; padding:8px; transition:border-color .15s; }
        .inst-input-wrap:focus-within { border-color:rgba(0,232,122,0.4); }
        .inst-input { flex:1; background:transparent; border:none; outline:none; font-size:0.9rem; color:#f0f4ff; padding:8px 10px; font-family:inherit; }
        .inst-input::placeholder { color:#3a4560; }
        .inst-btn { background:#00e87a; color:#060d0a; border:none; border-radius:10px; padding:10px 22px; font-size:0.88rem; font-weight:800; cursor:pointer; font-family:inherit; white-space:nowrap; transition:opacity .15s; flex-shrink:0; }
        .inst-btn:hover { opacity:.88; }
        .inst-btn:disabled { opacity:.45; cursor:not-allowed; }

        .inst-hint { text-align:center; font-size:0.7rem; color:#3a4560; margin-top:12px; }

        /* Progress */
        .inst-progress { max-width:680px; margin:40px auto 0; padding:0 1.5rem; }
        .inst-step { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
        .inst-step:last-child { border-bottom:none; }
        .inst-step-dot { width:20px; height:20px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:0.62rem; font-weight:700; }
        .inst-step-dot.done    { background:rgba(0,232,122,0.15); color:#00e87a; border:1px solid rgba(0,232,122,0.3); }
        .inst-step-dot.active  { background:rgba(0,232,122,0.08); border:1.5px solid rgba(0,232,122,0.4); animation:inst-pulse 1.2s ease-in-out infinite; }
        .inst-step-dot.pending { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); }
        @keyframes inst-pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
        .inst-step-label { font-size:0.82rem; font-weight:600; }
        .inst-step-label.done    { color:#c4cfe0; }
        .inst-step-label.active  { color:#00e87a; }
        .inst-step-label.pending { color:#3a4560; }

        /* Result */
        .inst-result { max-width:700px; margin:48px auto 80px; padding:0 1.5rem; }
        .inst-score-card { background:#0d1117; border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; margin-bottom:14px; }
        .inst-score-header { display:flex; align-items:center; gap:22px; padding:24px 28px; border-bottom:1px solid rgba(255,255,255,0.06); }
        .inst-verdict { font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; margin-bottom:6px; }
        .inst-sub-info { font-size:0.78rem; color:#6b80a0; line-height:1.5; }
        .inst-chip { display:inline-block; font-size:0.6rem; font-weight:700; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:3px 8px; color:#8fa3b8; margin-right:6px; }

        .inst-levels { padding:16px 28px; display:flex; flex-direction:column; gap:10px; }
        .inst-level { display:grid; grid-template-columns:36px 1fr auto; gap:12px; align-items:center; background:#111827; border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:13px 16px; }
        .inst-level-num { font-size:0.58rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:#4b6080; text-align:center; }
        .inst-level-name { font-size:0.82rem; font-weight:700; color:#e2e8f0; margin-bottom:3px; }
        .inst-level-sum  { font-size:0.68rem; color:#6b80a0; line-height:1.4; }
        .inst-level-bar  { height:4px; border-radius:2px; background:rgba(255,255,255,0.06); margin-top:7px; overflow:hidden; }
        .inst-level-fill { height:100%; border-radius:2px; transition:width 0.9s cubic-bezier(0.34,1.56,0.64,1) 0.4s; }
        .inst-level-score { font-size:1.1rem; font-weight:800; font-variant-numeric:tabular-nums; min-width:38px; text-align:right; flex-shrink:0; }

        .inst-actions { display:flex; gap:10px; flex-wrap:wrap; }
        .inst-btn-report { flex:1; min-width:180px; padding:13px 20px; background:#00e87a; color:#060d0a; border:none; border-radius:11px; font-size:0.88rem; font-weight:800; cursor:pointer; font-family:inherit; text-align:center; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:8px; transition:opacity .15s; }
        .inst-btn-report:hover { opacity:.88; }
        .inst-btn-share  { padding:13px 20px; background:rgba(255,255,255,0.04); color:#c4cfe0; border:1.5px solid rgba(255,255,255,0.1); border-radius:11px; font-size:0.88rem; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
        .inst-btn-share:hover { border-color:rgba(255,255,255,0.22); background:rgba(255,255,255,0.07); }
        .inst-btn-chat   { padding:13px 20px; background:rgba(0,232,122,0.07); color:#00e87a; border:1.5px solid rgba(0,232,122,0.25); border-radius:11px; font-size:0.88rem; font-weight:700; cursor:pointer; font-family:inherit; text-decoration:none; display:flex; align-items:center; gap:7px; transition:all .15s; }
        .inst-btn-chat:hover { background:rgba(0,232,122,0.13); border-color:rgba(0,232,122,0.4); }

        .inst-prop-strip { display:flex; align-items:center; gap:12px; padding:12px 28px; background:rgba(255,255,255,0.02); border-bottom:1px solid rgba(255,255,255,0.05); }
        .inst-prop-photo { width:52px; height:52px; border-radius:8px; object-fit:cover; flex-shrink:0; background:#111827; }
        .inst-prop-addr  { font-size:0.82rem; font-weight:700; color:#e2e8f0; margin-bottom:2px; }
        .inst-prop-meta  { font-size:0.68rem; color:#4b6080; }

        .inst-api-note { margin-top:32px; padding:20px 24px; background:rgba(61,139,255,0.05); border:1px solid rgba(61,139,255,0.15); border-radius:12px; }
        .inst-api-head { font-size:0.72rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#60a5fa; margin-bottom:10px; }
        .inst-api-code { font-size:0.7rem; font-family:'DM Mono',monospace; color:#94a3b8; background:rgba(0,0,0,0.3); border-radius:8px; padding:12px 14px; overflow-x:auto; white-space:pre; }

        .inst-error { max-width:680px; margin:40px auto 0; padding:0 1.5rem; }
        .inst-error-box { background:rgba(248,113,113,0.06); border:1px solid rgba(248,113,113,0.2); border-radius:12px; padding:16px 20px; color:#f87171; font-size:0.82rem; line-height:1.55; }
        .inst-error-box button { margin-top:10px; background:none; border:1px solid rgba(248,113,113,0.3); color:#f87171; padding:6px 14px; border-radius:8px; cursor:pointer; font-family:inherit; font-size:0.75rem; }
      `}</style>

      <AppNav />

      {/* Hero */}
      <div className="inst-hero">
        {/* White-label partner logo — shown instead of tag when partner is active */}
        {partner ? (
          <div style={{ marginBottom: 24 }}>
            {partner.logo_url ? (
              <img src={partner.logo_url} alt={partner.name}
                style={{ height: 44, maxWidth: 200, objectFit: 'contain', margin: '0 auto', display: 'block' }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: partner.accent_color, marginBottom: 2 }}>
                {partner.name}
              </div>
            )}
            {partner.tagline && (
              <div style={{ fontSize: '0.7rem', color: '#4b6080', marginTop: 6, letterSpacing: '0.04em' }}>
                {partner.tagline}
              </div>
            )}
          </div>
        ) : (
          <div className="inst-tag">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e87a', display: 'inline-block' }} />
            Instant Property Score
          </div>
        )}
        <h1 className="inst-h1" style={partner ? { color: partner.accent_color } : {}}>
          Paste any property URL.<br />Get a complete buyer decision score.
        </h1>
        <p className="inst-sub">
          {partner
            ? `Powered by ${partner.name} · AI property intelligence with 4 independent analyses. Free. No login required.`
            : 'Powered by 4 independent AI analyses — Financial Readiness, Property Evaluation, Market Intelligence, and Location Intelligence. Plus a shareable 4-page intelligence report. Free. No login required.'
          }
        </p>
      </div>

      {/* Input */}
      <div className="inst-box">
        <div className="inst-input-wrap">
          <input
            className="inst-input"
            type="text"
            placeholder="Paste a Redfin URL or type a full property address…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && status !== 'loading' && handleAnalyze()}
            autoFocus
          />
          <button
            className="inst-btn"
            style={partner ? { background: partner.accent_color } : {}}
            onClick={handleAnalyze}
            disabled={status === 'loading' || !input.trim()}
          >
            {status === 'loading' ? 'Analyzing…' : 'Analyze →'}
          </button>
        </div>
        <div className="inst-hint">
          Works with Redfin URLs, Zillow URLs, or any full street address (e.g. "3111 Gardenia Ln, Yorba Linda, CA 92886")
        </div>
      </div>

      {/* Progress */}
      {status === 'loading' && (
        <div className="inst-progress">
          {STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'pending';
            return (
              <div key={label} className="inst-step">
                <div className={`inst-step-dot ${state}`}>
                  {state === 'done' ? '✓' : state === 'active' ? '⋯' : ''}
                </div>
                <span className={`inst-step-label ${state}`}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="inst-error">
          <div className="inst-error-box">
            {errorMsg}
            <br />
            <button onClick={() => { setStatus('idle'); setErrorMsg(''); }}>Try again</button>
          </div>
        </div>
      )}

      {/* Result */}
      {status === 'done' && result && (
        <div className="inst-result">
          <div className="inst-score-card">
            {/* Property strip */}
            <div className="inst-prop-strip">
              {result.photoUrl && (
                <img src={result.photoUrl} alt="Property" className="inst-prop-photo"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              <div>
                <div className="inst-prop-addr">{result.address}</div>
                <div className="inst-prop-meta">
                  {fmtK(result.price)}
                  {result.beds != null && ` · ${result.beds} bd`}
                  {result.baths != null && ` · ${result.baths} ba`}
                  {result.sqft != null && ` · ${result.sqft.toLocaleString()} sqft`}
                </div>
              </div>
            </div>

            {/* Score header */}
            <div className="inst-score-header">
              <Ring score={result.composite} size={96} />
              <div style={{ flex: 1 }}>
                <div className="inst-verdict" style={{ color: verd?.color ?? '#f0f4ff' }}>
                  {verd?.label ?? 'Scored'}
                </div>
                <div className="inst-sub-info">
                  Based on {levels.filter(l => l.score != null).length} of 4 levels scored.
                </div>
                <div style={{ marginTop: 10 }}>
                  <span className="inst-chip">{result.downPct}% down</span>
                  <span className="inst-chip">{result.rate.toFixed(2)}% rate</span>
                  <span className="inst-chip">{result.l1Score >= 80 ? 'No PMI' : 'PMI applies'}</span>
                </div>
              </div>
            </div>

            {/* Level bars */}
            <div className="inst-levels">
              {levels.map((lvl, i) => (
                <div key={lvl.num} className="inst-level">
                  <div>
                    <div className="inst-level-num">{lvl.num}</div>
                    <div style={{ fontSize: '0.6rem', color: '#3a4560', textAlign: 'center' }}>{lvl.weight}</div>
                  </div>
                  <div>
                    <div className="inst-level-name">{lvl.name}</div>
                    <div className="inst-level-sum">{lvl.summary}</div>
                    <div className="inst-level-bar">
                      <div className="inst-level-fill" style={{
                        width: lvl.score != null ? `${lvl.score}%` : '0%',
                        background: barColor(lvl.score ?? null),
                        transitionDelay: `${i * 0.12}s`,
                      }} />
                    </div>
                  </div>
                  <div className="inst-level-score" style={{ color: barColor(lvl.score ?? null) }}>
                    {lvl.score ?? '—'}
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 28px' }} />

            {/* CTAs */}
            <div style={{ padding: '20px 28px' }}>
              <div className="inst-actions">
                <a href={result.reportUrl} target="_blank" rel="noopener noreferrer" className="inst-btn-report">
                  ↓ Download 4-Page Report
                </a>
                <button className="inst-btn-share" onClick={handleCopy}>
                  {copied ? '✓ Link copied!' : '🔗 Share this score'}
                </button>
                <a
                  href={`/chat?sq=${encodeURIComponent(result.address)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inst-btn-chat"
                >
                  ↗ Run full scenario in chat
                </a>
              </div>
              <div style={{ marginTop: 12, fontSize: '0.62rem', color: '#3a4560', lineHeight: 1.5 }}>
                {SHORT_DISCLOSURE}
              </div>
            </div>
          </div>

          {/* API note for partners */}
          <div className="inst-api-note">
            <div className="inst-api-head">API Access</div>
            <div style={{ fontSize: '0.72rem', color: '#8fa3b8', marginBottom: 10, lineHeight: 1.55 }}>
              Embed this scoring engine in your own platform. One POST call returns the complete L1–L4 score, verdict, and report URL.
            </div>
            <div className="inst-api-code">{`POST https://chat.homerates.ai/api/instant-score
Content-Type: application/json

{ "address": "${result.address}" }

→ { "composite": ${result.composite}, "verdict": "${verd?.label}", "report_url": "...", "l1": ${result.l1Score}, "l2": ${result.l2Score}, "l3": ${result.l3Score}, "l4": ${result.l4Score ?? 'null'} }`}</div>
            <div style={{ marginTop: 10, fontSize: '0.68rem', color: '#4b6080' }}>
              Contact <a href="mailto:hello@homerates.ai" style={{ color: '#60a5fa', textDecoration: 'none' }}>hello@homerates.ai</a> for API key access and partnership enquiries.
            </div>
          </div>

          {/* Try another */}
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={() => { setStatus('idle'); setResult(null); setInput(''); }}
              style={{ background: 'none', border: 'none', color: '#4b6080', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
            >
              ← Analyse another property
            </button>
          </div>
        </div>
      )}

      {/* Idle state: example properties */}
      {status === 'idle' && (
        <div style={{ maxWidth: 680, margin: '48px auto 80px', padding: '0 1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3a4560', marginBottom: 14 }}>
            Try an example
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              '3111 Gardenia Ln, Yorba Linda, CA 92886',
              '16908 Hillside Dr, Chino Hills, CA 91709',
            ].map(addr => (
              <button key={addr}
                onClick={() => { setInput(addr); }}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 14px', color: '#6b80a0', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,232,122,0.25)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
              >
                {addr}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 40, fontSize: '0.72rem', color: '#3a4560', lineHeight: 1.7 }}>
            Four independent AI analyses · Live FRED® rate data · Shareable report<br />
            <span style={{ color: '#4b6080' }}>No account required · Free to use</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InstantPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080c12', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b6080', fontFamily: 'sans-serif' }}>
        Loading…
      </div>
    }>
      <InstantInner />
    </Suspense>
  );
}
