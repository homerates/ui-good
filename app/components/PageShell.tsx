// app/components/PageShell.tsx
// Universal page wrapper — dark header, logo, optional back link, footer.
// Use on every standalone page outside of /chat.

import Link from "next/link";

interface PageShellProps {
  children: React.ReactNode;
  /** Show a back arrow link — defaults to "/" */
  backHref?: string;
  backLabel?: string;
  /** Max width of the content area — defaults to 720px */
  maxWidth?: number | string;
}

export default function PageShell({
  children,
  backHref = "/",
  backLabel = "Home",
  maxWidth = 720,
}: PageShellProps) {
  return (
    <div className="page-shell">
      {/* Header */}
      <header className="page-shell-header">
        <div className="page-shell-header-inner">
          <Link href="/" className="page-shell-logo-link">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/HomeRates-Logo Green.png"
              alt="HomeRates.ai"
              className="page-shell-logo"
            />
          </Link>
          <Link href={backHref} className="page-shell-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {backLabel}
          </Link>
        </div>
      </header>

      {/* Body */}
      <main className="page-shell-body">
        <div className="page-shell-content" style={{ maxWidth }}>
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="page-shell-footer">
        <span>HomeRates.ai — educational tool, not a mortgage lender.</span>
        <span className="page-shell-footer-sep">•</span>
        <Link href="/disclosures" className="page-shell-footer-link">Terms</Link>
        <span className="page-shell-footer-sep">•</span>
        <Link href="/privacy" className="page-shell-footer-link">Privacy</Link>
      </footer>

      <style>{`
        .page-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--bg, #080c12);
          color: var(--text, #e0f0e8);
          font-family: var(--font-dm-sans, sans-serif);
        }

        /* ── Header ── */
        .page-shell-header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(8, 12, 18, 0.92);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(0, 232, 122, 0.1);
        }
        .page-shell-header-inner {
          max-width: 960px;
          margin: 0 auto;
          padding: 10px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .page-shell-logo-link { display: flex; align-items: center; text-decoration: none; }
        .page-shell-logo { height: 28px; width: auto; }
        .page-shell-back {
          display: flex;
          align-items: center;
          font-size: 0.8rem;
          color: rgba(160, 192, 168, 0.65);
          text-decoration: none;
          transition: color 0.15s;
          font-family: var(--font-dm-sans, sans-serif);
        }
        .page-shell-back:hover { color: #00e87a; }

        /* ── Body ── */
        .page-shell-body {
          flex: 1;
          padding: 40px 16px 60px;
        }
        .page-shell-content {
          width: 100%;
          margin: 0 auto;
          box-sizing: border-box;
        }

        /* ── Footer ── */
        .page-shell-footer {
          padding: 12px 20px;
          border-top: 1px solid rgba(0, 232, 122, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 0.7rem;
          color: rgba(160, 192, 168, 0.4);
          font-family: var(--font-dm-sans, sans-serif);
        }
        .page-shell-footer-sep { opacity: 0.3; }
        .page-shell-footer-link {
          color: rgba(0, 232, 122, 0.55);
          text-decoration: none;
          transition: color 0.15s;
        }
        .page-shell-footer-link:hover { color: #00e87a; }

        /* ── Page content typography ── */
        .page-shell-content h1 {
          font-family: var(--font-syne, sans-serif);
          font-size: clamp(1.5rem, 3vw, 2rem);
          font-weight: 700;
          color: #fff;
          margin: 0 0 6px;
          line-height: 1.2;
        }
        .page-shell-content h2 {
          font-family: var(--font-syne, sans-serif);
          font-size: 1.05rem;
          font-weight: 600;
          color: rgba(224, 240, 232, 0.95);
          margin: 28px 0 10px;
        }
        .page-shell-content h2:first-of-type { margin-top: 20px; }
        .page-shell-content p {
          color: rgba(160, 192, 168, 0.85);
          line-height: 1.7;
          margin: 0 0 12px;
          font-size: 0.9rem;
        }
        .page-shell-content ul, .page-shell-content ol {
          padding-left: 1.4rem;
          margin: 0 0 12px;
          color: rgba(160, 192, 168, 0.8);
          font-size: 0.9rem;
          line-height: 1.7;
        }
        .page-shell-content li { margin-bottom: 4px; }
        .page-shell-content strong { color: rgba(224, 240, 232, 0.95); }
        .page-shell-content a { color: rgba(0, 232, 122, 0.8); text-decoration: none; }
        .page-shell-content a:hover { color: #00e87a; }
        .page-shell-content hr {
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          margin: 24px 0;
        }
        .page-shell-content section { margin-bottom: 8px; }

        /* Last updated badge */
        .page-shell-content .page-updated {
          font-size: 0.75rem;
          color: rgba(160, 192, 168, 0.4);
          margin-bottom: 24px;
          display: block;
        }
      `}</style>
    </div>
  );
}
