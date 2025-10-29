// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "HomeRates",
  description: "Mortgage Q&A with market context",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 7-char SHA if present, else fallback
  const shortSha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "v3";

  // render a simple local timestamp on the server
  const ts = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="app">
        {children}

        {/* Footer bar */}
        <div className="footer-meta">
          HomeRates.Ai — Powered by OpenAI • {ts} • Version {shortSha}
        </div>
      </body>
    </html>
  );
}
