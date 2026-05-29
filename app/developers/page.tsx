import AppNav from '../components/AppNav';

export const metadata = {
  title: 'Developer API — HomeRates.ai',
  description: 'Embed AI-powered property decision scores and 4-page intelligence reports into your platform. One API call.',
};

const BASE = 'https://chat.homerates.ai';

const CURL = `curl -X POST ${BASE}/api/instant-score \\
  -H "Content-Type: application/json" \\
  -d '{"address": "3111 Gardenia Ln, Yorba Linda, CA 92886"}'`;

const RESPONSE = `{
  "ok": true,
  "composite": 72,
  "verdict": "Ready to Offer",
  "scores": {
    "l1": 86,  "l1_summary": "Conventional · 10% down · LTV 90.0% · 6.88% rate",
    "l2": 58,  "l2_summary": "Listed +7.3% vs AVM $4,194K",
    "l3": 72,  "l3_summary": "Median DOM 16d · sale-to-list 99% · 120 Zillow views · High demand",
    "l4": 68,  "l4_summary": "Walk Score: Car-Dependent · Schools: 81 · Safety: 82"
  },
  "property": {
    "address": "3111 Gardenia Ln, Yorba Linda, CA 92886",
    "price": 4500000,
    "beds": 6,  "baths": 7.5,  "sqft": 6800,
    "listing_status": "FOR_SALE",
    "social_proof_score": 74,
    "interest_level": "High"
  },
  "scenario": { "down_pct": 10, "rate": 6.875, "loan_type": "conventional" },
  "report_url": "${BASE}/property-report?address=3111+Gardenia+Ln...",
  "instant_url": "${BASE}/instant?address=3111+Gardenia+Ln...",
  "processing_ms": 4180
}`;

const JS_EXAMPLE = `const res = await fetch('${BASE}/api/instant-score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    address: '3111 Gardenia Ln, Yorba Linda, CA 92886',
    scenario: { down_pct: 20, rate: 6.53, loan_type: 'conventional' }
  })
});
const { composite, verdict, scores, report_url } = await res.json();
console.log(\`Score: \${composite} — \${verdict}\`);
// → Score: 72 — Ready to Offer`;

const PYTHON_EXAMPLE = `import requests

res = requests.post('${BASE}/api/instant-score', json={
    'address': '3111 Gardenia Ln, Yorba Linda, CA 92886',
    'scenario': {'down_pct': 20, 'rate': 6.53}
})
data = res.json()
print(f"Score: {data['composite']} — {data['verdict']}")
# → Score: 72 — Ready to Offer`;

const IFRAME_EXAMPLE = `<!-- Drop this anywhere in your page -->
<iframe
  src="${BASE}/instant?address=YOUR_PROPERTY_ADDRESS"
  width="100%"
  height="800"
  frameborder="0"
  style="border-radius: 12px; overflow: hidden;"
  allow="clipboard-write"
/>`;

const WIDGET_EXAMPLE = `<!-- Pre-fill with a specific address -->
<iframe
  src="${BASE}/instant?address=3111+Gardenia+Ln%2C+Yorba+Linda%2C+CA+92886"
  width="680"
  height="900"
  frameborder="0"
/>

<!-- Or leave it blank for users to type their own -->
<iframe
  src="${BASE}/instant"
  width="680"
  height="600"
  frameborder="0"
/>`;

export default function DevelopersPage() {
  return (
    <div className="page-standalone" style={{ background: '#080c12', minHeight: '100vh', color: '#d0dcea', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <AppNav />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#00e87a', marginBottom: 12 }}>
            Developer API
          </div>
          <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 900, letterSpacing: '-0.03em', color: '#f0f4ff', marginBottom: 14, lineHeight: 1.15 }}>
            Embed AI Property Intelligence<br />into your platform
          </h1>
          <p style={{ fontSize: '1rem', color: '#6b80a0', lineHeight: 1.65, maxWidth: 580 }}>
            One API call returns a complete four-level buyer decision score, property data, and a shareable 4-page intelligence report. $29/month includes a monthly report credit allocation — add more credits as you grow.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <a href="/instant" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#00e87a', color: '#060d0a', fontWeight: 800, fontSize: '0.85rem', padding: '10px 20px', borderRadius: 9, textDecoration: 'none' }}>
              ↗ Try it live
            </a>
            <a href="mailto:support@homerates.ai" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.04)', color: '#c4cfe0', fontWeight: 700, fontSize: '0.85rem', padding: '10px 20px', borderRadius: 9, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>
              ✉ Get API access
            </a>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 48 }} />

        {/* Option 1: API */}
        <Section label="Option 1" title="REST API Call" badge="Most flexible">
          <p style={bodyText}>
            Call <code style={inlineCode}>POST /api/instant-score</code> from your server or client. Returns structured JSON with all four level scores, property data, and a direct link to the hosted report. Process the response however you like — display the score in your UI, store it in your CRM, trigger workflows based on the verdict.
          </p>

          <Label>Endpoint</Label>
          <CodeBlock>{`POST ${BASE}/api/instant-score\nContent-Type: application/json`}</CodeBlock>

          <Label>Request body</Label>
          <CodeBlock>{`{
  "address": "string",          // full street address  — required
  "url": "string",              // OR Redfin/Zillow URL — required if no address

  "scenario": {                 // optional — defaults applied if omitted
    "down_pct": 20,             // down payment % (default: 10% conv, 20% jumbo)
    "rate": 6.53,               // interest rate (default: live FRED rate)
    "loan_type": "conventional" // conventional | fha | va | jumbo
  }
}`}</CodeBlock>

          <Label>Example — cURL</Label>
          <CodeBlock>{CURL}</CodeBlock>

          <Label>Response</Label>
          <CodeBlock>{RESPONSE}</CodeBlock>
        </Section>

        {/* Option 2: JavaScript */}
        <Section label="Option 2" title="JavaScript / TypeScript">
          <CodeBlock lang="js">{JS_EXAMPLE}</CodeBlock>
        </Section>

        {/* Option 3: Python */}
        <Section label="Option 3" title="Python">
          <CodeBlock lang="py">{PYTHON_EXAMPLE}</CodeBlock>
        </Section>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '48px 0' }} />

        {/* Option 4: Iframe */}
        <Section label="Option 4" title="Iframe Embed" badge="Fastest to ship">
          <p style={bodyText}>
            Drop an iframe into any page and the full HomeRates instant score experience runs inside your product. No backend work — just copy and paste the snippet. The user types an address (or you pre-fill it) and gets the full score + report link. Works on any platform — CRM, LOS overlay, website, portal.
          </p>

          <Label>Blank input (user types address)</Label>
          <CodeBlock lang="html">{IFRAME_EXAMPLE}</CodeBlock>

          <Label>Pre-filled address (point to a specific property)</Label>
          <CodeBlock lang="html">{WIDGET_EXAMPLE}</CodeBlock>

          <div style={{ background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 10, padding: '14px 18px', marginTop: 16 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#00e87a', marginBottom: 5 }}>Tip: shareable pre-filled links</div>
            <div style={{ fontSize: '0.72rem', color: '#6b80a0', lineHeight: 1.6 }}>
              Any URL with <code style={inlineCode}>?address=</code> pre-fills the input. Send <code style={inlineCode}>{BASE}/instant?address=YOUR_ADDRESS</code> directly to clients — they open it on any device and run the score instantly. No iframe needed.
            </div>
          </div>
        </Section>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '48px 0' }} />

        {/* What you get */}
        <Section label="What you get" title="Complete output on every call">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 4 }}>
            {[
              ['L1 Financial Readiness', 'LTV, loan type, DTI, rate environment — 35% weight'],
              ['L2 Property Evaluation', 'AVM gap vs. list price — 25% weight'],
              ['L3 Market Intelligence', 'DOM velocity, sale-to-list, Zillow views, demand signal — 25% weight'],
              ['L4 Location Intelligence', 'Walk, schools, wildfire, commute, appreciation — 15% weight'],
              ['Composite score + verdict', '"Ready to Offer", "Buy with Caution", etc.'],
              ['Hosted 4-page report URL', 'Shareable PDF report, print-ready, client-ready'],
              ['Instant score URL', 'Pre-filled link to run score on any device'],
              ['Social proof signals', 'Zillow views, saves, Redfin demand rank, interest level'],
            ].map(([title, desc]) => (
              <div key={title} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '13px 16px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: '0.68rem', color: '#4b6080', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '48px 0' }} />

        {/* Pricing */}
        <Section label="Pricing" title="$29 / month — credits included">
          {/* Main plan card */}
          <div style={{ background: 'linear-gradient(135deg, rgba(0,232,122,0.07), rgba(0,180,89,0.03))', border: '1px solid rgba(0,232,122,0.22)', borderRadius: 14, padding: '22px 24px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: '2.4rem', fontWeight: 900, color: '#00e87a', letterSpacing: '-0.03em', lineHeight: 1 }}>$29</span>
              <span style={{ fontSize: '0.85rem', color: '#4b6080', fontWeight: 600 }}>/month</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#c4cfe0', marginBottom: 14, fontWeight: 600 }}>Starter plan — monthly report credits included</div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                'Monthly report credit allocation included',
                'Full L1–L4 Decision Score on every report',
                'Shareable 4-page PDF intelligence report',
                'API access via POST /api/instant-score',
                'Add more credits when you need them',
              ].map(item => (
                <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '0.78rem', color: '#8fa3b8', lineHeight: 1.5 }}>
                  <span style={{ color: '#00e87a', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Add-on tiers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 4 }}>
            {[
              ['White-label branding', '$49', 'per month · your logo on every report'],
              ['Enterprise / volume', 'Custom', 'contact us for high-volume pricing'],
            ].map(([label, price, unit]) => (
              <div key={label} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '13px 16px' }}>
                <div style={{ fontSize: '0.62rem', color: '#4b6080', marginBottom: 6, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#00e87a', letterSpacing: '-0.02em', lineHeight: 1 }}>{price}</div>
                <div style={{ fontSize: '0.62rem', color: '#4b6080', marginTop: 3 }}>{unit}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#3a4560', marginTop: 16, lineHeight: 1.6 }}>
            Credit allocations and top-up pricing confirmed at signup. <a href="mailto:support@homerates.ai" style={{ color: '#60a5fa', textDecoration: 'none' }}>Contact us</a> for enterprise or white-label setup.
          </div>
        </Section>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '48px 0' }} />

        {/* White-label */}
        <Section label="White Label" title="Your brand on every report">
          <p style={bodyText}>
            With white-label rights (add-on to your plan), the 4-page PDF report carries your logo, brand colours, and domain — not HomeRates. Clients see your brand on every deliverable. The intelligence engine stays the same. Contact us to set up custom branding.
          </p>
          <a href="mailto:support@homerates.ai" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(0,232,122,0.08)', color: '#00e87a', fontWeight: 700, fontSize: '0.85rem', padding: '10px 20px', borderRadius: 9, textDecoration: 'none', border: '1px solid rgba(0,232,122,0.25)', marginTop: 8 }}>
            ✉ Request white-label setup
          </a>
        </Section>

        {/* CTA footer */}
        <div style={{ marginTop: 64, padding: '28px 32px', background: 'linear-gradient(135deg, rgba(0,232,122,0.07), rgba(0,180,89,0.03))', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f0f4ff', marginBottom: 6 }}>Ready to integrate?</div>
            <div style={{ fontSize: '0.78rem', color: '#6b80a0', lineHeight: 1.5 }}>Try the live tool first — no signup. Then contact us for an API key and white-label access.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/instant" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#00e87a', color: '#060d0a', fontWeight: 800, fontSize: '0.85rem', padding: '11px 22px', borderRadius: 10, textDecoration: 'none' }}>
              ↗ Try it now — free
            </a>
            <a href="mailto:support@homerates.ai" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.04)', color: '#c4cfe0', fontWeight: 700, fontSize: '0.85rem', padding: '11px 22px', borderRadius: 10, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>
              ✉ support@homerates.ai
            </a>
          </div>
        </div>

      </div>

      <style>{`
        html:has(.page-standalone) { height: auto !important; overflow: visible !important; }
        body:has(.page-standalone) { display: block !important; height: auto !important; overflow: visible !important; }
        pre { white-space: pre-wrap; word-break: break-all; }
        code { font-family: 'DM Mono', 'Courier New', monospace; }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, title, badge, children }: { label: string; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b6080' }}>{label}</span>
        {badge && <span style={{ fontSize: '0.58rem', fontWeight: 700, background: 'rgba(0,232,122,0.1)', color: '#00e87a', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 4, padding: '2px 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{badge}</span>}
      </div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f0f4ff', letterSpacing: '-0.02em', marginBottom: 16 }}>{title}</h2>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b6080', margin: '20px 0 8px' }}>
      {children}
    </div>
  );
}

function CodeBlock({ children, lang }: { children: string; lang?: string }) {
  return (
    <div style={{ background: '#060d17', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
      {lang && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3a4560' }}>{lang}</span>
        </div>
      )}
      <pre style={{ margin: 0, padding: '16px 18px', fontSize: '0.72rem', lineHeight: 1.7, color: '#94a3b8', overflowX: 'auto', fontFamily: "'DM Mono', 'Courier New', monospace" }}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

const bodyText: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#6b80a0',
  lineHeight: 1.7,
  marginBottom: 4,
};

const inlineCode: React.CSSProperties = {
  fontFamily: "'DM Mono', 'Courier New', monospace",
  fontSize: '0.8em',
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  padding: '1px 6px',
  color: '#c4cfe0',
};
