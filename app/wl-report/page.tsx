'use client';

// app/wl-report/page.tsx
// White-label Property Intelligence Report — partner-first, no HomeRates external links.
// Requires ?partner=<slug>. All branding comes from the partner config.
// HomeRates attribution appears only in the standard disclosure lines (lib/disclosures.ts).

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { EDUCATIONAL_DISCLAIMER, DATA_ATTRIBUTION } from '../../lib/disclosures';

// ── Types (mirrored from property-report) ─────────────────────────────────────
interface Comp { address: string; sold_price: number; sold_date: string; sqft: number | null; price_per_sqft: number | null; days_on_market?: number | null; }
interface LocSubScore { metric: string; score: number; rating: string; description: string; fire_factor?: number | null; risk_30yr_pct?: number | null; us_risk_percentile?: number | null; }
interface LocIntel { overall_score: number; sub_scores: LocSubScore[]; narrative: string; strengths: string[]; tradeoffs: string[]; recommendation: string; }
interface PropData {
  current_status: string | null; current_list_price: number | null;
  bedrooms: number | null; bathrooms: number | null; sqft: number | null;
  year_built: number | null; lot_size_sqft: number | null; days_on_market: number | null;
  price_per_sqft: number | null; last_sold_price: number | null; last_sold_date: string | null;
  estimated_piti: number | null; rate_used: number | null;
  key_highlights: string[] | null; comparable_sales: Comp[] | null;
  grok_intelligence_summary: string | null; buyer_strategy: string | null;
  zillow_estimate: number | null; redfin_estimate: number | null;
  zillow_saves: number | null; zillow_views: number | null; redfin_views: string | null;
  social_proof_score: number | null; interest_level: string | null;
  market_median_dom: number | null; market_sale_to_list: number | null; market_median_price: number | null;
  life_fit_score: number | null; school_score: number | null; walk_score: number | null;
  neighborhood_appreciation_3yr_pct: number | null; location_intelligence: LocIntel | null;
  photoUrl?: string | null;
}
interface WLPartner { slug: string; name: string; logo_url: string | null; tagline: string | null; accent_color: string; contact_email: string | null; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US') : '—';
const fmtK   = (n: number | null | undefined) => { if (n == null) return '—'; if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`; if (n >= 1e3) return `$${Math.round(n/1e3)}K`; return `$${n}`; };
function calcPI(p: number, r: number, m = 360) { const mr = r/100/12; if (!mr) return Math.round(p/m); return Math.round(p*(mr*Math.pow(1+mr,m))/(Math.pow(1+mr,m)-1)); }
function scoreColor(s: number | null) { if (s == null) return '#4b5c70'; if (s >= 70) return '#4ade80'; if (s >= 50) return '#fbbf24'; return '#f87171'; }
function verdict(s: number) { if (s >= 85) return { label:'Strong Buy', color:'#4ade80' }; if (s >= 70) return { label:'Ready to Offer', color:'#4ade80' }; if (s >= 55) return { label:'Buy with Caution', color:'#fbbf24' }; if (s >= 40) return { label:'Watch the Market', color:'#fbbf24' }; return { label:'Hold Off', color:'#f87171' }; }
function computeComposite(l1: number, l2: number|null, l3: number|null, l4: number|null) {
  const e = [{s:l1,w:.35},{s:l2,w:.25},{s:l3,w:.25},{s:l4,w:.15}].filter(x=>x.s!=null) as {s:number;w:number}[];
  if (e.length < 2) return null;
  const tw = e.reduce((a,x)=>a+x.w,0);
  return Math.round(e.reduce((a,x)=>a+x.s*x.w,0)/tw);
}
function locSubColor(s: number) { if (s >= 70) return 'green'; if (s >= 50) return 'yellow'; if (s >= 35) return 'orange'; return 'red'; }

function ScoreRing({ score, size=100 }: { score: number; size?: number }) {
  const r = size*.42, circ = 2*Math.PI*r, fill = circ*Math.min(score/100,1), cx = size/2;
  const col = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size*.1}/>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={col} strokeWidth={size*.1} strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}/>
      <text x={cx} y={cx-size*.04} textAnchor="middle" fill="#f0f4ff" fontSize={size*.24} fontWeight={800} fontFamily="DM Sans,sans-serif">{score}</text>
      <text x={cx} y={cx+size*.14} textAnchor="middle" fill="#4b5c70" fontSize={size*.11} fontFamily="DM Mono,monospace">/100</text>
    </svg>
  );
}

const piNormKey = (a: string) => a.trim().toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').slice(0,100);
function piLsRead(addr: string): {result: PropData; mapUrls:{street_view_url:string|null}|null}|null {
  if (typeof window==='undefined') return null;
  try {
    const raw = localStorage.getItem(`pi_v1_${piNormKey(addr)}`);
    if (!raw) return null;
    const p = JSON.parse(raw) as {result:PropData;mapUrls:{street_view_url:string|null}|null;cachedAt:number};
    if (!p?.result || !p.cachedAt) return null;
    const age = Date.now()-p.cachedAt;
    const ttl = /sold|off market/i.test(p.result.current_status??'') ? 7*86400000 : 86400000;
    if (age>=ttl) return null;
    return {result:p.result, mapUrls:p.mapUrls??null};
  } catch { return null; }
}

// ── Logo helper — renders partner logo or text fallback ───────────────────────
function BrandLogo({ partner, height=28 }: { partner: WLPartner; height?: number }) {
  if (partner.logo_url) {
    return <img src={partner.logo_url} alt={partner.name}
      style={{ height, maxWidth: 160, objectFit: 'contain', display: 'block' }}
      onError={e => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
        const fb = e.currentTarget.nextSibling as HTMLElement;
        if (fb) fb.style.display = 'block';
      }}
    />;
  }
  return <span style={{ fontSize: Math.round(height*.52), fontWeight: 800, color: partner.accent_color, letterSpacing: '-0.02em' }}>{partner.name}</span>;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function WLReportInner() {
  const params      = useSearchParams();
  const address     = params?.get('address') ?? '';
  const downPct     = Number(params?.get('down') ?? 20);
  const rateOver    = Number(params?.get('rate') ?? 0);
  const photoParam  = params?.get('photo') ?? null;
  const partnerSlug = params?.get('partner') ?? '';

  const [data,        setData]       = useState<PropData | null>(null);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState('');
  const [partner,     setPartner]    = useState<WLPartner | null>(null);
  const [partnerLoading, setPL]      = useState(true);
  const [heroPhoto,   setHeroPhoto]  = useState<string | null>(photoParam);
  const [heroFallback,setHeroFB]     = useState<string | null>(null);
  const [copied,      setCopied]     = useState(false);
  const [printing,    setPrinting]   = useState(false);

  // Load partner config
  useEffect(() => {
    if (!partnerSlug) { setPL(false); return; }
    fetch(`/api/admin/white-label?slug=${encodeURIComponent(partnerSlug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.partner) setPartner(d.partner); })
      .finally(() => setPL(false))
      .catch(() => setPL(false));
  }, [partnerSlug]);

  // Load property data — same chain as property-report
  useEffect(() => {
    if (!address) { setError('No address provided.'); setLoading(false); return; }
    const fetchPhoto = () => fetch('/api/property/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address})})
      .then(r=>r.ok?r.json():null).then(j=>{if(j?.ok&&j.data?.photoUrl)setHeroFB(j.data.photoUrl as string)}).catch(()=>{});
    const cached = piLsRead(address);
    if (cached) {
      const cdn = (cached.result as any).photo_url as string|null??null;
      const gm  = cached.mapUrls?.street_view_url??null;
      const p   = cdn??gm;
      if (!photoParam) setHeroPhoto(p);
      else if (p&&p!==photoParam) setHeroFB(p);
      setData({...cached.result, photoUrl: photoParam??p});
      setLoading(false);
      if (!cdn&&!photoParam) fetchPhoto();
      return;
    }
    fetch(`/api/beta/grok-property?address=${encodeURIComponent(address)}`)
      .then(r=>r.ok?r.json():null)
      .then(j => {
        if (j?.cached&&j?.result) {
          const cdn=(j.result as any)?.photo_url as string|null??null;
          const gm=j.map_urls?.street_view_url as string|null??null;
          const p=cdn??gm;
          if(!photoParam)setHeroPhoto(p);else if(p&&p!==photoParam)setHeroFB(p);
          setData({...j.result as PropData, photoUrl:photoParam??p});
          setLoading(false);
          if(!cdn&&!photoParam)fetchPhoto();
          return;
        }
        return fetch('/api/property/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address})})
          .then(r=>r.ok?r.json():Promise.reject())
          .then(lj=>{
            const d=lj?.data??{};
            setData({ current_status:(d.listingStatus as string)??null, current_list_price:(d.price as number)??null, bedrooms:(d.beds as number)??null, bathrooms:(d.baths as number)??null, sqft:(d.sqft as number)??null, year_built:(d.yearBuilt as number)??null, lot_size_sqft:(d.lotSqft as number)??null, days_on_market:(d.daysOnMarket as number)??null, price_per_sqft:(d.price&&d.sqft)?Math.round((d.price as number)/(d.sqft as number)):null, last_sold_price:(d.lastSalePrice as number)??null, last_sold_date:(d.lastSaleDate as string)??null, estimated_piti:null, rate_used:rateOver>0?rateOver:null, key_highlights:null, comparable_sales:null, grok_intelligence_summary:null, buyer_strategy:null, zillow_estimate:(d.estimatedValue as number)??null, redfin_estimate:null, zillow_saves:(d.zillowSaves as number)??null, zillow_views:(d.zillowViews as number)??null, redfin_views:(d.redfinViews as string)??null, social_proof_score:(d.socialProofScore as number)??null, interest_level:(d.interestLevel as string)??null, market_median_dom:null, market_sale_to_list:null, market_median_price:null, life_fit_score:null, school_score:null, walk_score:null, neighborhood_appreciation_3yr_pct:null, location_intelligence:null, photoUrl:photoParam??(d.photoUrl as string)??null });
            if(!photoParam&&d.photoUrl)setHeroPhoto(d.photoUrl as string);
            setLoading(false);
          });
      }).catch(()=>{setError('Failed to load property data.');setLoading(false);});
  }, [address, rateOver]);

  const handleShare  = useCallback(async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(()=>setCopied(false),2500); } catch { prompt('Copy link:',window.location.href); } }, []);
  const handlePrint  = useCallback(() => { setPrinting(true); setTimeout(()=>{window.print();setPrinting(false);},200); }, []);

  if (loading || partnerLoading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#080c12',color:'#8fa3b8',fontFamily:'DM Sans,sans-serif',flexDirection:'column',gap:16}}>
      <div style={{width:40,height:40,borderRadius:'50%',border:`3px solid ${partner?.accent_color??'#00e87a'}44`,borderTopColor:partner?.accent_color??'#00e87a',animation:'spin 0.8s linear infinite'}}/>
      <div style={{fontSize:14}}>Building your property report…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (error || !data) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#080c12',color:'#8fa3b8'}}>{error||'No data found.'}</div>;
  if (!partner) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#080c12',color:'#8fa3b8'}}>Partner not found. Check the URL.</div>;

  // ── Derived ───────────────────────────────────────────────────────────────────
  const price    = data.current_list_price ?? 0;
  const rate     = rateOver>0 ? rateOver : (data.rate_used??6.875);
  const downAmt  = Math.round(price*downPct/100);
  const loanAmt  = price-downAmt;
  const ltv      = downPct<80 ? (100-downPct) : 80;
  const pi       = calcPI(loanAmt, rate);
  const taxMo    = Math.round((price*0.0125)/12);
  const insMo    = Math.round((price*0.005)/12);
  const totalPITI = pi+taxMo+insMo;
  const loanType = loanAmt>1_089_300 ? '30-Yr Jumbo Fixed' : '30-Yr Conventional Fixed';
  const hasPMI   = downPct<20;
  const pi15     = calcPI(loanAmt,rate-0.47,180);
  const piARM    = calcPI(loanAmt,rate-0.63);
  const pitiIncome = (totalPITI/0.35)*12;
  const avm      = ((data.zillow_estimate??0)+(data.redfin_estimate??0))/2 || price;
  const avmDiff  = avm>0 ? ((avm-price)/avm)*100 : 0;
  const ltvScore = downPct>=20?90:downPct>=10?72:55;
  const l1Score  = Math.min(100,Math.round(ltvScore));
  const l2Score  = Math.min(100,Math.max(30,Math.round(50+avmDiff*5)));
  const domScore = data.market_median_dom ? Math.min(100,Math.max(30,Math.round(70-((data.days_on_market??0)-data.market_median_dom)*1.5))) : 65;
  const stlScore = data.market_sale_to_list ? Math.round(data.market_sale_to_list*100) : 70;
  const l3Score  = Math.round((domScore+stlScore)/2);
  const l4Score  = data.location_intelligence?.overall_score ?? data.life_fit_score ?? null;
  const composite = computeComposite(l1Score,l2Score,l3Score,l4Score);
  const verd      = composite!=null ? verdict(composite) : null;
  const today     = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const locSubs   = data.location_intelligence?.sub_scores??[];
  const wildfire  = locSubs.find(s=>/wildfire|fire/i.test(s.metric));
  const mainSubs  = locSubs.filter(s=>!/wildfire|fire/i.test(s.metric));
  const status    = data.current_status??'Active';
  const isPending = /pending/i.test(status);
  const isSold    = /sold/i.test(status);
  const comps     = data.comparable_sales?.slice(0,3)??[];
  const ac        = partner.accent_color;          // shorthand
  const yr        = new Date().getFullYear();

  // Nav chip — just a label, no external link
  const NavChip = ({label}:{label:string}) => (
    <span style={{fontFamily:'DM Mono,monospace',fontSize:9,letterSpacing:'0.1em',color:ac,border:`1px solid ${ac}33`,borderRadius:100,padding:'4px 11px',background:`${ac}08`,whiteSpace:'nowrap'}}>{label}</span>
  );

  // Page nav bar — identical structure per page, partner-branded
  const PageNav = ({section,page}:{section:string;page:string}) => (
    <div className="rp-nav">
      <div className="rp-nav-logo"><BrandLogo partner={partner} /></div>
      <NavChip label={section} />
      <div className="rp-nav-meta">
        <div className="rp-nav-type" style={{color:ac}}>{page}</div>
        <div className="rp-nav-date">{address.split(',').slice(0,2).join(',')}</div>
      </div>
    </div>
  );

  // Page footer
  const PageFooter = ({page}:{page:string}) => (
    <div className="rp-footer">
      <span className="rp-footer-left">{partner.name} · Property Intelligence Report · © {yr}</span>
      <span style={{fontFamily:'DM Mono,monospace',fontSize:9,color:ac}}>{partner.tagline ?? partner.name}</span>
      <span className="rp-footer-right">{page}</span>
    </div>
  );

  return (
    <>
      {/* Action bar — screen only, no HomeRates link */}
      <div className="rp-action-bar no-print">
        <div className="rp-action-bar-left">
          <BrandLogo partner={partner} height={28} />
          <span className="rp-action-addr">{address}</span>
        </div>
        <div className="rp-action-btns">
          <button className="rp-btn-ghost" onClick={handleShare}>{copied?'✓ Link copied!':'🔗 Share Report'}</button>
          <button className="rp-btn-primary" style={{background:ac,color:'#000'}} onClick={handlePrint} disabled={printing}>{printing?'Preparing…':'⬇ Download PDF'}</button>
        </div>
      </div>

      <div className="rp-book">

      {/* ═══ PAGE 1 — PROPERTY SNAPSHOT ═══════════════════════════════════════ */}
      <div className="rp-page">
        <div className="rp-watermark"/><div className="rp-watermark-corner"/>
        <PageNav section="Property Intelligence" page="Property Intelligence Report" />

        <div className="rp-hero">
          {(heroPhoto??data.photoUrl) ? <img src={heroPhoto??data.photoUrl??''} className="rp-hero-img" alt="Property" onError={e=>{const img=e.currentTarget as HTMLImageElement;if(heroFallback&&img.src!==heroFallback){img.src=heroFallback;}else{img.style.display='none';}}} /> : <div className="rp-hero-ph">🏡</div>}
          <div className="rp-hero-grad"/>
          <div className={`rp-status-badge ${isPending?'yellow':isSold?'red':'green'}`}><span className="rp-status-dot"/>{status}</div>
          <div className="rp-hero-overlay">
            <div><div className="rp-hero-price">{price?`$${fmt(price)}`:'—'}</div><div className="rp-hero-addr">{address}</div></div>
            <div style={{textAlign:'right'}}>
              <div className="rp-hero-piti-label">Est. Monthly PITI</div>
              <div className="rp-hero-piti" style={{color:ac}}>${fmt(totalPITI)}/mo</div>
              <div className="rp-hero-piti-sub">@ {rate}% · {downPct}% down</div>
            </div>
          </div>
        </div>

        <div className="rp-spec-strip">
          {[data.bedrooms!=null&&`${data.bedrooms} bd`,data.bathrooms!=null&&`${data.bathrooms} ba`,data.sqft!=null&&`${fmt(data.sqft)} sqft`,data.year_built!=null&&`Built ${data.year_built}`,data.lot_size_sqft!=null&&`${fmt(data.lot_size_sqft)} sf lot`,data.days_on_market!=null&&`${data.days_on_market} DOM`,data.price_per_sqft!=null&&`$${fmt(data.price_per_sqft)}/sqft`].filter(Boolean).map((s,i)=>(
            <div key={i} className="rp-spec-item">{s}</div>
          ))}
        </div>

        <div className="rp-grid-2col" style={{padding:'14px 36px 0'}}>
          <div className="rp-col">
            <div className="rp-card">
              <div className="rp-card-title">Intelligence Summary</div>
              <div className="rp-body-text">{data.grok_intelligence_summary??'Analysis not available.'}</div>
            </div>
            {data.key_highlights&&data.key_highlights.length>0&&(
              <div className="rp-card">
                <div className="rp-mono-label" style={{marginBottom:8}}>Key Highlights</div>
                <ul className="rp-hl-list">{data.key_highlights.slice(0,5).map((h,i)=><li key={i}><span className="rp-hl-dot" style={{background:ac}}/>{h}</li>)}</ul>
              </div>
            )}
            <div className="rp-avm-row">
              {data.zillow_estimate!=null&&<div className="rp-avm-item"><span className="rp-mono-label">Zillow Est.</span><span style={{fontSize:17,fontWeight:700,color:'#60a5fa'}}>{fmtK(data.zillow_estimate)}</span>{(data.zillow_saves!=null||data.zillow_views!=null)&&<span style={{fontSize:9,color:'#4b5c70',marginTop:2,display:'block'}}>{data.zillow_views!=null&&`${data.zillow_views.toLocaleString()} views`}{data.zillow_saves!=null&&data.zillow_views!=null&&' · '}{data.zillow_saves!=null&&data.zillow_saves>0&&`${data.zillow_saves} saves`}</span>}</div>}
              {data.redfin_estimate!=null&&<div className="rp-avm-item"><span className="rp-mono-label">Redfin Est.</span><span style={{fontSize:17,fontWeight:700,color:'#fb923c'}}>{fmtK(data.redfin_estimate)}</span></div>}
              <div className="rp-avm-item"><span className="rp-mono-label">AI Estimate</span><span style={{fontSize:17,fontWeight:700,color:ac}}>{fmtK(avm)}</span></div>
              <div className="rp-avm-item"><span className="rp-mono-label">vs. List</span><span style={{fontSize:17,fontWeight:700,color:avmDiff>=0?ac:'#f87171'}}>{avmDiff>=0?'+':''}{avmDiff.toFixed(1)}%</span></div>
            </div>
          </div>
          <div className="rp-col">
            <div className="rp-grid-2col" style={{gap:8}}>
              {data.life_fit_score!=null&&<div className="rp-stat-card"><span className="rp-mono-label">Life-Fit Score</span><span className="rp-stat-val" style={{color:scoreColor(data.life_fit_score)}}>{data.life_fit_score}</span></div>}
              <div className="rp-stat-card"><span className="rp-mono-label">Days on Market</span><span className="rp-stat-val">{data.days_on_market??'—'}<span style={{fontSize:13,color:'#4b5c70',fontWeight:400}}>d</span></span><span className="rp-stat-sub">Median: {data.market_median_dom??'—'}d area avg</span></div>
              <div className="rp-stat-card"><span className="rp-mono-label">Price / Sqft</span><span className="rp-stat-val">${fmt(data.price_per_sqft)}</span></div>
              <div className="rp-stat-card"><span className="rp-mono-label">Last Sold</span><span className="rp-stat-val" style={{fontSize:18,color:'#fbbf24'}}>{fmtK(data.last_sold_price)}</span><span className="rp-stat-sub" style={{fontFamily:'DM Mono,monospace',fontSize:9}}>{data.last_sold_date??''}</span></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              <div className="rp-mkt-card"><div className="rp-mono-label">Area Avg DOM</div><div className="rp-mkt-val">{data.market_median_dom??'—'}<span style={{fontSize:11,color:'#4b5c70'}}>d</span></div></div>
              <div className="rp-mkt-card"><div className="rp-mono-label">Sale / List</div><div className="rp-mkt-val">{data.market_sale_to_list!=null?`${(data.market_sale_to_list*100).toFixed(1)}%`:'—'}</div></div>
              <div className="rp-mkt-card"><div className="rp-mono-label">Median Price</div><div className="rp-mkt-val" style={{fontSize:15}}>{fmtK(data.market_median_price)}</div></div>
            </div>
            {comps.length>0&&(
              <div className="rp-card" style={{padding:0,overflow:'hidden',flex:1}}>
                <div style={{padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontFamily:'DM Mono,monospace',fontSize:9,letterSpacing:'0.16em',textTransform:'uppercase',color:'#4b5c70'}}>Recent Comps</div>
                <div className="rp-table-wrap"><table className="rp-table">
                  <thead><tr><th>Address</th><th>Sqft</th><th>Price</th><th>$/sqft</th><th>DOM</th></tr></thead>
                  <tbody>
                    <tr className="rp-subject-row"><td><strong>{address.split(',')[0]}</strong> <span className="rp-comp-tag" style={{background:`${ac}22`,color:ac}}>SUBJECT</span></td><td>{fmt(data.sqft)}</td><td style={{color:ac,fontWeight:600}}>{fmtK(price)}</td><td>${fmt(data.price_per_sqft)}</td><td>{data.days_on_market??'—'}d</td></tr>
                    {comps.map((c,i)=><tr key={i}><td>{c.address.split(',')[0]}</td><td>{fmt(c.sqft)}</td><td>{fmtK(c.sold_price)}</td><td>${fmt(c.price_per_sqft)}</td><td>{c.days_on_market??'—'}d</td></tr>)}
                  </tbody>
                </table></div>
              </div>
            )}
          </div>
        </div>
        <PageFooter page="Page 1 of 4" />
      </div>

      {/* ═══ PAGE 2 — MORTGAGE SCENARIO ════════════════════════════════════════ */}
      <div className="rp-page">
        <div className="rp-watermark"/><div className="rp-watermark-corner"/>
        <PageNav section="Financing Analysis" page="Mortgage Scenario Analysis" />

        <div className="rp-scenario-banner">
          <div className="rp-scenario-title">Your Financing Scenario</div>
          <div className="rp-scenario-sub">{loanType} · {downPct}% Down · ${fmt(loanAmt)} Loan · {rate}% Rate{hasPMI?'':' · No PMI'}</div>
        </div>

        <div className="rp-grid-2col" style={{padding:'14px 36px 0'}}>
          <div className="rp-col">
            <div className="rp-card">
              <div className="rp-mono-label" style={{marginBottom:14}}>Scenario Inputs</div>
              <div className="rp-grid-2col" style={{gap:14}}>
                {[['Purchase Price',`$${fmt(price)}`],['Down Payment',`$${fmt(downAmt)} (${downPct}%)`],['Loan Amount',`$${fmt(loanAmt)}`],['Interest Rate',`${rate}%`,ac],['Loan Type',loanType],['LTV',`${ltv.toFixed(1)}%${!hasPMI?' · No PMI':''}`]].map(([label,val,col])=>(
                  <div key={label as string}><div style={{fontSize:10,color:'#4b5c70',marginBottom:3}}>{label}</div><div style={{fontSize:16,fontWeight:700,color:(col as string)||'#f0f4ff'}}>{val}</div></div>
                ))}
              </div>
            </div>
            <div className="rp-piti-card">
              <div className="rp-piti-header">
                <div><div className="rp-mono-label">Total Monthly PITI</div><div style={{fontSize:11,color:'#4b5c70'}}>P · I · Tax · Insurance</div></div>
                <div style={{textAlign:'right'}}><div style={{fontSize:26,fontWeight:800,color:ac,letterSpacing:'-0.02em'}}>${fmt(totalPITI)}</div><div style={{fontSize:11,color:'#4b5c70'}}>/month</div></div>
              </div>
              {[['Principal & Interest',`$${fmt(pi)}`],[`Property Tax (1.25%)`,`$${fmt(taxMo)}`],['Homeowners Insurance',`$${fmt(insMo)}`],['HOA Dues','$0'],['PMI',hasPMI?`$${fmt(Math.round(loanAmt*0.008/12))}`:'$0 · NONE']].map(([label,val])=>(
                <div key={label} className="rp-piti-line"><span style={{fontSize:12,color:'#8fa3b8'}}>{label}</span><span style={{fontFamily:'DM Mono,monospace',fontSize:13,color:label==='PMI'&&!hasPMI?ac:'#f0f4ff'}}>{val}</span></div>
              ))}
            </div>
            {data.buyer_strategy&&<div className="rp-card"><div className="rp-mono-label" style={{marginBottom:8}}>AI Buyer Strategy</div><div className="rp-body-text">{data.buyer_strategy}</div></div>}
          </div>
          <div className="rp-col">
            <div className="rp-mono-label" style={{paddingTop:4,marginBottom:10}}>Loan Program Comparison</div>
            {[{type:loanType,rate:`${rate}%`,piti:`$${fmt(totalPITI)}/mo PITI`,note:null,selected:true},{type:loanType.replace('30-Yr','15-Yr'),rate:`${(rate-0.47).toFixed(2)}%`,piti:`$${fmt(pi15+taxMo+insMo)}/mo est.`,note:`+$${fmt(pi15-pi)}/mo · Pay off 15 yrs sooner`,selected:false},{type:loanType.replace('30-Yr','7/1 ARM'),rate:`${(rate-0.63).toFixed(2)}%`,piti:`$${fmt(piARM+taxMo+insMo)}/mo est.`,note:`-$${fmt(pi-piARM)}/mo · Rate adjusts after 7 yrs`,selected:false}].map(opt=>(
              <div key={opt.type} className={`rp-loan-opt${opt.selected?' selected':''}`} style={opt.selected?{borderColor:`${ac}55`,background:`${ac}08`}:{}}>
                <div style={{fontSize:11,fontWeight:600,color:'#8fa3b8',letterSpacing:'0.04em'}}>{opt.type}</div>
                <div style={{fontSize:24,fontWeight:800,letterSpacing:'-0.02em'}}>{opt.rate}</div>
                <div style={{fontSize:12,color:'#8fa3b8'}}>{opt.piti}</div>
                {opt.selected&&<div style={{fontSize:10,color:ac,fontWeight:700,marginTop:4}}>★ Your Scenario</div>}
                {opt.note&&<div style={{fontSize:10,color:'#4b5c70',marginTop:3}}>{opt.note}</div>}
              </div>
            ))}
            <div className="rp-card" style={{background:'#111827'}}>
              <div className="rp-mono-label" style={{marginBottom:12}}>Qualification Thresholds</div>
              {[['Min. Gross Income (35% DTI)',`$${fmt(Math.round(pitiIncome))} / yr`],['Min. Cash to Close (est.)',`$${fmt(Math.round(downAmt+price*0.027))}`],['PITI as % at $250K income',`${((totalPITI*12/250000)*100).toFixed(1)}%`]].map(([label,val])=>(
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:10,marginBottom:10}}>
                  <div style={{fontSize:11,color:'#4b5c70'}}>{label}</div>
                  <div style={{fontSize:16,fontWeight:700}}>{val}</div>
                </div>
              ))}
            </div>
            <div className="rp-card">
              <div className="rp-mono-label" style={{marginBottom:10}}>10-Year Equity Snapshot</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {[['After 1 Year',`$${fmt(Math.round(loanAmt*0.0082))}`,'#f0f4ff'],['After 5 Years',`$${fmt(Math.round(loanAmt*0.0453))}`,'#f0f4ff'],['After 10 Years',`$${fmt(Math.round(loanAmt*0.1038))}`,'#f0f4ff'],['Proj. Value (3.7%)',fmtK(Math.round(price*Math.pow(1.037,10))),ac]].map(([label,val,col])=>(
                  <div key={label} style={{background:'#111827',borderRadius:10,padding:'11px 14px'}}><div style={{fontFamily:'DM Mono,monospace',fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase',color:'#4b5c70',marginBottom:4}}>{label}</div><div style={{fontSize:16,fontWeight:700,color:col as string}}>{val}</div></div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <PageFooter page="Page 2 of 4" />
      </div>

      {/* ═══ PAGE 3 — LOCATION INTELLIGENCE ════════════════════════════════════ */}
      <div className="rp-page">
        <div className="rp-watermark"/><div className="rp-watermark-corner"/>
        <PageNav section="Location Intelligence · 15% of Index" page="Location Analysis" />

        {data.location_intelligence ? (
          <>
            <div className="rp-loc-hero">
              <div className="rp-loc-circle" style={{borderColor:scoreColor(data.location_intelligence.overall_score),color:scoreColor(data.location_intelligence.overall_score)}}>{data.location_intelligence.overall_score}</div>
              <div>
                <div className="rp-mono-label" style={{marginBottom:3}}>Location Score · 15% of Index</div>
                <div style={{fontSize:20,fontWeight:800,color:scoreColor(data.location_intelligence.overall_score),marginBottom:6}}>{data.location_intelligence.overall_score>=80?'Strong Location':data.location_intelligence.overall_score>=65?'Good Location':'Moderate Location'}</div>
                <div className="rp-body-text" style={{maxWidth:600}}>{data.location_intelligence.narrative}</div>
              </div>
            </div>
            {mainSubs.length>0&&(
              <div className="rp-loc-grid">
                {mainSubs.slice(0,6).map(s=>{const cls=locSubColor(s.score);const col=scoreColor(s.score);return(
                  <div key={s.metric} className={`rp-loc-card rp-loc-card-${cls}`}>
                    <div className="rp-mono-label" style={{marginBottom:6}}>{s.metric}</div>
                    <div style={{display:'flex',alignItems:'baseline',gap:4,marginBottom:3}}><span style={{fontSize:30,fontWeight:800,color:col}}>{s.score}</span><span style={{fontSize:12,color:'#4b5c70'}}>/100</span></div>
                    <div style={{fontSize:12,fontWeight:600,color:col,marginBottom:8}}>{s.rating}</div>
                    <div style={{fontSize:11,color:'#8fa3b8',lineHeight:1.55}}>{s.description}</div>
                  </div>
                );})}
              </div>
            )}
            {wildfire&&(
              <div className="rp-wildfire-card">
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}><span style={{fontSize:13}}>⚠</span><span className="rp-mono-label" style={{color:'#fb923c'}}>Wildfire Risk</span></div>
                  <div style={{display:'flex',alignItems:'baseline',gap:6}}><span style={{fontSize:36,fontWeight:800,color:'#fb923c'}}>{wildfire.score}</span><span style={{fontSize:13,color:'#4b5c70'}}>/100</span></div>
                  <div style={{fontSize:13,fontWeight:700,color:'#fb923c',marginTop:2,marginBottom:8}}>{wildfire.rating}</div>
                  <div className="rp-body-text">{wildfire.description}</div>
                </div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  {wildfire.fire_factor!=null&&<div className="rp-wf-chip"><div style={{fontSize:16,fontWeight:800,color:'#fb923c'}}>{wildfire.fire_factor}/10</div><div className="rp-mono-label">Fire Factor</div></div>}
                  {wildfire.risk_30yr_pct!=null&&<div className="rp-wf-chip"><div style={{fontSize:16,fontWeight:800,color:'#fb923c'}}>{wildfire.risk_30yr_pct}%</div><div className="rp-mono-label">30-Yr Risk</div></div>}
                  {wildfire.us_risk_percentile!=null&&<div className="rp-wf-chip"><div style={{fontSize:16,fontWeight:800,color:'#fb923c'}}>Top {wildfire.us_risk_percentile}%</div><div className="rp-mono-label">US Risk</div></div>}
                </div>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:'10px 36px 0'}}>
              <div className="rp-card">
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}><span style={{fontSize:11}}>✓</span><span className="rp-mono-label" style={{color:ac}}>Strengths</span></div>
                <ul className="rp-str-list">{data.location_intelligence.strengths.map((s,i)=><li key={i}><span className="rp-str-dot" style={{background:ac}}/>{s}</li>)}</ul>
              </div>
              <div className="rp-card">
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}><span style={{fontSize:11}}>⚠</span><span className="rp-mono-label" style={{color:'#fb923c'}}>Trade-offs</span></div>
                <ul className="rp-str-list">{data.location_intelligence.tradeoffs.map((t,i)=><li key={i}><span className="rp-str-dot orange"/>{t}</li>)}</ul>
              </div>
            </div>
            <div className="rp-rec-box" style={{margin:'10px 36px 0'}}>
              <span style={{fontSize:16,flexShrink:0}}>💡</span>
              <div><div className="rp-mono-label" style={{color:'#fbbf24',marginBottom:5}}>Location Recommendation</div><div style={{fontSize:13,color:'#f0f4ff',lineHeight:1.65}}>{data.location_intelligence.recommendation}</div></div>
            </div>
          </>
        ) : (
          <div style={{padding:'32px 36px',color:'#8fa3b8',fontSize:13}}>Location intelligence requires a Full Market Analysis run on this property first.</div>
        )}
        <PageFooter page="Page 3 of 4" />
      </div>

      {/* ═══ PAGE 4 — DECISION SCORE + DISCLOSURES ══════════════════════════════ */}
      <div className="rp-page">
        <div className="rp-watermark"/><div className="rp-watermark-corner"/>
        <PageNav section="AI Decision Score" page="Autonomous Decision Score" />

        <div className="rp-ds-hero">
          <ScoreRing score={composite??0} size={108}/>
          <div>
            {verd&&<div style={{fontSize:24,fontWeight:800,color:verd.color,marginBottom:5}}>{verd.label}</div>}
            <div style={{fontSize:13,color:'#8fa3b8',marginBottom:12}}>Based on {[l1Score,l2Score,l3Score,l4Score].filter(s=>s!=null).length} of 4 levels scored.</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              {composite!=null&&<span className="rp-chip" style={{background:`${ac}18`,borderColor:`${ac}35`,color:ac}}>{[l1Score,l2Score,l3Score,l4Score].filter(s=>s!=null).length} of 4 levels scored</span>}
              <span className="rp-chip">{loanType} · {downPct}% down · {rate}%</span>
              <span className="rp-chip" style={{maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{address}</span>
            </div>
          </div>
        </div>

        <div className="rp-ds-levels">
          <div className="rp-mono-label" style={{marginBottom:6}}>4 Decision Levels</div>
          {[{n:'L1',name:'Financial Readiness',weight:'35%',score:l1Score,sub:`${loanType} · ${downPct}% down · ${ltv.toFixed(1)}% LTV · ${rate}% rate${hasPMI?' · PMI applies':' · No PMI'}. Income threshold ~$${fmt(Math.round(pitiIncome))}/yr.`},{n:'L2',name:'Property Evaluation',weight:'25%',score:l2Score,sub:`PITI $${fmt(totalPITI)}/mo. AI value estimate ${fmtK(avm)} vs list ${fmtK(price)} (${avmDiff>=0?'+':''}${avmDiff.toFixed(1)}%). ${avmDiff>=0?'List priced below AI estimate.':'List above AI estimate — negotiate or appraise.'}`},{n:'L3',name:'Market Intelligence',weight:'25%',score:l3Score,sub:`Median DOM ${data.market_median_dom??'—'}d, sale-to-list ${data.market_sale_to_list!=null?`${(data.market_sale_to_list*100).toFixed(1)}%`:'—'}. Subject at ${data.days_on_market??'—'} DOM.`},...(l4Score!=null?[{n:'L4',name:'Location Intelligence',weight:'15%',score:l4Score,sub:data.location_intelligence?`${data.location_intelligence.sub_scores.slice(0,3).map(s=>`${s.metric}: ${s.rating} (${s.score})`).join('. ')}.`:`Overall location score: ${l4Score}/100.`}]:[])].map(lvl=>(
            <div key={lvl.n} className="rp-ds-row">
              <div className="rp-ds-circle" style={{borderColor:scoreColor(lvl.score),color:scoreColor(lvl.score)}}>{lvl.score}</div>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                  <span style={{fontSize:14,fontWeight:700}}>{lvl.name}</span>
                  <span className="rp-weight-chip">{lvl.weight}</span>
                </div>
                <div style={{fontSize:11.5,color:'#8fa3b8',marginBottom:9,lineHeight:1.5}}>{lvl.sub}</div>
                <div style={{height:6,background:'rgba(255,255,255,0.06)',borderRadius:100,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${lvl.score}%`,background:scoreColor(lvl.score),borderRadius:100}}/>
                </div>
              </div>
              <div style={{fontFamily:'DM Mono,monospace',fontSize:19,fontWeight:800,color:scoreColor(lvl.score),minWidth:44,textAlign:'right'}}>{lvl.score} <span style={{fontSize:10,color:'#4b5c70',fontWeight:400}}>/ 100</span></div>
            </div>
          ))}
        </div>

        <div className="rp-legend">
          <div className="rp-mono-label" style={{marginRight:16}}>Score Legend</div>
          {[['#4ade80','85–100 Strong Buy'],['#4ade80','70–84 Ready to Offer'],['#fbbf24','55–69 Buy with Caution'],['#fbbf24','40–54 Watch the Market'],['#f87171','0–39 Hold Off']].map(([col,lbl])=>(
            <div key={lbl} style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#8fa3b8'}}><span style={{width:7,height:7,borderRadius:'50%',background:col,flexShrink:0,display:'inline-block'}}/>{lbl}</div>
          ))}
        </div>

        {/* Partner CTA — no HomeRates link */}
        {partner.contact_email && (
          <div className="rp-cta-box" style={{background:`linear-gradient(135deg,${ac}18,${ac}08)`,border:`1px solid ${ac}35`}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:5}}>Ready to move forward?</div>
              <div style={{fontSize:12,color:'#8fa3b8',lineHeight:1.55}}>Connect with {partner.name} to explore your financing options and structure the strongest possible offer.</div>
            </div>
            <a href={`mailto:${partner.contact_email}`} className="rp-cta-btn" style={{background:ac,color:'#000'}}>Contact {partner.name} →</a>
          </div>
        )}

        <div className="no-print" style={{margin:'10px 36px 0',display:'flex',gap:10}}>
          <button onClick={handleShare} className="rp-share-inline">{copied?'✓ Report link copied':'🔗 Share this report'}</button>
          <button onClick={handlePrint} className="rp-download-inline" style={{background:`${ac}12`,borderColor:`${ac}35`,color:ac}}>⬇ Download PDF</button>
        </div>

        {/* Disclosures — canonical, same on all white-label surfaces */}
        <div style={{margin:'12px 36px 0',borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:14}}>
          <div className="rp-mono-label" style={{marginBottom:10}}>Disclosures &amp; Attribution</div>
          <div className="rp-disc">{EDUCATIONAL_DISCLAIMER}</div>
          <div className="rp-disc">{DATA_ATTRIBUTION} AVM data: Zillow · Redfin · comparable sales. Wildfire risk: First Street Foundation.</div>
          <div className="rp-disc" style={{marginTop:8,color:'rgba(75,92,112,0.6)'}}>© {yr} {partner.name}{partner.tagline?` · ${partner.tagline}`:''} · For recipient use only · Not for redistribution</div>
        </div>

        <PageFooter page="Page 4 of 4" />
      </div>

      </div>{/* end rp-book */}
    </>
  );
}

export default function WLReportPage() {
  return (
    <div className="page-standalone" style={{background:'#000'}}>
      <Suspense fallback={<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#080c12',color:'#8fa3b8',fontFamily:'sans-serif'}}>Loading report…</div>}>
        <WLReportInner />
      </Suspense>
      {/* Reuse the same print CSS from property-report */}
      <style dangerouslySetInnerHTML={{__html: WL_CSS}} />
    </div>
  );
}

const WL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
  @page { size: letter portrait; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 13px; line-height: 1.5; }
  .rp-book { width: 816px; margin: 0 auto; display: flex; flex-direction: column; background: #080c12; padding-top: 52px; }
  .rp-action-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 999; background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.08); padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .rp-action-bar-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .rp-action-addr { font-size: 12px; color: #8fa3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rp-action-btns { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .rp-btn-ghost { background: none; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #8fa3b8; font-size: 12px; font-family: 'DM Sans',sans-serif; padding: 7px 14px; cursor: pointer; }
  .rp-btn-primary { font-weight: 700; font-size: 12px; font-family: 'DM Sans',sans-serif; border: none; border-radius: 8px; padding: 8px 18px; cursor: pointer; }
  .rp-page { width: 816px; min-height: 1056px; position: relative; overflow: hidden; padding-bottom: 50px; background: #080c12; }
  .rp-page + .rp-page { border-top: 3px solid #000; }
  .rp-watermark { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
  .rp-watermark-corner { position: absolute; bottom: 60px; right: 28px; width: 48px; height: 48px; opacity: 0.04; pointer-events: none; z-index: 0; }
  .rp-nav { display: flex; align-items: center; padding: 12px 36px; border-bottom: 1px solid rgba(255,255,255,0.06); background: #0d1117; position: relative; z-index: 1; gap: 14px; }
  .rp-nav-logo img { height: 28px; width: auto; display: block; }
  .rp-nav-meta { margin-left: auto; text-align: right; }
  .rp-nav-type { font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 2px; }
  .rp-nav-date { font-size: 11px; color: #8fa3b8; }
  .rp-hero { position: relative; width: 100%; height: 240px; overflow: hidden; background: #111827; }
  .rp-hero-img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.75); }
  .rp-hero-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 64px; opacity: 0.12; background: linear-gradient(135deg,#111827,#1a2a1a); }
  .rp-hero-grad { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(8,12,18,0) 0%, rgba(8,12,18,0.8) 75%, rgba(8,12,18,1) 100%); }
  .rp-status-badge { position: absolute; top: 14px; left: 36px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 100px; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
  .rp-status-badge.green { background: rgba(0,232,122,0.2); border: 1px solid rgba(0,232,122,0.4); color: #00e87a; }
  .rp-status-badge.yellow { background: rgba(251,191,36,0.2); border: 1px solid rgba(251,191,36,0.4); color: #fbbf24; }
  .rp-status-badge.red { background: rgba(248,113,113,0.2); border: 1px solid rgba(248,113,113,0.4); color: #f87171; }
  .rp-status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .rp-hero-overlay { position: absolute; bottom: 0; left: 36px; right: 36px; padding-bottom: 16px; display: flex; align-items: flex-end; justify-content: space-between; }
  .rp-hero-price { font-size: 40px; font-weight: 800; letter-spacing: -0.03em; color: #fff; margin-bottom: 3px; }
  .rp-hero-addr { font-size: 13px; color: rgba(255,255,255,0.6); }
  .rp-hero-piti-label { font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 3px; }
  .rp-hero-piti { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
  .rp-hero-piti-sub { font-size: 10px; color: rgba(255,255,255,0.35); margin-top: 2px; }
  .rp-spec-strip { display: flex; align-items: center; background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 36px; position: relative; z-index: 1; flex-wrap: wrap; }
  .rp-spec-item { font-size: 12px; color: #8fa3b8; padding: 12px 16px 12px 0; margin-right: 16px; border-right: 1px solid rgba(255,255,255,0.06); white-space: nowrap; }
  .rp-spec-item:last-child { border-right: none; }
  .rp-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .rp-col { display: flex; flex-direction: column; gap: 10px; }
  .rp-card { background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px 18px; position: relative; z-index: 1; }
  .rp-card-title { font-size: 13px; font-weight: 700; margin-bottom: 9px; }
  .rp-body-text { font-size: 12px; line-height: 1.72; color: #8fa3b8; }
  .rp-mono-label { font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #4b5c70; }
  .rp-hl-list { list-style: none; display: flex; flex-direction: column; gap: 7px; margin-top: 10px; }
  .rp-hl-list li { display: flex; align-items: flex-start; gap: 9px; font-size: 12px; color: #8fa3b8; line-height: 1.5; }
  .rp-hl-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .rp-avm-row { display: flex; background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; position: relative; z-index: 1; }
  .rp-avm-item { flex: 1; padding: 12px 14px; border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 4px; }
  .rp-avm-item:last-child { border-right: none; }
  .rp-stat-card { background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; position: relative; z-index: 1; }
  .rp-stat-val { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
  .rp-stat-sub { font-size: 10px; color: #4b5c70; }
  .rp-mkt-card { background: #111827; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 11px 13px; position: relative; z-index: 1; }
  .rp-mkt-val { font-size: 18px; font-weight: 800; margin-top: 5px; }
  .rp-table-wrap { overflow-x: auto; }
  .rp-table { width: 100%; border-collapse: collapse; }
  .rp-table th { font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #4b5c70; padding: 7px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .rp-table td { padding: 8px 10px; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .rp-table tr:last-child td { border-bottom: none; }
  .rp-subject-row td { background: rgba(255,255,255,0.03); }
  .rp-comp-tag { display: inline-block; font-size: 8px; font-weight: 700; padding: 1px 6px; border-radius: 100px; margin-left: 5px; letter-spacing: 0.06em; }
  .rp-scenario-banner { background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 18px 36px; position: relative; z-index: 1; }
  .rp-scenario-title { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 3px; }
  .rp-scenario-sub { font-size: 12px; color: #8fa3b8; }
  .rp-piti-card { background: #111827; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; position: relative; z-index: 1; }
  .rp-piti-header { padding: 13px 18px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; }
  .rp-piti-line { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .rp-piti-line:last-child { border-bottom: none; }
  .rp-loan-opt { background: #111827; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; position: relative; z-index: 1; }
  .rp-loc-hero { display: flex; align-items: flex-start; gap: 18px; padding: 18px 36px; background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.06); position: relative; z-index: 1; }
  .rp-loc-circle { width: 64px; height: 64px; border-radius: 50%; border: 3px solid; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; background: rgba(74,222,128,0.08); flex-shrink: 0; }
  .rp-loc-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 10px 36px 0; }
  .rp-loc-card { background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 15px 16px; position: relative; overflow: hidden; z-index: 1; }
  .rp-loc-card::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; }
  .rp-loc-card-green::after { background: #4ade80; } .rp-loc-card-yellow::after { background: #fbbf24; } .rp-loc-card-orange::after { background: #fb923c; } .rp-loc-card-red::after { background: #f87171; }
  .rp-wildfire-card { margin: 10px 36px 0; background: rgba(251,146,60,0.06); border: 1px solid rgba(251,146,60,0.22); border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; gap: 20px; position: relative; z-index: 1; }
  .rp-wf-chip { background: rgba(251,146,60,0.12); border: 1px solid rgba(251,146,60,0.22); border-radius: 10px; padding: 10px 14px; text-align: center; min-width: 80px; }
  .rp-str-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .rp-str-list li { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #8fa3b8; line-height: 1.5; }
  .rp-str-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .rp-str-dot.orange { background: #fb923c; }
  .rp-rec-box { background: rgba(251,191,36,0.05); border: 1px solid rgba(251,191,36,0.18); border-radius: 12px; padding: 14px 18px; display: flex; align-items: flex-start; gap: 12px; position: relative; z-index: 1; }
  .rp-ds-hero { display: flex; align-items: flex-start; gap: 28px; padding: 18px 36px; background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.06); position: relative; z-index: 1; }
  .rp-ds-levels { padding: 12px 36px; display: flex; flex-direction: column; gap: 8px; position: relative; z-index: 1; }
  .rp-ds-row { background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 15px 18px; display: grid; grid-template-columns: 46px 1fr auto; gap: 14px; align-items: center; }
  .rp-ds-circle { width: 42px; height: 42px; border-radius: 50%; border: 3px solid; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; }
  .rp-weight-chip { font-family: 'DM Mono',monospace; font-size: 10px; padding: 2px 7px; border-radius: 100px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.06); color: #8fa3b8; }
  .rp-chip { padding: 4px 12px; border-radius: 100px; font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.06); color: #8fa3b8; }
  .rp-legend { margin: 0 36px; background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 13px 18px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; position: relative; z-index: 1; }
  .rp-cta-box { margin: 10px 36px 0; border-radius: 14px; padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; gap: 20px; position: relative; z-index: 1; }
  .rp-cta-btn { font-weight: 700; font-size: 13px; padding: 11px 22px; border-radius: 9px; text-decoration: none; flex-shrink: 0; font-family: 'DM Sans',sans-serif; }
  .rp-disc { font-family: 'DM Mono',monospace; font-size: 9.5px; line-height: 1.7; color: #4b5c70; margin-bottom: 7px; position: relative; z-index: 1; }
  .rp-footer { position: absolute; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 9px 36px; border-top: 1px solid rgba(255,255,255,0.06); background: #0d1117; z-index: 1; }
  .rp-footer-left, .rp-footer-right { font-family: 'DM Mono',monospace; font-size: 9px; color: #4b5c70; }
  .rp-share-inline { background: none; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #8fa3b8; font-size: 12px; font-family: 'DM Sans',sans-serif; padding: 8px 16px; cursor: pointer; }
  .rp-download-inline { border: 1px solid; border-radius: 8px; font-size: 12px; font-family: 'DM Sans',sans-serif; padding: 8px 16px; cursor: pointer; font-weight: 600; }
  @media print {
    body, .page-standalone { min-height: 0 !important; height: auto !important; background: #000 !important; }
    .no-print { display: none !important; }
    .rp-book { padding-top: 0 !important; width: 816px !important; margin: 0 auto !important; zoom: 0.88; }
    .rp-page { width: 816px !important; min-height: unset !important; break-after: page !important; page-break-after: always !important; border-top: none !important; }
    .rp-page:last-child { break-after: auto !important; page-break-after: auto !important; }
    .rp-grid-2col { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
    .rp-loc-grid { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 6px !important; }
    .rp-hero { height: 150px !important; }
    .rp-card { padding: 10px 12px !important; }
    .rp-col  { gap: 7px !important; }
    .rp-nav  { padding: 8px 32px !important; }
    .rp-body-text { overflow: hidden !important; display: -webkit-box !important; -webkit-line-clamp: 4 !important; -webkit-box-orient: vertical !important; }
  }
  @media (max-width: 840px) {
    .rp-book { width: 100%; padding-top: 56px; }
    .rp-page { width: 100%; min-height: unset; padding-bottom: 28px; }
    .rp-nav { padding: 10px 16px; }
    .rp-hero { height: 180px; }
    .rp-hero-overlay { left: 16px; right: 16px; padding-bottom: 12px; }
    .rp-hero-price { font-size: 24px; } .rp-hero-piti { font-size: 18px; }
    .rp-spec-strip { padding: 0 16px; }
    .rp-grid-2col { grid-template-columns: 1fr; }
    .rp-loc-grid { grid-template-columns: 1fr 1fr; }
    .rp-scenario-banner, .rp-loc-hero, .rp-ds-hero, .rp-ds-levels, .rp-loc-grid, .rp-wildfire-card, .rp-legend, .rp-cta-box { padding-left: 16px; padding-right: 16px; }
    .rp-wildfire-card, .rp-legend, .rp-cta-box { margin-left: 0; margin-right: 0; }
    .rp-footer { padding: 8px 16px; position: relative; }
    .rp-footer-right { display: none; }
  }
`;
