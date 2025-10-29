// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "HomeRates",
  description: "Mortgage Q&A with market context",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="app">
        {/* === Mobile drawer toggle (CSS-only, no JS) === */}
        <input id="sb-toggle" type="checkbox" aria-hidden="true" hidden />
        <label
          htmlFor="sb-toggle"
          className="sb-hamburger"
          aria-label="Open sidebar"
          // visible only on small screens
        >
          {/* simple three-bar icon */}
          <span aria-hidden>≡</span>
        </label>

        {/* LEFT COLUMN */}
        <aside className="sidebar" style={{ position: "relative", zIndex: 1000 }}>
          <div className="side-top">
            <div className="brand" style={{ position: "relative", zIndex: 10000 }}>
              <a aria-label="HomeRates.ai home" style={{ display: "inline-flex", alignItems: "center", pointerEvents: "auto" }} href="/">
                <img src="/assets/homerates-mark.svg" alt="HomeRates.ai" width={28} height={28} style={{ display: "block" }} />
              </a>
            </div>
            <button className="btn primary">New chat</button>
          </div>

          <div className="chat-list">
            <div className="chat-item" data-empty>No history yet</div>
          </div>

          <div className="side-bottom">
            <button className="btn">Settings</button>
            <button className="btn">Share</button>
          </div>
        </aside>

        {/* RIGHT COLUMN */}
        <main className="content">{children}</main>

        {/* Footer stays server-rendered per your setup */}
      </body>
    </html>
  );
}
