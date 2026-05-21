// app/market-news/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../../components/AppNav';
import { marketNewsArticles } from '../articles';
import ShareBar from '../../components/ShareBar';
import NewsletterCapture from '../../components/NewsletterCapture';

export const dynamicParams = true;
export const revalidate = 3600;

export async function generateStaticParams() {
  return marketNewsArticles.map((a) => ({ slug: a.slug }));
}

async function getDbArticle(slug: string) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await sb.from('generated_articles').select('*').eq('slug', slug).eq('category', 'market-news').eq('status', 'published').maybeSingle();
    return data ?? null;
  } catch { return null; }
}

async function getDbRelated(slug: string, limit = 3) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await sb
      .from('generated_articles')
      .select('slug, title, excerpt, tag, published_at, read_time')
      .eq('category', 'market-news')
      .eq('status', 'published')
      .neq('slug', slug)
      .order('published_at', { ascending: false })
      .limit(limit);
    return (data ?? []).map((a) => ({
      slug: a.slug,
      title: a.title,
      tag: a.tag ?? 'Market News',
      date: new Date(a.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      readTime: `${a.read_time ?? 5} min read`,
    }));
  } catch { return []; }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = marketNewsArticles.find((a) => a.slug === slug) ?? await getDbArticle(slug);
  if (!article) return {};
  return {
    title: `${article.title} | HomeRates.ai`,
    description: article.excerpt,
    alternates: { canonical: `https://chat.homerates.ai/market-news/${slug}` },
    openGraph: {
      title: `${article.title} | HomeRates.ai`,
      description: article.excerpt,
      url: `https://chat.homerates.ai/market-news/${slug}`,
      type: 'article',
      images: [{ url: `https://chat.homerates.ai/api/og?title=${encodeURIComponent(article.title)}&cat=market-news`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: article.title, description: article.excerpt, images: [`https://chat.homerates.ai/api/og?title=${encodeURIComponent(article.title)}&cat=market-news`] },
  };
}

/** Minimal markdown → HTML converter */
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  function flushTable() {
    if (!tableRows.length) return;
    const [header, , ...body] = tableRows;
    out.push('<table>');
    out.push('<thead><tr>' + header.map((c) => `<th>${c.trim()}</th>`).join('') + '</tr></thead>');
    out.push('<tbody>');
    body.forEach((row) => {
      out.push('<tr>' + row.map((c) => `<td>${c.trim()}</td>`).join('') + '</tr>');
    });
    out.push('</tbody></table>');
    tableRows = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('|')) {
      inTable = true;
      const cols = line.split('|').filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);
      tableRows.push(cols);
      continue;
    }

    if (inTable) flushTable();

    if (/^---+$/.test(line.trim())) { out.push('<hr>'); continue; }
    if (line.startsWith('### ')) { out.push(`<h3>${inlineMd(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { out.push(`<h2>${inlineMd(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { out.push(`<h1>${inlineMd(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('- ')) { out.push(`<li>${inlineMd(line.slice(2))}</li>`); continue; }
    if (line.trim() === '') { out.push(''); continue; }
    out.push(`<p>${inlineMd(line)}</p>`);
  }

  if (inTable) flushTable();

  const html = out.join('\n');
  return html.replace(/(<li>.*?<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`);
}

function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

const TAG_COLORS: Record<string, string> = {
  'Rates': '#00e87a',
  'Fed / Rates': '#00e87a',
  'Demand': '#3d8bff',
  'Inventory': '#ff8c42',
  'Economy': '#a78bfa',
};

export default async function MarketNewsArticle({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = marketNewsArticles.find((a) => a.slug === slug) ?? await getDbArticle(slug);
  if (!article) notFound();

  const tagColor = TAG_COLORS[article.tag] ?? '#8fa3b8';
  const bodyHtml = renderMarkdown(article.body.trim());

  const dbRelated = await getDbRelated(slug, 3);
  const staticRelated = marketNewsArticles.filter((a) => a.slug !== slug).slice(0, Math.max(0, 3 - dbRelated.length));
  const related = [
    ...dbRelated,
    ...staticRelated.map((a) => ({ slug: a.slug, title: a.title, tag: a.tag, date: a.date, readTime: a.readTime })),
  ].slice(0, 3);

  return (
    <>
      <style>{`
        body:has(.mna-root) {
          display: block !important;
          height: auto !important;
          overflow: visible !important;
        }
        html:has(.mna-root) {
          height: auto !important;
          overflow: visible !important;
        }
        .mna-root {
          --bg: #080c12;
          --surface: #0e1420;
          --surface2: #141b28;
          --border: rgba(255,255,255,0.07);
          --border-bright: rgba(255,255,255,0.13);
          --text: #f0f4ff;
          --text-muted: #8fa3b8;
          --text-dim: #eaf8f7;
          --green: #00e87a;
          --blue: #3d8bff;
          --purple: #a78bfa;
          --orange: #ff8c42;
          font-family: 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
        }
        .mna-root * { box-sizing: border-box; }
        body:has(.mna-root) .app-footer { display: none; }

        /* NAV */
        .mna-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 40px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
          position: sticky; top: 0; z-index: 10;
        }
        .mna-nav-logo { display: flex; align-items: center; text-decoration: none; }
        .mna-nav-logo img { height: 32px; width: auto; }
        .mna-nav-back {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; color: var(--text-muted);
          text-decoration: none; transition: color 0.2s;
        }
        .mna-nav-back:hover { color: var(--text); }

        /* ARTICLE */
        .mna-wrap {
          max-width: 740px;
          margin: 0 auto;
          padding: 56px 40px 80px;
        }
        .mna-tag {
          font-family: 'DM Mono', monospace;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 16px;
          display: flex; align-items: center; gap: 6px;
        }
        .mna-wrap h1 {
          font-family: 'DM Sans', sans-serif;
          font-size: 38px; font-weight: 800;
          line-height: 1.15; margin: 0 0 16px;
          color: var(--text);
        }
        .mna-excerpt {
          font-size: 18px; color: var(--text-muted);
          line-height: 1.65; margin-bottom: 20px;
        }
        .mna-meta {
          display: flex; align-items: center; gap: 12px;
          font-family: 'DM Mono', monospace;
          font-size: 11px; color: var(--text-dim);
          margin-bottom: 48px;
          padding-bottom: 32px;
          border-bottom: 1px solid var(--border);
        }

        /* BODY */
        .mna-body h1 { font-family: 'DM Sans', sans-serif; font-size: 30px; font-weight: 800; margin: 48px 0 16px; color: var(--text); }
        .mna-body h2 { font-family: 'DM Sans', sans-serif; font-size: 22px; font-weight: 700; margin: 40px 0 12px; color: var(--text); }
        .mna-body h3 { font-size: 17px; font-weight: 600; margin: 28px 0 10px; color: var(--text); }
        .mna-body p { font-size: 16px; color: var(--text-muted); line-height: 1.75; margin: 0 0 16px; }
        .mna-body strong { color: var(--text); font-weight: 600; }
        .mna-body em { font-style: italic; }
        .mna-body code {
          font-family: 'DM Mono', monospace; font-size: 13px;
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 4px; padding: 2px 6px; color: var(--blue);
        }
        .mna-body hr {
          border: none; border-top: 1px solid var(--border);
          margin: 36px 0;
        }
        .mna-body ul {
          margin: 0 0 16px; padding-left: 20px;
          list-style: none;
        }
        .mna-body ul li {
          font-size: 16px; color: var(--text-muted); line-height: 1.7;
          margin-bottom: 6px; padding-left: 16px; position: relative;
        }
        .mna-body ul li::before {
          content: '→';
          position: absolute; left: -4px;
          color: var(--blue); font-size: 12px;
        }
        .mna-body table {
          width: 100%; border-collapse: collapse;
          margin: 24px 0; font-size: 14px;
        }
        .mna-body th {
          text-align: left; padding: 10px 14px;
          background: var(--surface2);
          border: 1px solid var(--border);
          font-family: 'DM Mono', monospace;
          font-size: 11px; font-weight: 600;
          color: var(--text-muted); letter-spacing: 0.05em;
        }
        .mna-body td {
          padding: 10px 14px;
          border: 1px solid var(--border);
          color: var(--text-muted);
          vertical-align: top;
        }
        .mna-body tr:nth-child(even) td { background: rgba(255,255,255,0.02); }

        /* CTA */
        .mna-cta {
          margin-top: 56px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 32px;
          text-align: center;
        }
        .mna-cta p { font-size: 15px; color: var(--text-muted); margin: 0 0 20px; line-height: 1.6; }
        .mna-cta a {
          display: inline-block;
          background: var(--blue); color: #fff;
          font-size: 14px; font-weight: 600;
          padding: 12px 28px; border-radius: 8px;
          text-decoration: none; transition: opacity 0.2s;
        }
        .mna-cta a:hover { opacity: 0.88; }

        /* RELATED */
        .mna-related {
          max-width: 740px; margin: 0 auto;
          padding: 0 40px 80px;
        }
        .mna-related-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          color: var(--text-dim); letter-spacing: 0.12em;
          text-transform: uppercase; margin-bottom: 20px;
        }
        .mna-related-grid { display: flex; flex-direction: column; gap: 12px; }
        .mna-related-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px; padding: 20px 24px;
          text-decoration: none;
          display: flex; align-items: center; justify-content: space-between;
          transition: border-color 0.2s;
        }
        .mna-related-card:hover { border-color: var(--border-bright); }
        .mna-related-card h4 {
          font-family: 'DM Sans', sans-serif;
          font-size: 15px; font-weight: 700;
          color: var(--text); margin: 0 0 4px;
        }
        .mna-related-card span {
          font-size: 12px; color: var(--text-dim);
          font-family: 'DM Mono', monospace;
        }
        .mna-related-arrow {
          color: var(--text-dim); font-size: 16px;
          transition: transform 0.2s, color 0.2s; flex-shrink: 0; margin-left: 16px;
        }
        .mna-related-card:hover .mna-related-arrow { transform: translateX(4px); color: var(--blue); }

        /* FOOTER */
        .mna-footer {
          max-width: 740px; margin: 0 auto;
          padding: 24px 40px 40px;
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid var(--border);
          font-size: 12px; color: var(--text-dim);
        }
        .mna-footer-links { display: flex; gap: 20px; }
        .mna-footer-links a { color: var(--text-dim); text-decoration: none; transition: color 0.2s; }
        .mna-footer-links a:hover { color: var(--text-muted); }

        @media (max-width: 768px) {
          .mna-nav { padding: 14px 20px; }
          .mna-wrap { padding: 36px 20px 60px; }
          .mna-wrap h1 { font-size: 28px; }
          .mna-excerpt { font-size: 16px; }
          .mna-related { padding: 0 20px 60px; }
          .mna-footer { padding: 24px 20px 40px; flex-direction: column; gap: 16px; }
        }
      `}</style>

      <div className="mna-root">
        <nav className="mna-nav">
          <Link href="/" className="mna-nav-logo">
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href="/market-news" className="mna-nav-back">← Market News</Link>
            <AppNav drawerOnly />
          </div>
        </nav>

        <div className="mna-wrap">
          <div className="mna-tag" style={{ color: tagColor }}>
            <span style={{ width: 6, height: 6, background: tagColor, borderRadius: '50%', display: 'inline-block' }} />
            {article.tag}
          </div>
          <h1>{article.title}</h1>
          <p className="mna-excerpt">{article.excerpt}</p>
          <div className="mna-meta">
            <span>{article.date}</span>
            <span>·</span>
            <span>{article.readTime}</span>
          </div>

          <div
            className="mna-body"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          <ShareBar
            url={`https://chat.homerates.ai/market-news/${article.slug}`}
            title={article.title}
          />

          <NewsletterCapture source="market-news" />

          <div className="mna-cta">
            <p>See how today&apos;s rates affect your real numbers — run a live mortgage scenario instantly.</p>
            <Link href="/chat">Run a Live Scenario →</Link>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mna-related">
            <div className="mna-related-label">More Market News</div>
            <div className="mna-related-grid">
              {related.map((r) => (
                <Link key={r.slug} href={`/market-news/${r.slug}`} className="mna-related-card">
                  <div>
                    <h4>{r.title}</h4>
                    <span>{r.date} · {r.readTime}</span>
                  </div>
                  <span className="mna-related-arrow">→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <footer className="mna-footer">
          <div>HomeRates.ai · Market commentary only · Not investment or financial advice</div>
          <div className="mna-footer-links">
            <Link href="/market-news">All News</Link>
            <Link href="/knowledge-hub">Knowledge Hub</Link>
            <Link href="/disclosures">Terms</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
