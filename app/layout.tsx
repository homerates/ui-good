// HR-Build: HRB-2025-11-10-d994b21 | File-Ref: HRF-0002-D684DDC7 | SHA256: D684DDC76358CC27
// app/layout.tsx
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "HomeRates",
  description: "Mortgage Q&A with market context",
};

// Force SSR on the root so Clerk is never statically exported
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // short SHA if available
  const shortSha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "v3";

  // server-rendered timestamp
  const ts = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="app">
          {children}

          {/* Footer meta stays separate and non-interactive */}
          <div className="footer-meta">
            <span>HomeRates.ai</span>
            <span>Educational info only, not financial advice.</span>
            <span>Powered by OpenAI.</span>
          </div>

          {/* Hard override: fix composer layout + keep it off the sidebar */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
/* Keep composer centered and away from sidebar; prevent full-bleed */
.composer{
  max-width: min(920px, 96vw) !important;
  margin: 0 auto !important;
  padding: 8px 12px !important;
  box-sizing: border-box !important;
  z-index: 900 !important;
}

/* Row: force a 2-track grid: input (1fr) | button (160px) */
.composer .composer-inner{
  display: grid !important;
  grid-template-columns: minmax(0,1fr) 160px !important;
  grid-auto-flow: column !important;
  align-items: center !important;
  gap: 8px !important;
  max-width: 100% !important;
}

/* Input: allow shrink so the grid can resolve without overflow */
.composer .composer-inner > .input,
.composer .composer-inner > input{
  min-width: 0 !important;
}

/* Button: force it into column 2 and hard-cap width */
.composer .composer-inner > button,
.composer .composer-inner > .btn,
.composer .composer-inner [data-testid="ask-pill"]{
  grid-column: 2 !important;
  justify-self: end !important;

  box-sizing: border-box !important;
  width: 160px !important;
  min-width: 160px !important;
  max-width: 160px !important;

  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

/* Nuke stretchy utility variants that may be applied to the pill */
.composer .composer-inner > .btn.w-full,
.composer .composer-inner > .btn.flex-1,
.composer .composer-inner > .btn[style*="flex: 1"],
.composer .composer-inner > .btn[style*="width: 100%"]{
  width: 160px !important;
  min-width: 160px !important;
  max-width: 160px !important;
  flex: 0 0 160px !important;
}

/* Ensure scroll area clears footer + composer */
.scroll{ padding-bottom: calc(var(--footer-h, 40px) + 92px) !important; }
`}}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
