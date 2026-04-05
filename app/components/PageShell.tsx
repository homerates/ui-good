// app/components/PageShell.tsx
// Universal page wrapper — self-contained like the landing page (.lp-root pattern).
// All CSS is embedded inline with ps- prefix so it never fights globals.css.

import Link from "next/link";

interface PageShellProps {
  children: React.ReactNode;
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
  const maxW = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;

  return (
    <>
      <style>{`
        /* Override body.app constraints when a standalone page is shown */
        body:has(.ps-root) {
          display: block !important;
          height: auto !important;
          overflow: visible !important;
        }
        html:has(.ps-root) {
          height: auto !important;
          overflow: visible !important;
        }
        /* Hide the chat app footer on standalone pages */
        body:has(.ps-root) .app-footer { display: none !important; }

        .ps-root {
          min-height: 100vh;
          width: 100%;
          background: #080c12;
          color: #e0f0e8;
          font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
          box-sizing: border-box;
        }
        .ps-root * { box-sizing: border-box; }

        /* Header */
        .ps-header {
          position: sticky;
          top: 0;
          z-index: 50;
          width: 100%;
          background: rgba(8,12,18,0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .ps-header-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .ps-logo-link {
          display: flex;
          align-items: center;
          text-decoration: none;
          flex-shrink: 0;
        }
        .ps-logo {
          height: 28px;
          width: auto;
          display: block;
        }
        .ps-back {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.82rem;
          font-weight: 500;
          color: rgba(185,208,192,0.7);
          text-decoration: none;
          padding: 6px 12px;
          border-radius: 8px;
          transition: color 0.15s, background 0.15s;
        }
        .ps-back:hover {
          color: #e0f0e8;
          background: rgba(255,255,255,0.05);
        }

        /* Main content */
        .ps-main {
          flex: 1;
          width: 100%;
          padding: 40px 16px 60px;
        }
        .ps-content {
          width: 100%;
          margin-left: auto;
          margin-right: auto;
        }

        /* Footer */
        .ps-footer {
          width: 100%;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 0.78rem;
          color: rgba(185,208,192,0.4);
        }
        .ps-footer-sep { opacity: 0.4; }
        .ps-footer-link {
          color: rgba(0,232,122,0.5);
          text-decoration: none;
          transition: color 0.15s;
        }
        .ps-footer-link:hover { color: #00e87a; }
      `}</style>

      <div className="ps-root">
        <header className="ps-header">
          <div className="ps-header-inner">
            <Link href="/" className="ps-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/HomeRates-Logo Green.png"
                alt="HomeRates.ai"
                className="ps-logo"
              />
            </Link>
            <Link href={backHref} className="ps-back">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {backLabel}
            </Link>
          </div>
        </header>

        <main className="ps-main">
          <div className="ps-content" style={{ maxWidth: maxW }}>
            {children}
          </div>
        </main>

        <footer className="ps-footer">
          <span>HomeRates.ai — educational tool, not a mortgage lender.</span>
          <span className="ps-footer-sep">•</span>
          <Link href="/disclosures" className="ps-footer-link">Terms</Link>
          <span className="ps-footer-sep">•</span>
          <Link href="/privacy" className="ps-footer-link">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
