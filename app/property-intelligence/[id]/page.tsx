// app/property-intelligence/[id]/page.tsx
//
// Canonical public Property Intelligence page — pilot implementation of the
// approved Canonical Property Intelligence Publishing Architecture.
//
// This is NOT a listing page. It renders HomeRates' financial and decision
// intelligence layer around a real property, sourced entirely from already-
// enriched data (properties + featured_properties). No Grok/Tavily call is
// made from this route. See lib/propertyIntelligencePilot.ts for the full
// data-assembly and fact-classification logic.
//
// No borrower information of any kind is fetched, rendered, or referenced
// here — this route never queries buyer_evaluation_sessions, discover_sessions,
// or any user-specific table.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AppNav from '../../components/AppNav';
import { getPropertyIntelligencePilotData, type FactLabel, type LabeledValue } from '../../../lib/propertyIntelligencePilot';

export const dynamic = 'force-dynamic';

const BASE = 'https://chat.homerates.ai';

interface Props { params: Promise<{ id: string }> }

function fmt$(n: number | null): string {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

function streetAndCityState(data: NonNullable<Awaited<ReturnType<typeof getPropertyIntelligencePilotData>>>): { street: string; cityState: string } {
  const full = data.address.value;
  const parts = full.split(',');
  return { street: parts[0]?.trim() ?? full, cityState: parts.slice(1).join(',').trim() };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getPropertyIntelligencePilotData(id);
  if (!data) return { title: 'Property Not Found | HomeRates.ai' };

  const { street, cityState } = streetAndCityState(data);
  const url = `${BASE}/property-intelligence/${id}`;
  const title = `${street} — Home + Mortgage Intelligence | HomeRates.ai`;
  const description = data.eligibility !== 'unavailable'
    ? `Financing, valuation, and ownership-cost intelligence for ${street}, ${cityState}. Illustrative scenario, sourced and dated — not a listing.`
    : `HomeRates.ai property intelligence for ${street}, ${cityState}.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: data.eligibility === 'index'
      ? { index: true, follow: true }
      : { index: false, follow: true },
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 16, borderBottom: '1px solid #1e2d45', paddingBottom: 10 }}>
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
  const data = await getPropertyIntelligencePilotData(id);
  if (!data) notFound();

  const { street, cityState } = streetAndCityState(data);
  const url = `${BASE}/property-intelligence/${id}`;

  const schemaWebPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${street} — Home + Mortgage Intelligence`,
    description: `HomeRates.ai financial and decision intelligence for ${data.address.value}. Illustrative scenario, not a listing or offer.`,
    url,
    isPartOf: { '@type': 'WebSite', name: 'HomeRates.ai', url: BASE },
    ...(data.provenance.intelligenceComputedAt ? { dateModified: data.provenance.intelligenceComputedAt } : {}),
  };
  const schemaPlace = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: data.address.value,
    address: {
      '@type': 'PostalAddress',
      streetAddress: street,
      addressLocality: data.city ?? undefined,
      addressRegion: data.state ?? undefined,
      postalCode: data.zip ?? undefined,
      addressCountry: 'US',
    },
  };
  const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
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
            Intelligence page. We do not fabricate figures to fill a page — this page will populate once genuine
            valuation and comparable-sale data is available.
          </p>
        </main>
      </div>
    );
  }

  const f = data.financing;
  const oc = data.ownershipCost;
  const di = data.decisionIntelligence;

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
              This page has partial intelligence and is not yet included in search indexing.
            </div>
          )}

          {/* ── Header ── */}
          <div style={{ marginBottom: 8, color: 'rgba(200,214,230,0.4)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Home + Mortgage Intelligence — Not a Listing
          </div>
          <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.15 }}>{street}</h1>
          <p style={{ color: 'rgba(200,214,230,0.55)', fontSize: 16, marginBottom: 28 }}>{cityState}</p>

          <p style={{ color: 'rgba(200,214,230,0.7)', fontSize: 14.5, lineHeight: 1.6, marginBottom: 40, borderLeft: '2px solid #1e2d45', paddingLeft: 14 }}>
            HomeRates.ai is not a listing service and has no listing relationship to this property. This page is the
            financial and decision-intelligence layer HomeRates.ai builds around a real address — valuation context,
            illustrative financing, ownership cost, and location intelligence — each labeled by the kind of claim it is.
          </p>

          {/* ── 1. Property ── */}
          <Section title="Property">
            <Row label="Property type" value={data.propertyFacts.propertyType.value ?? 'Not resolved'} tag={data.propertyFacts.propertyType.label} />
            <Row label="Beds / Baths" value={`${data.propertyFacts.beds.value ?? '—'} bd / ${data.propertyFacts.baths.value ?? '—'} ba`} tag="PROPERTY FACT" />
            <Row label="Square footage" value={data.propertyFacts.sqft.value ? `${data.propertyFacts.sqft.value.toLocaleString()} sqft` : '—'} tag="PROPERTY FACT" />
            <Row label="List price" value={fmt$(data.valuation.listPrice.value)} tag="PROPERTY FACT" />
          </Section>

          {/* ── 2. Valuation Intelligence ── */}
          <Section title="Valuation Intelligence">
            <Row
              label="Automated valuation (AVM)"
              value={fmt$(data.valuation.avm.value)}
              tag="ESTIMATE"
              source={`Zillow ${fmt$(data.valuation.zillowEstimate)} · Redfin ${fmt$(data.valuation.redfinEstimate)}${data.valuation.freshness ? ` — captured ${new Date(data.valuation.freshness).toLocaleDateString()}` : ''}`}
            />
            {data.valuation.comparables.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ color: 'rgba(200,214,230,0.5)', fontSize: 12.5, marginBottom: 8 }}>
                  Comparable sales <Tag label="MARKET FACT" />
                </div>
                {data.valuation.comparables.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(200,214,230,0.75)', padding: '6px 0', borderBottom: '1px solid #131f33' }}>
                    <span>{c.address}</span>
                    <span>{c.soldPrice ? fmt$(c.soldPrice) : '—'}{c.soldDate ? ` · ${c.soldDate}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── 3. Financing Intelligence ── */}
          <Section title="Financing Intelligence">
            <p style={{ color: 'rgba(200,214,230,0.5)', fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
              Illustrative scenario only — {f.scenario.downPaymentPct}% down, {f.scenario.creditScore} credit score,{' '}
              {f.scenario.loanType}, {f.scenario.termYears}yr fixed, primary residence. Not a personalized quote or a
              commitment to lend. <Tag label="ILLUSTRATIVE ASSUMPTION" />
            </p>
            <Row label="Illustrative loan amount" value={fmt$(f.loanAmount.value)} tag="DERIVED CALCULATION" />
            <Row label="Loan-limit zone" value={f.conformingStatus === 'standard' ? 'Conforming' : f.conformingStatus === 'high_balance' ? 'High-balance conforming' : 'Above conforming limit (jumbo)'} tag="MARKET FACT" source={f.conformingCeiling.source} />
            <Row
              label="Market rate anchor"
              value={`${f.marketRate.value.rate.toFixed(3)}%`}
              tag="MARKET FACT"
              source={`${f.marketRate.value.seriesLabel}${f.marketRate.value.observationDate ? ` — observed ${f.marketRate.value.observationDate}` : ''}`}
            />
            <Row label="Illustrative rate (after LLPA)" value={`${f.lenderParRate.value.toFixed(3)}%`} tag="DERIVED CALCULATION" source={`${f.totalLLPAPoints.toFixed(2)} LLPA points, ${f.llpaEffectiveDate} matrix`} />
            <Row label="Estimated principal & interest" value={`${fmt$(f.monthlyPI.value)}/mo`} tag="DERIVED CALCULATION" />
            <p style={{ color: 'rgba(200,214,230,0.35)', fontSize: 11, marginTop: 14, lineHeight: 1.5 }}>{f.llpaDataSource}</p>
            <p style={{ color: 'rgba(200,214,230,0.35)', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>{f.llpaDisclaimer}</p>
          </Section>

          {/* ── 4. Ownership Cost Intelligence ── */}
          <Section title="Ownership Cost Intelligence">
            <Row label="Property tax (est.)" value={`${fmt$(oc.monthlyTax.value)}/mo`} tag={oc.taxRate.label} source={`${oc.taxRate.source} — ${(oc.taxRate.value.rate * 100).toFixed(2)}%/yr`} />
            <Row label="Homeowners insurance (est.)" value={`${fmt$(oc.monthlyInsurance.value)}/mo`} tag="ESTIMATE" source={oc.monthlyInsurance.source} />
            <Row label="Estimated monthly PITI" value={`${fmt$(oc.estimatedMonthlyPITI.value)}/mo`} tag="DERIVED CALCULATION" />
          </Section>

          {/* ── 5. Decision Intelligence ── */}
          {di && (
            <Section title="Decision Intelligence">
              <p style={{ color: 'rgba(200,214,230,0.5)', fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
                Property-centered only — price-vs-value fit, market fit, and location fit. Does not include buyer-specific
                affordability or Personal Fit, which HomeRates.ai never publishes for any real buyer.
              </p>
              {di.l2 && <Row label="Value fit (L2)" value={`${di.l2.score}/100`} tag="DERIVED CALCULATION" source={di.l2.summary} />}
              {di.l3 && <Row label="Market fit (L3)" value={`${di.l3.score}/100`} tag="DERIVED CALCULATION" source={di.l3.summary} />}
              {di.l4 && <Row label="Location fit (L4)" value={`${di.l4.score}/100`} tag="DERIVED CALCULATION" source={di.l4.summary} />}
              <p style={{ color: 'rgba(200,214,230,0.35)', fontSize: 11, marginTop: 14 }}>
                {di.methodologyVersion}{di.computedAt ? ` — computed ${new Date(di.computedAt).toLocaleDateString()}` : ''}
              </p>
            </Section>
          )}

          {/* ── 6. Market / Location Intelligence ── */}
          {(data.locationIntelligence || data.market.medianDom.value != null) && (
            <Section title="Market & Location Intelligence">
              {data.market.medianDom.value != null && (
                <Row label="Area median days on market" value={`${data.market.medianDom.value}d`} tag="MARKET FACT" />
              )}
              {data.market.saleToListPct.value != null && (
                <Row label="Area sale-to-list ratio" value={`${data.market.saleToListPct.value.toFixed(1)}%`} tag="MARKET FACT" />
              )}
              {data.locationIntelligence?.narrative && (
                <div style={{ marginTop: 16, color: 'rgba(200,214,230,0.8)', fontSize: 14, lineHeight: 1.6 }}>
                  {data.locationIntelligence.narrative.value} <Tag label="AI INTERPRETATION" />
                </div>
              )}
              {data.locationIntelligence && data.locationIntelligence.subScores.length > 0 && (
                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                  {data.locationIntelligence.subScores.map((s, i) => (
                    <div key={i} style={{ background: '#0b1221', border: '1px solid #1e2d45', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ color: 'rgba(200,214,230,0.5)', fontSize: 11 }}>{s.metric}</div>
                      <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 700 }}>{s.rating}</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ── 7. Questions this property raises ── */}
          <Section title="Questions This Property Raises">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ color: '#fff', fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>How does the asking price compare with available valuation evidence?</div>
                <div style={{ color: 'rgba(200,214,230,0.65)', fontSize: 13.5, lineHeight: 1.5 }}>
                  {data.valuation.listPrice.value != null && data.valuation.avm.value != null
                    ? `Listed at ${fmt$(data.valuation.listPrice.value)} against an AVM estimate of ${fmt$(data.valuation.avm.value)} (${data.valuation.listPrice.value > data.valuation.avm.value ? 'above' : 'at or below'} estimated value) and ${data.valuation.comparables.length} comparable sale${data.valuation.comparables.length === 1 ? '' : 's'} on record.`
                    : 'Insufficient valuation evidence to compare list price against value on this property today.'}
                </div>
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>What might ownership cost beyond principal and interest?</div>
                <div style={{ color: 'rgba(200,214,230,0.65)', fontSize: 13.5, lineHeight: 1.5 }}>
                  Illustrative tax and insurance add an estimated {fmt$(oc.monthlyTax.value + oc.monthlyInsurance.value)}/mo on top of the {fmt$(f.monthlyPI.value)}/mo principal & interest estimate above, for a total estimated PITI near {fmt$(oc.estimatedMonthlyPITI.value)}/mo under the illustrative scenario.
                </div>
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>What financing variables could materially change this scenario?</div>
                <div style={{ color: 'rgba(200,214,230,0.65)', fontSize: 13.5, lineHeight: 1.5 }}>
                  A different credit score, down payment, or loan type changes the LLPA points applied and the resulting rate —
                  {f.conformingStatus === 'above_limit'
                    ? ' this loan amount is above the conforming limit for this area, so jumbo pricing (not Fannie Mae LLPA) applies and financing terms vary more by lender.'
                    : f.conformingStatus === 'high_balance'
                      ? ' this loan amount falls in the high-balance conforming range, which carries its own surcharge above the standard conforming grid.'
                      : ' this loan amount is within the standard conforming grid for this area.'}
                </div>
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>What should I verify before making an offer?</div>
                <div style={{ color: 'rgba(200,214,230,0.65)', fontSize: 13.5, lineHeight: 1.5 }}>
                  Current listing status, HOA fees and rules, actual property tax bill, and a personalized rate quote from a
                  licensed lender — the figures above are HomeRates.ai's own illustrative estimates, not verified transaction terms.
                </div>
              </div>
            </div>
          </Section>

          {/* ── Provenance footer ── */}
          <Section title="Sources & Freshness">
            <div style={{ fontSize: 12.5, color: 'rgba(200,214,230,0.55)', lineHeight: 1.9 }}>
              <div>Property record enriched: {data.provenance.propertyEnrichedAt ? new Date(data.provenance.propertyEnrichedAt).toLocaleDateString() : 'unknown'}{data.provenance.propertyEnrichmentSource ? ` (source: ${data.provenance.propertyEnrichmentSource})` : ''}</div>
              <div>Valuation, comps, and location intelligence computed: {data.provenance.intelligenceComputedAt ? new Date(data.provenance.intelligenceComputedAt).toLocaleDateString() : 'unknown'}</div>
              <div>{f.llpaDataSource}</div>
              {f.marketRate.value.observationDate && <div>Market rate observed: {f.marketRate.value.observationDate} (FRED / OBMMI)</div>}
              <div style={{ marginTop: 10, color: 'rgba(200,214,230,0.35)' }}>Page generated at request time from stored HomeRates.ai intelligence — no figure on this page is generated by an AI model without being labeled as such.</div>
            </div>
          </Section>

        </main>
      </div>
    </>
  );
}
