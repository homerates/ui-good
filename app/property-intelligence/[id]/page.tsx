// app/property-intelligence/[id]/page.tsx
//
// THE canonical public Property Intelligence page — the only indexable public
// URL for a property in this system. The five existing interactive property
// tools (property-report, wl-report, instant, check-property, property-intel)
// remain client-only with no page metadata and are not made indexable here or
// anywhere else by this change.
//
// Renders five public Property Intelligence cards (not "Decision Score
// L1-L5" — a separate, distinct, buyer-specific system that stays private).
// No borrower information of any kind is fetched, rendered, or referenced —
// this route never queries buyer_evaluation_sessions, discover_sessions,
// decision_score_history, or any user-specific table.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AppNav from '../../components/AppNav';
import { getPropertyIntelligenceData, type FactLabel } from '../../../lib/propertyIntelligence';

export const dynamic = 'force-dynamic';

const BASE = 'https://chat.homerates.ai';

interface Props { params: Promise<{ id: string }> }

function fmt$(n: number | null): string {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

function streetAndCityState(fullAddress: string): { street: string; cityState: string } {
  const parts = fullAddress.split(',');
  return { street: parts[0]?.trim() ?? fullAddress, cityState: parts.slice(1).join(',').trim() };
}

const LIFECYCLE_LABEL: Record<string, string> = {
  active: 'For Sale',
  pending: 'Pending',
  sold: 'Sold — Historical Record',
  off_market: 'Off Market — Historical Record',
  unknown: 'Status Unconfirmed',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getPropertyIntelligenceData(id);
  if (!data) return { title: 'Property Not Found | HomeRates.ai' };

  const { street, cityState } = streetAndCityState(data.address.value);
  const url = `${BASE}/property-intelligence/${id}`;
  const title = `${street} — Home + Mortgage Intelligence | HomeRates.ai`;
  const description = data.eligibility !== 'unavailable'
    ? `Financing, valuation, and ownership-cost intelligence for ${street}, ${cityState}. Illustrative scenario, sourced and dated — not a listing.`
    : `HomeRates.ai property intelligence for ${street}, ${cityState}.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: data.eligibility === 'index' ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url, siteName: 'HomeRates.ai', type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

function Tag({ label }: { label: FactLabel }) {
  const colors: Record<FactLabel, { bg: string; fg: string; border: string }> = {
    'PROPERTY FACT':          { bg: 'rgba(56,189,248,0.10)',  fg: '#7dd3fc', border: 'rgba(56,189,248,0.30)' },
    'MARKET FACT':            { bg: 'rgba(0,232,122,0.10)',   fg: '#5eead4', border: 'rgba(0,232,122,0.30)' },
    'ILLUSTRATIVE ASSUMPTION':{ bg: 'rgba(240,192,64,0.10)',  fg: '#fbbf24', border: 'rgba(240,192,64,0.30)' },
    'DERIVED CALCULATION':    { bg: 'rgba(167,139,250,0.10)', fg: '#c4b5fd', border: 'rgba(167,139,250,0.30)' },
    'ESTIMATE':               { bg: 'rgba(200,214,230,0.08)', fg: '#94a3b8', border: 'rgba(200,214,230,0.20)' },
    'AI INTERPRETATION':      { bg: 'rgba(244,114,182,0.10)', fg: '#f9a8d4', border: 'rgba(244,114,182,0.30)' },
  };
  const c = colors[label];
  return (
    <span style={{ display: 'inline-block', background: c.bg, color: c.fg, border: `1px solid ${c.border}`, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 5, marginLeft: 8, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function Card({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36, background: '#0b1221', border: '1px solid #1e2d45', borderRadius: 14, padding: '22px 24px' }}>
      <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, background: 'rgba(0,232,122,0.12)', color: '#00e87a', fontSize: 12, fontWeight: 900 }}>{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, tag, source }: { label: string; value: React.ReactNode; tag: FactLabel; source?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid #131f33' }}>
      <span style={{ color: 'rgba(200,214,230,0.65)', fontSize: 14 }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{value}</span>
        <Tag label={tag} />
        {source && <div style={{ color: 'rgba(200,214,230,0.35)', fontSize: 11, marginTop: 3 }}>{source}</div>}
      </span>
    </div>
  );
}

export default async function PropertyIntelligencePage({ params }: Props) {
  const { id } = await params;
  const data = await getPropertyIntelligenceData(id);
  if (!data) notFound();

  const { street, cityState } = streetAndCityState(data.address.value);
  const url = `${BASE}/property-intelligence/${id}`;

  const schemaWebPage = {
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: `${street} — Home + Mortgage Intelligence`,
    description: `HomeRates.ai financial and decision intelligence for ${data.address.value}. Illustrative scenario, not a listing or offer.`,
    url, isPartOf: { '@type': 'WebSite', name: 'HomeRates.ai', url: BASE },
    ...(data.provenance.intelligenceComputedAt ? { dateModified: data.provenance.intelligenceComputedAt } : {}),
  };
  const schemaPlace = {
    '@context': 'https://schema.org', '@type': 'Place', name: data.address.value,
    address: { '@type': 'PostalAddress', streetAddress: street, addressLocality: data.city ?? undefined, addressRegion: data.state ?? undefined, postalCode: data.zip ?? undefined, addressCountry: 'US' },
  };
  const schemaBreadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Property Intelligence', item: `${BASE}/property-intelligence` },
      { '@type': 'ListItem', position: 3, name: street, item: url },
    ],
  };

  if (data.eligibility === 'unavailable') {
    return (
      <div className="page-standalone" style={{ minHeight: '100dvh', background: '#080f1c' }}>
        <AppNav />
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>{street}</h1>
          <p style={{ color: 'rgba(200,214,230,0.55)', marginTop: 8 }}>{cityState}</p>
          <p style={{ color: 'rgba(200,214,230,0.75)', marginTop: 24, lineHeight: 1.6 }}>
            HomeRates.ai does not yet have enough verified intelligence for this property to publish a Home + Mortgage
            Intelligence page. We do not fabricate figures to fill a page.
          </p>
        </main>
      </div>
    );
  }

  const f = data.financing;
  const oc = data.ownershipCost;
  const di = data.decisionIntelligence;
  const isHistorical = data.lifecycleStatus === 'sold' || data.lifecycleStatus === 'off_market';

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaWebPage) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaPlace) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }} />

      <div className="page-standalone" style={{ minHeight: '100dvh', background: '#080f1c' }}>
        <AppNav />
        <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

          {data.eligibility === 'noindex' && (
            <div style={{ background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, color: '#fbbf24', fontSize: 12.5 }}>
              {isHistorical ? 'This property is no longer active. This page is retained as a historical intelligence record and is not included in search indexing.' : 'This page has partial intelligence and is not yet included in search indexing.'}
            </div>
          )}

          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: 'rgba(200,214,230,0.4)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Home + Mortgage Intelligence — Not a Listing</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 5, background: isHistorical ? 'rgba(200,214,230,0.08)' : 'rgba(0,232,122,0.1)', color: isHistorical ? '#94a3b8' : '#5eead4', border: `1px solid ${isHistorical ? 'rgba(200,214,230,0.2)' : 'rgba(0,232,122,0.3)'}` }}>
              {LIFECYCLE_LABEL[data.lifecycleStatus]}
            </span>
          </div>
          <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.15 }}>{street}</h1>
          <p style={{ color: 'rgba(200,214,230,0.55)', fontSize: 16, marginBottom: 28 }}>{cityState}</p>

          <p style={{ color: 'rgba(200,214,230,0.7)', fontSize: 14.5, lineHeight: 1.6, marginBottom: 32, borderLeft: '2px solid #1e2d45', paddingLeft: 14 }}>
            HomeRates.ai is not a listing service and has no listing relationship to this property. This page is the
            financial and decision-intelligence layer HomeRates.ai builds around a real address, organized into five
            public intelligence categories — each figure labeled by the kind of claim it is.
          </p>

          {/* CARD 1 — Property & Value Intelligence */}
          <Card number={1} title="Property & Value Intelligence">
            <Row label="Property type" value={data.propertyFacts.propertyType.value ?? 'Not resolved'} tag="PROPERTY FACT" />
            <Row label="Beds / Baths" value={`${data.propertyFacts.beds.value ?? '—'} bd / ${data.propertyFacts.baths.value ?? '—'} ba`} tag="PROPERTY FACT" />
            <Row label="Square footage" value={data.propertyFacts.sqft.value ? `${data.propertyFacts.sqft.value.toLocaleString()} sqft` : '—'} tag="PROPERTY FACT" />
            <Row label={data.lifecycleStatus === 'sold' ? 'Last sale price' : 'List price'} value={data.lifecycleStatus === 'sold' ? fmt$(data.valuation.lastSalePrice) : fmt$(data.valuation.listPrice.value)} tag="PROPERTY FACT" />
            <Row label="Automated valuation (AVM)" value={fmt$(data.valuation.avm.value)} tag="ESTIMATE" source={data.valuation.avmSources.length ? `Averaged from: ${data.valuation.avmSources.join(', ')}` : undefined} />
            {data.valuation.comparables.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ color: 'rgba(200,214,230,0.5)', fontSize: 12.5, marginBottom: 8 }}>Comparable sales <Tag label="MARKET FACT" /></div>
                {data.valuation.comparables.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(200,214,230,0.75)', padding: '6px 0', borderBottom: '1px solid #131f33' }}>
                    <span>{c.address}</span>
                    <span>{c.soldPrice ? fmt$(c.soldPrice) : '—'}{c.soldDate ? ` · ${c.soldDate}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* CARD 2 — Financing Intelligence */}
          <Card number={2} title="Financing Intelligence">
            {f ? (
              <>
                <p style={{ color: 'rgba(200,214,230,0.5)', fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
                  Illustrative scenario only — {f.scenario.downPaymentPct}% down, {f.scenario.creditScore} credit score, {f.scenario.loanType}, {f.scenario.termYears}yr fixed, primary residence. Not a personalized quote or a commitment to lend. <Tag label="ILLUSTRATIVE ASSUMPTION" />
                </p>
                <Row label="Illustrative loan amount" value={fmt$(f.loanAmount.value)} tag="DERIVED CALCULATION" />
                <Row label="Loan-limit zone" value={f.conformingStatus === 'standard' ? 'Conforming' : f.conformingStatus === 'high_balance' ? 'High-balance conforming' : 'Above conforming limit (jumbo)'} tag="MARKET FACT" source={f.conformingCeiling.source} />
                <Row label="Market rate anchor" value={`${f.marketRate.value.rate.toFixed(3)}%`} tag="MARKET FACT" source={`${f.marketRate.value.seriesLabel}${f.marketRate.value.observationDate ? ` — observed ${f.marketRate.value.observationDate}` : ''}`} />
                <Row label="Illustrative rate (after LLPA)" value={`${f.lenderParRate.value.toFixed(3)}%`} tag="DERIVED CALCULATION" source={`${f.totalLLPAPoints.toFixed(2)} LLPA points, ${f.llpaEffectiveDate} matrix`} />
                <Row label="Estimated principal & interest" value={`${fmt$(f.monthlyPI.value)}/mo`} tag="DERIVED CALCULATION" />
                <p style={{ color: 'rgba(200,214,230,0.35)', fontSize: 11, marginTop: 14, lineHeight: 1.5 }}>{f.llpaDataSource}</p>
                <p style={{ color: 'rgba(200,214,230,0.35)', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>{f.llpaDisclaimer}</p>
              </>
            ) : (
              <p style={{ color: 'rgba(200,214,230,0.5)', fontSize: 13.5 }}>Not enough resolved price data to build an illustrative financing scenario for this property.</p>
            )}
          </Card>

          {/* CARD 3 — Ownership Cost Intelligence */}
          <Card number={3} title="Ownership Cost Intelligence">
            {oc ? (
              <>
                <Row label="Property tax (est.)" value={`${fmt$(oc.monthlyTax.value)}/mo`} tag={oc.taxRate.label} source={`${oc.taxRate.source} — ${(oc.taxRate.value.rate * 100).toFixed(2)}%/yr`} />
                <Row label="Homeowners insurance (est.)" value={`${fmt$(oc.monthlyInsurance.value)}/mo`} tag="ESTIMATE" source={oc.monthlyInsurance.source} />
                {oc.monthlyHoa.value != null && <Row label="HOA" value={`${fmt$(oc.monthlyHoa.value)}/mo`} tag="PROPERTY FACT" />}
                <Row label="Estimated monthly PITI" value={`${fmt$(oc.estimatedMonthlyPITI.value)}/mo`} tag="DERIVED CALCULATION" />
              </>
            ) : (
              <p style={{ color: 'rgba(200,214,230,0.5)', fontSize: 13.5 }}>Not enough resolved price data to estimate ownership cost for this property.</p>
            )}
          </Card>

          {/* CARD 4 — Market & Location Intelligence */}
          <Card number={4} title="Market & Location Intelligence">
            {data.market.medianDom.value != null && <Row label="Area median days on market" value={`${data.market.medianDom.value}d`} tag="MARKET FACT" />}
            {data.market.saleToListPct.value != null && <Row label="Area sale-to-list ratio" value={`${data.market.saleToListPct.value.toFixed(1)}%`} tag="MARKET FACT" />}
            {data.locationIntelligence?.narrative && (
              <div style={{ marginTop: 16, color: 'rgba(200,214,230,0.8)', fontSize: 14, lineHeight: 1.6 }}>
                {data.locationIntelligence.narrative.value} <Tag label="AI INTERPRETATION" />
              </div>
            )}
            {data.locationIntelligence && data.locationIntelligence.subScores.length > 0 && (
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {data.locationIntelligence.subScores.map((s, i) => (
                  <div key={i} style={{ background: '#0d1729', border: '1px solid #1e2d45', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ color: 'rgba(200,214,230,0.5)', fontSize: 11 }}>{s.metric}</div>
                    <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 700 }}>{s.rating}</div>
                  </div>
                ))}
              </div>
            )}
            {!data.locationIntelligence && data.market.medianDom.value == null && (
              <p style={{ color: 'rgba(200,214,230,0.5)', fontSize: 13.5 }}>No market or location intelligence on record for this property.</p>
            )}
          </Card>

          {/* CARD 5 — Decision Intelligence */}
          <Card number={5} title="Decision Intelligence">
            <p style={{ color: 'rgba(200,214,230,0.5)', fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
              Property-centered only — price-vs-value fit, market fit, and location fit. This is not a buyer-specific
              affordability score and HomeRates.ai never publishes Personal Fit or any real buyer's Decision Score.
            </p>
            {di ? (
              <>
                {di.l2 && <Row label="Value fit" value={`${di.l2.score}/100`} tag="DERIVED CALCULATION" source={di.l2.summary} />}
                {di.l3 && <Row label="Market fit" value={`${di.l3.score}/100`} tag="DERIVED CALCULATION" source={di.l3.summary} />}
                {di.l4 && <Row label="Location fit" value={`${di.l4.score}/100`} tag="DERIVED CALCULATION" source={di.l4.summary} />}
                {di.strengths.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ color: '#5eead4', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Key strengths</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(200,214,230,0.75)', fontSize: 13.5, lineHeight: 1.7 }}>
                      {di.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {di.concerns.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Key concerns</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(200,214,230,0.75)', fontSize: 13.5, lineHeight: 1.7 }}>
                      {di.concerns.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {di.missing.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>What's missing / verify before an offer</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(200,214,230,0.75)', fontSize: 13.5, lineHeight: 1.7 }}>
                      {di.missing.map((s, i) => <li key={i}>{s}</li>)}
                      <li>Current listing status and a personalized rate quote from a licensed lender.</li>
                    </ul>
                  </div>
                )}
                <p style={{ color: 'rgba(200,214,230,0.35)', fontSize: 11, marginTop: 14 }}>
                  {di.methodologyVersion} — {di.source === 'featured_properties' ? 'as computed for a HomeRates.ai user' : 'computed from cached property intelligence'}{di.computedAt ? `, ${new Date(di.computedAt).toLocaleDateString()}` : ''}
                </p>
              </>
            ) : (
              <p style={{ color: 'rgba(200,214,230,0.5)', fontSize: 13.5 }}>Not enough resolved intelligence to compute value, market, or location fit for this property.</p>
            )}
          </Card>

          {/* Provenance footer */}
          <Card number={0} title="Sources & Freshness">
            <div style={{ fontSize: 12.5, color: 'rgba(200,214,230,0.55)', lineHeight: 1.9 }}>
              <div>Property record enriched: {data.provenance.propertyEnrichedAt ? new Date(data.provenance.propertyEnrichedAt).toLocaleDateString() : 'unknown'}{data.provenance.propertyEnrichmentSource ? ` (source: ${data.provenance.propertyEnrichmentSource})` : ''}</div>
              {data.provenance.snapshotFetchedAt && <div>Listing snapshot fetched: {new Date(data.provenance.snapshotFetchedAt).toLocaleDateString()}</div>}
              {data.provenance.grokCacheFetchedAt && <div>Valuation, comps, and location intelligence captured: {new Date(data.provenance.grokCacheFetchedAt).toLocaleDateString()}</div>}
              {f && <div>{f.llpaDataSource}</div>}
              {f?.marketRate.value.observationDate && <div>Market rate observed: {f.marketRate.value.observationDate} (FRED / OBMMI)</div>}
              <div style={{ marginTop: 10, color: 'rgba(200,214,230,0.35)' }}>Page generated at request time from stored HomeRates.ai intelligence — no figure on this page is generated by an AI model without being labeled as such.</div>
            </div>
          </Card>

        </main>
      </div>
    </>
  );
}
