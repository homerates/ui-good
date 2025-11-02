// START Sidebar.tsx (REPLACE ALL)
'use client';

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import * as React from "react";
import { useRouter } from "next/navigation";

export type SidebarHistoryItem = {
  id: string;
  title: string;
  updatedAt?: number;
  project?: string;
  archived?: boolean;
};

export type SidebarProps = {
  history: SidebarHistoryItem[];
  onNewChat: () => void;
  onSettings?: () => void;
  onShare?: () => void;

  // Optional future wires
  onSearch?: () => void;
  onLibrary?: () => void;
  onNewProject?: () => void;

  // NEW: open/close + selection
  isOpen?: boolean;
  onToggle?: () => void;
  activeId?: string | null;
  onSelectHistory?: (id: string) => void;

  // NEW: kebab actions
  onHistoryAction?: (action: 'rename' | 'move' | 'archive' | 'delete', id: string) => void;
};

export default function Sidebar({
  history,
  onNewChat,
  onSettings,
  onShare,
  onSearch,
  onLibrary,
  onNewProject,
  isOpen = true,
  onToggle,
  activeId,
  onSelectHistory,
  onHistoryAction,
}: SidebarProps) {
  const router = useRouter();

  // One click gateway for toolbar buttons (event delegation)
  const onClick = React.useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    const act = el.getAttribute('data-action');
    if (act === 'new-chat') return onNewChat();
    if (act === 'search') return onSearch?.();
    if (act === 'library') return onLibrary?.();
    if (act === 'new-project') return onNewProject?.();
    if (act === 'settings') return onSettings?.();
    if (act === 'login') { router.push('/login'); return; }
    if (act === 'share') return onShare?.();
  }, [onNewChat, onSearch, onLibrary, onNewProject, onSettings, onShare, router]);

  // Mobile detection (for slide-in/out)
  const [isMobile, setIsMobile] = React.useState(false);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const closeMenu = () => setOpenMenuId(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('.history-kebab, .history-menu')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Cmd/Ctrl + N for New chat
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onNewChat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNewChat]);

  // tiny svg helpers
  const Icon = {
    Plus: () => (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M6 1h2v12H6zM1 6h12v2H1z" fill="currentColor" />
      </svg>
    ),
    Search: () => (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 5L20.49 19l-5-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor" />
      </svg>
    ),
    Folder: () => (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h6z" fill="currentColor" />
      </svg>
    ),
    Book: () => (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 2h11a1 1 0 011 1v18a1 1 0 01-1.2.98L12 21l-4.8.98A1 1 0 016 21V3a1 1 0 011-1z" fill="currentColor" />
      </svg>
    ),
    Cog: () => (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.14 12.94a7.96 7.96 0 000-1.88l2.03-1.58a.5.5 0 00.12-.65l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.8 7.8 0 00-1.63-.95l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.57.23-1.12.54-1.63.95l-2.39-.96a.5.5 0 00-.6.22L2.71 8.83a.5.5 0 00.12.65l2.03 1.58a7.96 7.96 0 000 1.88L2.83 14.6a.5.5 0 00-.12.65l1.92 3.32c.14.24.44.34.7.22l2.39-.96c.51.41 1.06.72 1.63.95l.36 2.54c.05.25.26.42.5.42h3.84c.24 0 .45-.17.5-.42l.36-2.54c.57-.23 1.12-.54 1.63-.95l2.39.96c.26.12.56.02.7-.22l1.92-3.32a.5.5 0 00-.12-.65l-2.03-1.66zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" fill="currentColor" />
      </svg>
    ),
    Share: () => (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.3 3.3 0 000-1.39l7.02-4.11A3 3 0 0018 7.91 3.09 3.09 0 1021.09 5 3.09 3.09 0 0018 7.91c-.24 0-.47-.03-.69-.09L10.3 11.93c.05.23.08.46.08.7s-.03.47-.08.69l7.01 4.12c.22-.06.45-.09.69-.09a3.09 3.09 0 103.09-3.09 3.1 3.1 0 00-3.09 3.09z" fill="currentColor" />
      </svg>
    ),
    Menu: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" fill="currentColor" />
      </svg>
    ),
    Login: () => (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 3h8a1 1 0 011 1v16a1 1 0 01-1 1h-8v-2h7V5h-7V3zM5.59 7.41L7 6l5 5-5 5-1.41-1.41L8.17 12 5.59 9.41z" fill="currentColor" />
      </svg>
    ),
  };

  // Slide behavior (inline style so we don't rely on CSS being present)
  const slideStyle: React.CSSProperties = isMobile
    ? { transform: isOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 200ms ease' }
    : {};

  return (
    <>
      {/* Optional overlay when sidebar is open on mobile (tap to close) */}
      {isMobile && isOpen && (
        <div
          onClick={onToggle}
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 999 }}
        />
      )}

      <div
        className="sticky top-0 h-[100dvh] md:h-screen flex flex-col border-r bg-white"
        role="complementary"
        aria-label="Sidebar"
        style={{ position: "relative", zIndex: 1000, ...slideStyle }}
        onClick={onClick}
        data-open={isOpen ? 'true' : 'false'}
      >
        {/* Brand + primary */}
        <div className="side-top">
          <div className="brand" style={{ position: "relative", zIndex: 10000, display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Mobile hamburger */}
            {isMobile && (
              <button
                type="button"
                className="btn"
                aria-label="Toggle sidebar"
                onClick={onToggle}
                style={{ padding: '6px 8px' }}
              >
                <Icon.Menu />
              </button>
            )}

            <Link
              href="/"
              aria-label="HomeRates.ai home"
              style={{ display: "inline-flex", alignItems: "center", pointerEvents: "auto", gap: 8 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-mark.svg" alt="HomeRates.ai" width={28} height={28} style={{ display: "block" }} />
              <span style={{ fontWeight: 700 }}>HomeRates.ai</span>
            </Link>
          </div>

          <button className="btn primary" type="button" data-action="new-chat" aria-label="New chat">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon.Plus /> New chat
            </span>
          </button>
        </div>

        {/* ChatGPT-like quick actions */}
        <nav className="side-actions" style={{ padding: "0 12px", display: "grid", gap: 6, marginTop: 4 }}>
          {/* === SEARCH (restored) === */}
          <button data-action="search" aria-label="Search" onClick={onSearch} className="btn">
            <Icon.Search />
            <span className="text-sm font-medium">Search</span>
          </button>

          <button className="btn" type="button" data-action="library" aria-label="Library">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon.Book /> Library
            </span>
          </button>
          <button className="btn" type="button" data-action="new-project" aria-label="New Project">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon.Folder /> New Project +
            </span>
          </button>
        </nav>

        {/* History list */}
        <div className="chat-list" role="list" style={{ marginTop: 8 }}>
          {history.length === 0 && (
            <div className="chat-item" style={{ opacity: 0.7 }} role="listitem" aria-disabled="true">
              No history yet
            </div>
          )}

          {history
            .filter(h => !h.archived)
            .map((h) => {
              const isActive = !!activeId && h.id === activeId;
              return (
                <div
                  key={h.id}
                  className={`chat-item-row${isActive ? ' is-active' : ''}`}
                  role="listitem"
                  title={h.title}
                  style={{ display: 'flex', alignItems: 'center', position: 'relative' }}
                >
                  <button
                    type="button"
                    className={`chat-item${isActive ? ' is-active' : ''}`}
                    onClick={() => onSelectHistory?.(h.id)}
                    style={{ textAlign: 'left', flex: 1 }}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {h.project && (
                        <span
                          className="chip"
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: 'var(--surface-2, #f2f2f2)',
                            color: 'var(--text-weak, #555)'
                          }}
                        >
                          📁 {h.project}
                        </span>
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.title}
                      </span>
                    </div>
                  </button>

                  {/* ⋯ kebab */}
                  <button
                    type="button"
                    className="history-kebab"
                    aria-label="More"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(prev => (prev === h.id ? null : h.id));
                    }}
                    style={{
                      marginLeft: 6,
                      padding: '4px 6px',
                      borderRadius: 6,
                      border: '1px solid var(--border, #ddd)',
                      background: 'var(--card, #fff)',
                      cursor: 'pointer'
                    }}
                  >
                    ⋯
                  </button>

                  {/* dropdown */}
                  {openMenuId === h.id && (
                    <div
                      className="history-menu"
                      role="menu"
                      style={{
                        position: 'absolute',
                        right: 8,
                        transform: 'translateY(28px)',
                        zIndex: 10000,
                        background: 'var(--card, #fff)',
                        border: '1px solid var(--border, #ddd)',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        minWidth: 180,
                        padding: 6,
                        display: 'grid',
                        gap: 4
                      }}
                    >
                      <button className="btn" type="button" onClick={() => { onHistoryAction?.('rename', h.id); closeMenu(); }}>
                        Rename
                      </button>
                      <button className="btn" type="button" onClick={() => { onHistoryAction?.('move', h.id); closeMenu(); }}>
                        Move to project…
                      </button>
                      <button className="btn" type="button" onClick={() => { onHistoryAction?.('archive', h.id); closeMenu(); }}>
                        Archive
                      </button>
                      <button className="btn" type="button" onClick={() => { onHistoryAction?.('delete', h.id); closeMenu(); }}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Spacer so bottom block stays anchored */}
        <div style={{ flex: 1 }} />

        {/* Bottom-pinned: Settings + Auth controls */}
        <div className="mt-auto border-t p-3">
          <button className="btn" type="button" data-action="settings" aria-label="Settings">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon.Cog /> Settings
            </span>
          </button>

          <div className="mt-2">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="w-full rounded-md px-3 py-2 border">Login</button>
              </SignInButton>
            </SignedOut>

            <SignedIn>
              {/* Avatar w/ initials + menu (doesn't navigate away) */}
              <UserButton appearance={{ elements: { avatarBox: { width: "40px", height: "40px" } } }} />
              {/* Optional: link to profile page */}
              <div className="mt-2">
                <Link href="/profile" className="block w-full rounded-md px-3 py-2 border">
                  Profile
                </Link>
              </div>
            </SignedIn>
          </div>
        </div>
      </div>
    </>
  );
}
// END Sidebar.tsx (REPLACE ALL)
