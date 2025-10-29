// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "HomeRates",
  description: "Mortgage Q&A with market context",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const shortSha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "v3";

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="app">
        {children}

        {/* Footer bar (styled by .footer-meta in globals.css) */}
        <div className="footer-meta">
          HomeRates.Ai — Powered by OpenAI • <span id="build-info"></span>
        </div>

        {/* Inline timestamp + version */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var el = document.getElementById('build-info');
                if (!el) return;
                var now = new Date();
                var ts = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
                var ver = '${shortSha}';
                el.textContent = ts + ' • Version ' + ver;
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
