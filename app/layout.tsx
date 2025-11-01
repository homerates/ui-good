// app/layout.tsx
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "HomeRates",
  description: "Mortgage Q&A with market context",
};

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

          {/* Footer bar */}
          <div className="footer-meta">
            HomeRates.Ai — Powered by OpenAI • {ts} • Version {shortSha}
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
