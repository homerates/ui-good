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
import { useAdminStatus } from "../hooks/useAdminStatus";
import { useCreditBalance } from "../hooks/useCreditBalance";
import { useUnreadMessages } from "../hooks/useUnreadMessages";

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
  /**
   * consumer — renders consumer-facing drawer links instead of professional app links.
   * Set when page is accessed from homerates.ai (consumer domain).
   */
  consumer?: boolean;
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
    .an-logo img { height: 39px; display: block; }

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
      text-transform: uppercase; color: #eaf8f7;
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

    /* Bell / unread badge on hamburger */
    .an-hamburger-wrap {
      position: relative; justify-self: end;
    }
    .an-hamburger-wrap .an-hamburger {
      justify-self: unset;
    }
    .an-unread-dot {
      position: absolute; top: -4px; right: -4px;
      min-width: 17px; height: 17px; border-radius: 99px;
      background: #ff5f5f; color: #fff;
      font-size: 0.6rem; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #080c12;
      animation: an-bell-pulse 1.8s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes an-bell-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,95,95,0.6); }
      50% { transform: scale(1.15); box-shadow: 0 0 0 5px rgba(255,95,95,0); }
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
  { href: "/market-intelligence", label: "Market Rates", icon: "📈", key: "market" },
  { href: "/messages", label: "Messages", icon: "✉️", key: "messages" },
  { href: "/library", label: "My Vault", icon: "🗂", key: "library" },
  { href: "/dashboard", label: "Dashboard", icon: "⚡", key: "dashboard" },
  { href: "/profile", label: "My Profile", icon: "👤", key: "profile" },
];

const CONSUMER_NAV_LINKS = [
  { href: "/chat?new=1", label: "New Chat", key: "chat" },
  { href: "/chat?new=1&pl=1", label: "Property Lookup", key: "property" },
  { href: "/market-intelligence", label: "Market Rates", key: "market" },
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
  consumer = false,
}: AppNavProps) {
  const { isAdmin } = useAdminStatus();
  const credits = useCreditBalance();
  const polledUnread = useUnreadMessages();
  // Use prop if explicitly passed (thread page), otherwise use live poll
  const totalUnread = unreadCount ?? polledUnread;
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

  const [moreOpen, setMoreOpen] = useState(false);

  // Drawer inner JSX (portal target = document.body to escape backdrop-filter stacking context)
  const drawerInner = (
    <div className="an-overlay" onClick={() => setDrawerOpen(false)}>
      <div className="an-drawer" onClick={e => e.stopPropagation()}>
        <div className="an-drawer-head">
          <Link href="/" className="an-drawer-logo" onClick={() => setDrawerOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <button className="an-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">✕</button>
        </div>
        <div className="an-drawer-section">
          {consumer ? (
            /* ── CONSUMER drawer links ── */
            <>
              <div className="an-drawer-label">My Account</div>
              <Link href="/my-home" className="an-drawer-link an-drawer-active" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">🏠</span>My Home
              </Link>
              <Link href="/library" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">📁</span>My Library
              </Link>
              <Link href="/messages" className="an-drawer-link" onClick={() => setDrawerOpen(false)} style={{ display: "flex", alignItems: "center" }}>
                <span className="an-drawer-icon">✉️</span>
                Messages
                {totalUnread > 0 && <span className="an-badge" style={{ marginLeft: "auto" }}>{totalUnread > 9 ? "9+" : totalUnread}</span>}
              </Link>
              <div className="an-drawer-label">Explore</div>
              <Link href="/chat?new=1" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">💬</span>New Chat
              </Link>
              <Link href="/chat?new=1" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">⚡</span>Scenario
              </Link>
              <Link href="/chat?new=1&pl=1" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">🔍</span>Property Lookup
              </Link>
              <Link href="/connect" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">📤</span>Share with Pro
              </Link>
              <div className="an-drawer-label">Tools &amp; Resources</div>
              <Link href="/calculators" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">🧮</span>Calculators
              </Link>
              <Link href="/loan-limits" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">📍</span>Loan Limits
              </Link>
              <Link href="/knowledge-hub" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">📚</span>Knowledge Hub
              </Link>
              <Link href="/market-news" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">📰</span>Market News
              </Link>
            </>
          ) : (
            /* ── PROFESSIONAL drawer links ── */
            <>
              <Link href="/chat" className={`an-drawer-link ${activePage === "chat" ? "an-drawer-active" : ""}`} onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">💬</span>Chat
              </Link>
              <div className="an-drawer-label">Market Rates</div>
              <Link href="/market-intelligence" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">📈</span>Market Rate Intelligence
              </Link>
              <Link href="/lab" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">🧪</span>Lab
              </Link>
              <Link href="/investor" className="an-drawer-link" onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">📊</span>Investor Portal
              </Link>
              <Link href="/my-home" className={`an-drawer-link ${activePage === "dashboard" ? "an-drawer-active" : ""}`} onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">🏡</span>My Home
              </Link>
              <Link href="/messages" className={`an-drawer-link ${activePage === "messages" ? "an-drawer-active" : ""}`} onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">✉️</span>
                Messages
                {totalUnread > 0 && <span className="an-badge" style={{ marginLeft: "auto" }}>{totalUnread > 9 ? "9+" : totalUnread}</span>}
              </Link>
              <Link href="/library" className={`an-drawer-link ${activePage === "library" ? "an-drawer-active" : ""}`} onClick={() => setDrawerOpen(false)}>
                <span className="an-drawer-icon">🗂</span>My Vault
              </Link>
              <button
                onClick={() => setMoreOpen(o => !o)}
                className="an-drawer-link"
                style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: moreOpen ? "#f0f4ff" : "#8fa3b8" }}
              >
                <span className="an-drawer-icon" style={{ fontSize: "0.8rem" }}>{moreOpen ? "▾" : "▸"}</span>
                More
              </button>
              {moreOpen && (
                <>
                  <div className="an-drawer-label" style={{ paddingLeft: 28 }}>Quick Links</div>
                  <Link href="/dashboard" className="an-drawer-link" style={{ paddingLeft: 28 }} onClick={() => setDrawerOpen(false)}>
                    <span className="an-drawer-icon">⚡</span>Dashboard
                  </Link>
                  <Link href="/deal-rooms" className="an-drawer-link" style={{ paddingLeft: 28, display: "flex", alignItems: "center" }} onClick={() => setDrawerOpen(false)}>
                    <span className="an-drawer-icon">🤝</span>
                    Deal Rooms
                    <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a0a00", padding: "2px 6px", borderRadius: 999, flexShrink: 0 }}>⭐ Pro</span>
                  </Link>
                  <Link href="/connect/my-scenario" className="an-drawer-link" style={{ paddingLeft: 28 }} onClick={() => setDrawerOpen(false)}>
                    <span className="an-drawer-icon">🎯</span>My Scenario
                  </Link>
                  <Link href="/loan-limits" className="an-drawer-link" style={{ paddingLeft: 28 }} onClick={() => setDrawerOpen(false)}>
                    <span className="an-drawer-icon">🏠</span>Loan Limits
                  </Link>
                  <Link href="/profile" className="an-drawer-link" style={{ paddingLeft: 28 }} onClick={() => setDrawerOpen(false)}>
                    <span className="an-drawer-icon">👤</span>My Profile
                  </Link>
                  <Link href="/support" className="an-drawer-link" style={{ paddingLeft: 28 }} onClick={() => setDrawerOpen(false)}>
                    <span className="an-drawer-icon">❓</span>Support
                  </Link>
                </>
              )}
            </>
          )}

          {/* ── Credits + admin footer (pro only) ── */}
          {!consumer && (credits !== null || isAdmin) && (
            <>
              <div className="an-drawer-divider" />
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", margin: "0 0 4px",
                background: "rgba(0,232,122,0.06)", borderRadius: 10,
                border: "1px solid rgba(0,232,122,0.12)",
              }}>
                <span style={{ fontSize: "0.82rem", color: "#4a6e58", fontWeight: 600 }}>⚡ Credits</span>
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#00e87a" }}>
                  {isAdmin ? "∞" : credits!.balance.toLocaleString()}
                </span>
              </div>
            </>
          )}
          {isAdmin && (
            <Link href="/admin" className="an-drawer-link" onClick={() => setDrawerOpen(false)}
              style={{ color: "#ff5f5f", fontSize: "0.8rem", paddingTop: 6, paddingBottom: 6 }}>
              <span className="an-drawer-icon" style={{ fontSize: "0.75rem" }}>🔴</span>Admin
            </Link>
          )}
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
        <div className="an-hamburger-wrap" style={{ position: "relative", display: "inline-block" }}>
          <button
            className="an-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <span /><span /><span />
          </button>
          {totalUnread > 0 && (
            <span className="an-unread-dot">{totalUnread > 9 ? "9+" : totalUnread}</span>
          )}
        </div>
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
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
        )}

        {/* Center zone */}
        {mode === "thread" ? (
          <div className="an-title-wrap">
            {title}
            {titleBadge}
          </div>
        ) : consumer ? (
          <div className="an-links">
            {CONSUMER_NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} className="an-link">{l.label}</Link>
            ))}
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
                {l.key === "messages" && totalUnread > 0 && (
                  <span className="an-badge">{unreadCount}</span>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* Right zone: hamburger with unread badge */}
        <div className="an-hamburger-wrap">
          <button
            className="an-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <span /><span /><span />
          </button>
          {totalUnread > 0 && (
            <span className="an-unread-dot">{totalUnread > 9 ? "9+" : totalUnread}</span>
          )}
        </div>
      </nav>

      {drawer}
    </>
  );
}
