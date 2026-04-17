// app/market-news/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { marketNewsArticles } from './articles';
import { getFredSnapshot } from '@/lib/fred';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Market News | HomeRates.ai',
  description: 'Mortgage rate updates, housing inventory trends, and Fed policy analysis — what the market is doing and what it means for buyers.',
  alternates: { canonical: 'https://chat.homerates.ai/market-news' },
};

const TAG_COLORS: Record<string, string> = {
  'Rates': '#00e87a',
  'Fed / Rates': '#00e87a',
  'Demand': '#3d8bff',
  'Inventory': '#ff8c42',
  'Economy': '#a78bfa',
  // DB article tags
  'Mortgage Rates': '#00e87a',
  'Fed Policy': '#a78bfa',
  'Housing Market': '#3d8bff',
  'Home Prices': '#ff8c42',
  'Refinance': '#3d8bff',
};

interface ArticleCard {
  slug: string;
  title: string;
  excerpt: string;
  tag: string;
  date: string;
  readTime: string;
}

async function getDbArticles(): Promise<ArticleCard[]> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await sb
      .from('generated_articles')
      .select('slug, title, excerpt, tag, read_time, published_at')
      .eq('category', 'market-news')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50);
    return (data ?? []).map((a) => ({
      slug: a.slug,
      title: a.title,
      excerpt: a.excerpt,
      tag: a.tag ?? 'Market News',
      date: new Date(a.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      readTime: `${a.read_time ?? 5} min read`,
    }));
  } catch { return []; }
}

async function fetchEffrRate(): Promise<number | null> {
  try {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) return null;
    const url = new URL('https://api.stlouisfed.org/fred/series/observations');
    url.searchParams.set('series_id', 'EFFR');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('limit', '5');
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = await res.json() as { observations?: { value: string }[] };
    const obs = (json.observations ?? []).find((o) => o.value && o.value !== '.');
    return obs ? parseFloat(obs.value) : null;
  } catch { return null; }
}

function fmtRate(n: number | null): string {
  return n != null ? `${n.toFixed(2)}%` : '—';
}

export default async function MarketNewsPage() {
  const [dbArticles, snap, effr] = await Promise.all([
    getDbArticles(),
    getFredSnapshot({ timeoutMs: 6000 }),
    fetchEffrRate(),
  ]);
  const staticCards: ArticleCard[] = marketNewsArticles.map((a) => ({
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    tag: a.tag,
    date: a.date,
    readTime: a.readTime,
  }));
  const allArticles = [...dbArticles, ...staticCards];

  // Live FRED rates — static items for metrics FRED doesn't provide
  const headlines = [
    `30Y Fixed: ${fmtRate(snap?.mort30Avg ?? null)}`,
    `10Y Treasury: ${fmtRate(snap?.tenYearYield ?? null)}`,
    `Spread (Mtg-T10): ${fmtRate(snap?.spread ?? null)}`,
    `Fed Funds: ${fmtRate(effr)}`,
    'Jobless Claims: live.bls.gov', 'Median Home Price: $420,800', 'Housing Starts: 1.42M',
    'Existing Home Sales: 4.08M', 'Inventory: +22% YoY', 'Builder Confidence: 44',
    'Mortgage Apps: MBA Weekly', 'Unemployment: 4.1%', 'Core PCE: 2.8%', 'HPI: +3.9% YoY',
  ];
  const marqueeItems = [...headlines, ...headlines];

  return (
    <>
      <style>{`
        body:has(.mn-root) {
          display: block !important;
          height: auto !important;
          overflow: visible !important;
        }
        html:has(.mn-root) {
          height: auto !important;
          overflow: visible !important;
        }
        .mn-root {
          --bg: #080c12;
          --surface: #0e1420;
          --surface2: #141b28;
          --border: rgba(255,255,255,0.07);
          --border-bright: rgba(255,255,255,0.13);
          --text: #f0f4ff;
          --text-muted: #8fa3b8;
          --text-dim: #3a4560;
          --green: #00e87a;
          --green-dim: rgba(0,232,122,0.10);
          --blue: #3d8bff;
          --purple: #a78bfa;
          --orange: #ff8c42;
          --red: #ff5f5f;
          font-family: 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
        }
        .mn-root * { box-sizing: border-box; }
        body:has(.mn-root) .app-footer { display: none; }

        /* TICKER */
        .mn-ticker {
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          height: 40px;
          display: flex;
          align-items: center;
          overflow: hidden;
        }
        .mn-ticker-label {
          flex-shrink: 0;
          padding: 0 16px;
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          color: var(--blue); letter-spacing: 0.12em;
          text-transform: uppercase;
          border-right: 1px solid var(--border);
          height: 100%;
          display: flex; align-items: center; gap: 6px;
          background: var(--surface);
        }
        .mn-ticker-label::before {
          content: '';
          width: 6px; height: 6px;
          background: var(--blue);
          border-radius: 50%;
          animation: mn-pulse 2s infinite;
        }
        .mn-ticker-wrap { overflow: hidden; flex: 1; }
        .mn-ticker-track {
          display: flex;
          animation: mn-ticker 36s linear infinite;
          width: max-content;
        }
        .mn-ticker-item {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 0 24px;
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: var(--text-muted); white-space: nowrap;
          border-right: 1px solid var(--border); height: 40px;
        }

        @keyframes mn-ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes mn-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes mn-fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* NAV */
        .mn-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 40px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
        }
        .mn-nav-logo { display: flex; align-items: center; text-decoration: none; }
        .mn-nav-logo img { height: 32px; width: auto; }
        .mn-nav-links { display: flex; gap: 24px; list-style: none; padding: 0; margin: 0; }
        .mn-nav-links a { font-size: 13px; color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
        .mn-nav-links a:hover { color: var(--text); }
        .mn-nav-links a.active { color: var(--blue); }
        .mn-nav-back {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; color: var(--text-muted);
          text-decoration: none; transition: color 0.2s;
        }
        .mn-nav-back:hover { color: var(--text); }

        /* HERO */
        .mn-hero {
          max-width: 1100px;
          margin: 0 auto;
          padding: 64px 40px 48px;
        }
        .mn-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: var(--blue); letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 20px;
        }
        .mn-hero h1 {
          font-family: 'DM Sans', sans-serif;
          font-size: 48px; font-weight: 800;
          line-height: 1.1; margin: 0 0 16px;
        }
        .mn-hero h1 span { color: var(--blue); }
        .mn-hero p {
          font-size: 17px; color: var(--text-muted);
          max-width: 580px; line-height: 1.7; margin: 0;
        }

        /* SECOND TICKER (headline scroll) */
        .mn-ticker2 {
          background: linear-gradient(135deg, rgba(61,139,255,0.04), transparent);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          height: 40px;
          display: flex;
          align-items: center;
          overflow: hidden;
          margin-bottom: 64px;
        }
        .mn-ticker2-label {
          flex-shrink: 0;
          padding: 0 16px;
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          color: var(--orange); letter-spacing: 0.12em;
          text-transform: uppercase;
          border-right: 1px solid var(--border);
          height: 100%;
          display: flex; align-items: center;
          background: var(--bg);
        }
        .mn-ticker2-track {
          display: flex;
          animation: mn-ticker 45s linear infinite reverse;
          width: max-content;
        }
        .mn-ticker2-item {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 0 24px;
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: var(--text-dim); white-space: nowrap;
          border-right: 1px solid var(--border); height: 40px;
        }

        /* FEATURED + GRID */
        .mn-grid-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 40px 80px;
        }
        .mn-section-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          color: var(--text-dim); letter-spacing: 0.12em;
          text-transform: uppercase; margin-bottom: 28px;
        }

        /* FEATURED (first article — big) */
        .mn-featured {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 36px;
          margin-bottom: 24px;
          text-decoration: none;
          display: block;
          transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .mn-featured:hover {
          border-color: var(--border-bright);
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.35);
        }
        .mn-featured-tag {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 16px;
        }
        .mn-featured h2 {
          font-family: 'DM Sans', sans-serif;
          font-size: 28px; font-weight: 800;
          color: var(--text); line-height: 1.2;
          margin: 0 0 12px;
        }
        .mn-featured p {
          font-size: 15px; color: var(--text-muted);
          line-height: 1.7; margin: 0 0 20px;
          max-width: 680px;
        }
        .mn-featured-meta {
          display: flex; align-items: center; gap: 12px;
          font-family: 'DM Mono', monospace;
          font-size: 11px; color: var(--text-dim);
        }
        .mn-featured-cta {
          margin-left: auto;
          font-size: 12px; color: var(--blue);
          display: flex; align-items: center; gap: 4px;
          transition: gap 0.2s;
        }
        .mn-featured:hover .mn-featured-cta { gap: 8px; }

        /* GRID */
        .mn-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .mn-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 24px;
          text-decoration: none;
          display: flex; flex-direction: column;
          transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .mn-card:hover {
          border-color: var(--border-bright);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .mn-card-tag {
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 10px;
        }
        .mn-card h3 {
          font-family: 'DM Sans', sans-serif;
          font-size: 16px; font-weight: 700;
          color: var(--text); line-height: 1.3;
          margin: 0 0 8px;
        }
        .mn-card p {
          font-size: 13px; color: var(--text-muted);
          line-height: 1.6; margin: 0 0 16px;
          flex: 1;
        }
        .mn-card-meta {
          display: flex; align-items: center; gap: 10px;
          font-family: 'DM Mono', monospace;
          font-size: 10px; color: var(--text-dim);
          margin-bottom: 16px;
        }
        .mn-card-read {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 600;
          color: var(--blue);
          border: 1px solid rgba(61,139,255,0.25);
          border-radius: 6px;
          padding: 8px 14px;
          transition: background 0.2s, border-color 0.2s;
          align-self: flex-start;
        }
        .mn-card:hover .mn-card-read {
          background: rgba(61,139,255,0.08);
          border-color: rgba(61,139,255,0.5);
        }

        /* FOOTER */
        .mn-footer {
          max-width: 1100px; margin: 0 auto;
          padding: 32px 40px;
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid var(--border);
        }
        .mn-footer-left { font-size: 12px; color: var(--text-dim); }
        .mn-footer-links { display: flex; gap: 20px; }
        .mn-footer-links a {
          font-size: 12px; color: var(--text-dim);
          text-decoration: none; transition: color 0.2s;
        }
        .mn-footer-links a:hover { color: var(--text-muted); }

        @media (max-width: 900px) {
          .mn-hero { padding: 40px 20px 32px; }
          .mn-hero h1 { font-size: 32px; }
          .mn-featured { padding: 24px; }
          .mn-featured h2 { font-size: 22px; }
          .mn-grid { grid-template-columns: 1fr 1fr; }
          .mn-grid-wrap { padding: 0 20px 60px; }
          .mn-nav { padding: 14px 20px; }
          .mn-nav-links { display: none; }
        }
        @media (max-width: 600px) {
          .mn-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="mn-root">
        {/* NAV */}
        <nav className="mn-nav">
          <Link href="/" className="mn-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <ul className="mn-nav-links">
            <li><Link href="/chat">Calculator</Link></li>
            <li><Link href="/market-news" className="active">Market News</Link></li>
            <li><Link href="/knowledge-hub">Knowledge Hub</Link></li>
          </ul>
          <Link href="/" className="mn-nav-back">
            ← Home
          </Link>
        </nav>

        {/* TOP TICKER — market data */}
        <div className="mn-ticker">
          <div className="mn-ticker-label">LIVE DATA</div>
          <div className="mn-ticker-wrap">
            <div className="mn-ticker-track">
              {marqueeItems.map((item, i) => (
                <div key={i} className="mn-ticker-item">{item}</div>
              ))}
            </div>
          </div>
        </div>

        {/* HERO */}
        <div className="mn-hero">
          <div className="mn-eyebrow">&#9679; Mortgage Market Intelligence</div>
          <h1><span>Market News</span></h1>
          <p>Rate moves, inventory shifts, Fed signals, and housing data — explained for buyers, owners, and investors making real decisions.</p>
        </div>

        {/* SECOND TICKER — article headlines scrolling */}
        <div className="mn-ticker2">
          <div className="mn-ticker2-label">HEADLINES</div>
          <div className="mn-ticker-wrap">
            <div className="mn-ticker2-track">
              {[...allArticles, ...allArticles].map((a, i) => (
                <div key={i} className="mn-ticker2-item">◆ {a.title}</div>
              ))}
            </div>
          </div>
        </div>

        {/* ARTICLES */}
        <div className="mn-grid-wrap">
          <div className="mn-section-label">Latest Coverage — {allArticles.length} articles</div>

          {/* FEATURED: first article (newest) */}
          {allArticles[0] && (() => {
            const a = allArticles[0];
            const tagColor = TAG_COLORS[a.tag] ?? '#8fa3b8';
            return (
              <Link href={`/market-news/${a.slug}`} className="mn-featured">
                <div className="mn-featured-tag" style={{ color: tagColor }}>
                  <span style={{ width: 6, height: 6, background: tagColor, borderRadius: '50%', display: 'inline-block' }} />
                  {a.tag}
                </div>
                <h2>{a.title}</h2>
                <p>{a.excerpt}</p>
                <div className="mn-featured-meta">
                  <span>{a.date}</span>
                  <span>·</span>
                  <span>{a.readTime}</span>
                  <span className="mn-featured-cta">Read full story →</span>
                </div>
              </Link>
            );
          })()}

          {/* REST: grid */}
          <div className="mn-grid">
            {allArticles.slice(1).map((article) => {
              const tagColor = TAG_COLORS[article.tag] ?? '#8fa3b8';
              return (
                <Link key={article.slug} href={`/market-news/${article.slug}`} className="mn-card">
                  <div className="mn-card-tag" style={{ color: tagColor }}>{article.tag}</div>
                  <h3>{article.title}</h3>
                  <p>{article.excerpt}</p>
                  <div className="mn-card-meta">
                    <span>{article.date}</span>
                    <span>·</span>
                    <span>{article.readTime}</span>
                  </div>
                  <div className="mn-card-read">Read full story →</div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* FOOTER */}
        <footer className="mn-footer">
          <div className="mn-footer-left">HomeRates.ai · Market commentary only · Not investment or financial advice</div>
          <div className="mn-footer-links">
            <Link href="/knowledge-hub">Knowledge Hub</Link>
            <Link href="/disclosures">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/chat">Ask a question</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
