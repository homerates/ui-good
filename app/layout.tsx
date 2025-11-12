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
            HomeRates.Ai — Powered by OpenAI • {ts} • Version {shortSha}
          </div>
          {/* === HR: hard-cap Ask pill width (last-in DOM override) === */}
          <style
            // this lives after all CSS so it wins, even against other !important rules
            dangerouslySetInnerHTML={{
              __html: `
      .composer .composer-inner > .btn,
      .composer .composer-inner > .btn:disabled {
        flex: 0 0 160px !important;
        width: 160px !important;
        min-width: 160px !important;
        max-width: 160px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      /* ensure scroll area clears the footer + composer */
      .scroll { padding-bottom: calc(var(--footer-h, 40px) + 92px) !important; }
    `,
            }}
          />

          <style
            // lives after all CSS, so it wins even against utility classes
            dangerouslySetInnerHTML={{
              __html: `
/* Row: stop stretch and define 1fr | 160px tracks */
.composer-inner{
  display:grid !important;
  grid-template-columns: 1fr 160px !important;
  align-items:center !important;
  gap:8px !important;
}

/* Button: hard-cap width no matter what utilities say */
.composer-inner > button.btn{
  flex:0 0 160px !important;
  width:160px !important;
  min-width:160px !important;
  max-width:160px !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
}
`}}
          />

        </body>
      </html>
    </ClerkProvider>
  );
}

