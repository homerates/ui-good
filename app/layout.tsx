// ==== REPLACE ENTIRE FILE: app/layout.tsx ====
import "./globals.css";
import * as React from "react";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "HomeRates.ai",
  description: "Borrower-first mortgage answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // These keep your footer line working even without injected props
  const shortSha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev";
  const ts = new Date().toLocaleString();

  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="app">
          {children}

          {/* Footer meta stays separate and non-interactive */}
          <div className="footer-meta">
            HomeRates.Ai — Powered by OpenAI • {ts} • Version {shortSha}
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
