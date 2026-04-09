"use client";
// app/components/AppNav.tsx
// Shared sticky nav for standalone pages (messages, profile, library, etc.)
// Provides logo, desktop nav links, and a slide-out mobile drawer.
// Two modes:
//   "standard" — logo left, nav links center/right, hamburger
//   "thread"   — back-link left, title center, hamburger right

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

export interface AppNavProps {
  mode?: "standard" | "thread";
  // thread mode only
  backHref?: string;
  backLabel?: string;
  title?: string;
  titleBadge?: React.ReactNode;
  // optional unread count for Messages link
  unreadCount?: number;
  // active page — highlights the matching nav link
  activePage?: "chat" | "messages" | "library" | "dashboard" | "profile";
  /**
   * drawerOnly — renders just the hamburger button + slide-out drawer,
   * with no nav bar. Drop into any existing page header.
   */
  drawerOnly?: boolean;
}

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const el = document.createElement("style");
  el.textContent = `
    .an-nav {
      position: sticky; top: 0; z-index: 200;
      display: grid; grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 0 20px; height: 56px;
      background: rgba(8,12,18,0.97); backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      font-family: 'DM Sans', system-ui, sans-serif;
      flex-shrink: 0;
    }

    /* Logo zone */
    .an-logo { justify-self: start; }
    .an-logo img { height: 26px; display: block; }

    /* Desktop links — true center column */
    .an-links {
      display: flex; align-items: center; gap: 4px;
      justify-self: center;
    }
    .an-link {
      padding: 6px 12px; border-radius: 8px;
      font-size: 0.85rem; font-weight: 500;
      color: #8fa3b8; text-decoration: none;
      transition: color 0.15s, background 0.15s;
      display: flex; align-items: center; gap: 5px;
    }
    .an-link:hover { color: #f0f4ff; background: rgba(255,255,255,0.05); }
    .an-link.an-active { color: #f0f4ff; background: rgba(255,255,255,0.07); }

    .an-badge {
      background: #ff5f5f; color: #fff;
      font-size: 0.65rem; font-weight: 800;
      border-radius: 99px; padding: 1px 6px; min-width: 18px;
      text-align: center; line-height: 1.6;
    }

    /* Thread mode: back + title */
    .an-back {
      font-size: 0.85rem; font-weight: 600;
      color: #3d8bff; text-decoration: none; min-width: 80px;
    }
    .an-back:hover { text-decoration: underline; }

    .an-title-wrap {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      font-size: 0.95rem; font-weight: 700; color: #f0f4ff;
      white-space: nowrap; justify-self: center;
    }

    /* Hamburger button — always right-aligned */
    .an-hamburger {
      display: flex; flex-direction: column; gap: 4.5px;
      align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 8px;
      background: transparent; border: 1px solid rgba(255,255,255,0.08);
      cursor: pointer; flex-shrink: 0;
      justify-self: end;
      transition: background 0.15s, border-color 0.15s;
    }
    .an-hamburger:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15); }
    .an-hamburger span {
      display: block; width: 16px; height: 1.5px;
      background: #8fa3b8; border-radius: 2px; transition: background 0.15s;
    }
    .an-hamburger:hover span { background: #f0f4ff; }

    /* Drawer overlay */
    .an-overlay {
      position: fixed; inset: 0; z-index: 300;
      background: rgba(0,0,0,0.55);
      animation: an-fade-in 0.18s ease;
    }
    @keyframes an-fade-in { from { opacity: 0 } to { opacity: 1 } }

    /* Drawer panel */
    .an-drawer {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: min(280px, 85vw);
      background: #0a0f1c;
      border-left: 1px solid rgba(255,255,255,0.08);
      display: flex; flex-direction: column;
      animation: an-slide-in 0.2s ease;
      padding: 0 0 24px;
      overflow-y: auto;
    }
    @keyframes an-slide-in {
      from { transform: translateX(100%) } to { transform: translateX(0) }
    }

    .an-drawer-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      flex-shrink: 0;
    }
    .an-drawer-logo img { height: 24px; }
    .an-close {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 8px;
      background: transparent; border: 1px solid rgba(255,255,255,0.1);
      color: #8fa3b8; cursor: pointer; font-size: 1rem;
      transition: background 0.15s;
    }
    .an-close:hover { background: rgba(255,255,255,0.06); color: #f0f4ff; }

    .an-drawer-section {
      padding: 12px 12px 0;
    }
    .an-drawer-label {
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: #3a4560;
      padding: 8px 8px 4px;
    }

    .an-drawer-link {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 10px;
      font-size: 0.9rem; font-weight: 500; color: #8fa3b8;
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
    }
    .an-drawer-link:hover { background: rgba(255,255,255,0.05); color: #f0f4ff; }
    .an-drawer-link.an-drawer-active {
      background: rgba(0,232,122,0.08); color: #00e87a;
    }
    .an-drawer-icon {
      width: 20px; text-align: center; flex-shrink: 0;
      font-size: 1rem;
    }
    .an-drawer-divider {
      height: 1px; background: rgba(255,255,255,0.06);
      margin: 12px 12px;
    }

    /* Hide desktop links on mobile, always show hamburger */
    @media (max-width: 640px) {
      .an-links { display: none; }
    }
  `;
  document.head.appendChild(el);
}

const NAV_LINKS = [
  { href: "/chat", label: "Chat", icon: "💬", key: "chat" },
  { href: "/messages", label: "Messages", icon: "✉️", key: "messages" },
  { href: "/library", label: "My Vault", icon: "🗂", key: "library" },
  { href: "/dashboard", label: "Dashboard", icon: "⚡", key: "dashboard" },
  { href: "/profile", label: "My Profile", icon: "👤", key: "profile" },
];

export default function AppNav({
  mode = "standard",
  backHref = "/messages",
  backLabel = "← Inbox",
  title,
  titleBadge,
  unreadCount,
  activePage,
  drawerOnly = false,
}: AppNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    ensureStyles();
    setMounted(true);
  }, []);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  // Drawer inner JSX (portal target = document.body to escape backdrop-filter stacking context)
  const drawerInner = (
    <div className="an-overlay" onClick={() => setDrawerOpen(false)}>
      <div className="an-drawer" onClick={e => e.stopPropagation()}>
        <div className="an-drawer-head">
          <Link href="/" className="an-drawer-logo" onClick={() => setDrawerOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <button className="an-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">✕</button>
        </div>
        <div className="an-drawer-section">
          <div className="an-drawer-label">Navigation</div>
          {NAV_LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`an-drawer-link ${activePage === l.key ? "an-drawer-active" : ""}`}
              onClick={() => setDrawerOpen(false)}
            >
              <span className="an-drawer-icon">{l.icon}</span>
              {l.label}
              {l.key === "messages" && (unreadCount ?? 0) > 0 && (
                <span className="an-badge">{unreadCount}</span>
              )}
            </Link>
          ))}
          <div className="an-drawer-divider" />
          <div className="an-drawer-label">Quick links</div>
          <Link href="/connect/my-scenario" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
            <span className="an-drawer-icon">🎯</span>My Scenario
          </Link>
          <Link href="/loan-limits" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
            <span className="an-drawer-icon">🏠</span>Loan Limits
          </Link>
          <Link href="/support" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
            <span className="an-drawer-icon">❓</span>Support
          </Link>
        </div>
      </div>
    </div>
  );

  // Portal to document.body so backdrop-filter on parent headers doesn't trap fixed positioning
  const drawer = mounted && drawerOpen
    ? createPortal(drawerInner, document.body)
    : null;

  // drawerOnly mode — just the hamburger button + drawer, no nav bar
  if (drawerOnly) {
    return (
      <>
        <button
          className="an-hamburger"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <span /><span /><span />
        </button>
        {drawer}
      </>
    );
  }

  return (
    <>
      <nav className="an-nav">
        {/* Left zone */}
        {mode === "thread" ? (
          <Link href={backHref} className="an-back">{backLabel}</Link>
        ) : (
          <Link href="/" className="an-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
        )}

        {/* Center zone */}
        {mode === "thread" ? (
          <div className="an-title-wrap">
            {title}
            {titleBadge}
          </div>
        ) : (
          <div className="an-links">
            {NAV_LINKS.filter(l => l.key !== "profile").map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={`an-link ${activePage === l.key ? "an-active" : ""}`}
              >
                {l.label}
                {l.key === "messages" && (unreadCount ?? 0) > 0 && (
                  <span className="an-badge">{unreadCount}</span>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* Right zone: always hamburger */}
        <button
          className="an-hamburger"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <span /><span /><span />
        </button>
      </nav>

      {drawer}
    </>
  );
}
