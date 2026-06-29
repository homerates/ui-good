"use client";
// app/components/AppShell.tsx
// Stage 2 shell — wraps every (consumer) and (pro) route group page.
// Derives top bar + drawer entirely from NAV_ITEMS in lib/nav-config.
// See ARCHITECTURE_DECISIONS.md AD-6, AD-7.

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignOutButton } from "@clerk/nextjs";
import LegalLinks from "./LegalLinks";
import { useAdminStatus } from "../hooks/useAdminStatus";
import {
  NAV_ITEMS, topBarItems,
  type NavMode, type NavGroup, type NavItem,
} from "@/nav-config";

const GROUP_ORDER: NavGroup[] = ['decide', 'tools', 'mine', 'learn'];
const GROUP_LABEL: Record<NavGroup, string> = {
  decide:  'Decide',
  tools:   'Tools',
  mine:    'Mine',
  learn:   'Learn',
  account: 'Account',
};

const PRO_BADGE = (
  <span style={{
    marginLeft: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
    textTransform: 'uppercase', background: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
    color: '#1a0a00', padding: '2px 6px', borderRadius: 999, flexShrink: 0,
  }}>⭐ Pro</span>
);

export interface AppShellProps {
  mode: NavMode;
  /** full = logo + top bar + drawer + footer (default). minimal = logo + signed-in escape hatch only. */
  chrome?: 'full' | 'minimal';
  children: React.ReactNode;
}

export default function AppShell({ mode, chrome = 'full', children }: AppShellProps) {
  const { isAdmin } = useAdminStatus();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [drawerOpen]);

  const topBar = topBarItems(mode);

  const intentItems = NAV_ITEMS.filter(i =>
    i.modes.includes(mode) && i.surfaces.includes('drawer') && !i.footer
  );
  const footerItems = NAV_ITEMS.filter(i =>
    i.modes.includes(mode) && i.surfaces.includes('drawer') && i.footer
  );
  const grouped = GROUP_ORDER
    .map(g => ({ g, label: GROUP_LABEL[g], items: intentItems.filter(i => i.group === g) }))
    .filter(({ items }) => items.length > 0);

  function renderLink(item: NavItem) {
    if (item.adminOnly && !isAdmin) return null;
    const label = item.labelByMode?.[mode] ?? item.label;

    if (item.id === 'sign-out') {
      return (
        <SignOutButton key={item.id}>
          <button className="ash-drawer-link">
            <span className="ash-drawer-icon">{item.icon}</span>
            {label}
          </button>
        </SignOutButton>
      );
    }

    return (
      <Link key={item.id} href={item.href} className="ash-drawer-link" onClick={() => setDrawerOpen(false)}>
        <span className="ash-drawer-icon">{item.icon}</span>
        {label}
        {item.proBadge && PRO_BADGE}
      </Link>
    );
  }

  const drawer = (
    <div className="ash-overlay" onClick={() => setDrawerOpen(false)}>
      <div className="ash-drawer" onClick={e => e.stopPropagation()}>
        <div className="ash-drawer-head">
          <Link href="/" className="ash-drawer-logo" onClick={() => setDrawerOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <button className="ash-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">✕</button>
        </div>

        <div className="ash-drawer-scroll">
          {grouped.map(({ g, label, items }) => (
            <div key={g} className="ash-drawer-section">
              <div className="ash-drawer-label">{label}</div>
              {items.map(renderLink)}
            </div>
          ))}
        </div>

        <div className="ash-drawer-footer">
          <div className="ash-drawer-footer-divider" />
          <SignedIn>
            {footerItems.map(renderLink)}
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="ash-drawer-link" style={{ color: '#3d8bff' }}>
                <span className="ash-drawer-icon">🔑</span>Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        body:has(.ash-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.ash-root){height:auto!important;overflow:visible!important;}
        body:has(.ash-root) .app-footer{display:none!important;}

        .ash-root{
          min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;overflow-x:hidden;box-sizing:border-box;
        }
        .ash-root *{box-sizing:border-box;}

        .ash-header{
          position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.92);
          backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);
        }
        .ash-header-inner{
          max-width:1200px;margin:0 auto;padding:0 24px;height:56px;
          display:flex;align-items:center;justify-content:space-between;gap:16px;
        }
        .ash-logo-link{display:flex;align-items:center;text-decoration:none;flex-shrink:0;}
        .ash-logo{height:28px;width:auto;display:block;}

        .ash-topbar{display:flex;align-items:center;gap:2px;flex:1;justify-content:center;}
        @media(max-width:640px){.ash-topbar{display:none;}}
        .ash-topbar-link{
          padding:6px 14px;border-radius:8px;font-size:0.85rem;font-weight:500;
          color:rgba(185,208,192,0.8);text-decoration:none;white-space:nowrap;
          transition:color 0.15s,background 0.15s;
        }
        .ash-topbar-link:hover{color:#e0f0e8;background:rgba(255,255,255,0.05);}

        .ash-escape{
          font-size:0.82rem;font-weight:500;color:#00e87a;text-decoration:none;
          padding:6px 12px;border-radius:8px;transition:opacity 0.15s;
        }
        .ash-escape:hover{opacity:0.75;}

        .ash-hamburger{
          background:none;border:none;cursor:pointer;padding:8px;
          display:flex;flex-direction:column;gap:5px;border-radius:8px;
          transition:background 0.15s;flex-shrink:0;
        }
        .ash-hamburger:hover{background:rgba(255,255,255,0.06);}
        .ash-hamburger span{
          display:block;width:20px;height:2px;
          background:rgba(185,208,192,0.8);border-radius:2px;
        }

        /* Drawer overlay + panel */
        .ash-overlay{
          position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:200;
          backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);
        }
        .ash-drawer{
          position:fixed;top:0;right:0;bottom:0;width:min(320px,90vw);
          background:#0d1117;border-left:1px solid rgba(255,255,255,0.07);
          display:flex;flex-direction:column;z-index:201;
          animation:ashSlideIn 0.22s ease;
        }
        @keyframes ashSlideIn{
          from{transform:translateX(100%);}
          to{transform:translateX(0);}
        }
        .ash-drawer-head{
          display:flex;align-items:center;justify-content:space-between;
          padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;
        }
        .ash-drawer-logo img{height:24px;width:auto;}
        .ash-close{
          background:none;border:none;color:rgba(185,208,192,0.6);
          font-size:1rem;cursor:pointer;padding:4px 8px;border-radius:6px;
          transition:color 0.15s;
        }
        .ash-close:hover{color:#e0f0e8;}
        .ash-drawer-scroll{flex:1;overflow-y:auto;padding:8px 0;}
        .ash-drawer-section{padding:4px 0;}
        .ash-drawer-label{
          font-family:var(--font-dm-mono,'DM Mono',monospace);
          font-size:9px;letter-spacing:0.18em;color:rgba(143,163,184,0.5);
          text-transform:uppercase;padding:16px 20px 6px;
        }
        .ash-drawer-link{
          display:flex;align-items:center;gap:10px;padding:10px 20px;
          color:rgba(185,208,192,0.9);font-size:0.88rem;font-weight:500;
          text-decoration:none;transition:color 0.13s,background 0.13s;
          border:none;background:none;cursor:pointer;width:100%;text-align:left;
        }
        .ash-drawer-link:hover{color:#e0f0e8;background:rgba(255,255,255,0.04);}
        .ash-drawer-icon{font-size:15px;width:22px;text-align:center;flex-shrink:0;}
        .ash-drawer-footer{flex-shrink:0;padding-bottom:16px;}
        .ash-drawer-footer-divider{
          height:1px;background:rgba(255,255,255,0.07);margin:8px 0;
        }

        .ash-main{flex:1;width:100%;}

        .ash-page-footer{
          width:100%;padding:20px 24px;
          border-top:1px solid rgba(255,255,255,0.06);
          font-size:0.78rem;color:rgba(185,208,192,0.4);text-align:center;
        }
      `}</style>

      <div className="ash-root">
        <header className="ash-header">
          <div className="ash-header-inner">
            <Link href="/" className="ash-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" className="ash-logo" />
            </Link>

            {chrome === 'full' ? (
              <>
                <nav className="ash-topbar" aria-label="Primary navigation">
                  {topBar.map(item => (
                    <Link key={item.id} href={item.href} className="ash-topbar-link">
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <button className="ash-hamburger" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
                  <span /><span /><span />
                </button>
              </>
            ) : (
              <SignedIn>
                <Link href="/chat" className="ash-escape">→ Back to App</Link>
              </SignedIn>
            )}
          </div>
        </header>

        <main className="ash-main">
          {children}
        </main>

        {chrome === 'full' && (
          <footer className="ash-page-footer">
            <LegalLinks />
          </footer>
        )}
      </div>

      {mounted && drawerOpen && chrome === 'full' && createPortal(drawer, document.body)}
    </>
  );
}
