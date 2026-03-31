// app/components/PageShell.tsx
// Universal page wrapper — dark header, logo, optional back link, footer.
// CSS lives in globals.css under /* PAGE-SHELL */ so it's always present
// from first paint (inline <style> tags load after hydration on mobile).

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
  return (
    <div className="page-shell">
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

      <main className="page-shell-body">
        <div className="page-shell-content" style={{ maxWidth }}>
          {children}
        </div>
      </main>

      <footer className="page-shell-footer">
        <span>HomeRates.ai — educational tool, not a mortgage lender.</span>
        <span className="page-shell-footer-sep">•</span>
        <Link href="/disclosures" className="page-shell-footer-link">Terms</Link>
        <span className="page-shell-footer-sep">•</span>
        <Link href="/privacy" className="page-shell-footer-link">Privacy</Link>
      </footer>
    </div>
  );
}
