// START Sidebar.tsx (REPLACE ALL)
'use client';

import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";

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
  onSearch?: () => void;
  onLibrary?: () => void;
  onNewProject?: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
  activeId?: string | null;
  onSelectHistory?: (id: string) => void;
  onHistoryAction?: (action: 'rename' | 'move' | 'archive' | 'delete', id: string) => void;
};

export default function Sidebar({
  history,
  onNewChat,
  onSettings,
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
  const { user } = useUser();
  const [isMobile, setIsMobile] = React.useState(false);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  // mobile detection
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // close kebab on outside click
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('.history-kebab, .history-menu')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  // cmd/ctrl + N
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
  };

  const slideStyle: React.CSSProperties = isMobile
    ? { transform: isOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 200ms ease' }
    : {};

  return (
    <>
      {/* dim overlay on mobile when open */}
      {isMobile && isOpen && (
        <div
          onClick={onToggle}
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 999 }}
        />
      )}

      {/* The aside is the scroll container: vertical only */}
      <aside
        className="sticky top-0 h-[100dvh] flex flex-col border-r bg-white text-black overflow-y-auto"
        role="complementary"
        aria-label="Sidebar"
        style={{ position: "relative", zIndex: 1000, ...slideStyle }}
      >
        {/* Header */}
        <div className="p-3 border-b">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <Link href="/" className="inline-flex items-center gap-2">
              <img src="/assets/homerates-mark.svg" alt="HomeRates.ai" width={28} height={28} />
              <span className="font-bold">HomeRates.ai</span>
            </Link>

            <button
              type="button"
              className="ml-auto inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
              onClick={onNewChat}
            >
              <Icon.Plus />
              New
            </button>
          </div>

          {/* Quick actions */}
          <nav className="grid gap-2 mt-2">
            <button className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm" onClick={onSearch}>
              <Icon.Search />
              Search
            </button>
            <button className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm" onClick={onLibrary}>
              Library
            </button>
            <button className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm" onClick={onNewProject}>
              <Icon.Folder />
              New Project +
            </button>
          </nav>
        </div>

        {/* History */}
        <div className="p-3">
          {history.length === 0 && (
            <div className="opacity-70 text-sm">No history yet</div>
          )}

          <div role="list" className="space-y-1">
            {history.filter(h => !h.archived).map((h) => {
              const isActive = !!activeId && h.id === activeId;
              return (
                <div
                  key={h.id}
                  role="listitem"
                  className="flex items-center"
                >
                  <button
                    type="button"
                    onClick={() => onSelectHistory?.(h.id)}
                    className={`flex-1 text-left truncate rounded-md px-2 py-1 text-sm ${isActive ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'}`}
                    aria-current={isActive ? 'true' : undefined}
                    title={h.title}
                  >
                    {h.project ? `📁 ${h.project} — ` : ''}{h.title}
                  </button>

                  <button
                    type="button"
                    className="history-kebab ml-2 rounded border px-2 py-0.5 text-sm"
                    aria-label="More"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(prev => (prev === h.id ? null : h.id));
                    }}
                  >
                    ⋯
                  </button>

                  {openMenuId === h.id && (
                    <div
                      className="history-menu absolute z-50 mt-8 rounded-md border bg-white shadow-lg"
                      style={{ right: 12, minWidth: 180 }}
                      role="menu"
                    >
                      <div className="p-1 grid gap-1">
                        <button className="text-left rounded px-2 py-1 hover:bg-gray-50" onClick={() => { onHistoryAction?.('rename', h.id); setOpenMenuId(null); }}>Rename</button>
                        <button className="text-left rounded px-2 py-1 hover:bg-gray-50" onClick={() => { onHistoryAction?.('move', h.id); setOpenMenuId(null); }}>Move to project…</button>
                        <button className="text-left rounded px-2 py-1 hover:bg-gray-50" onClick={() => { onHistoryAction?.('archive', h.id); setOpenMenuId(null); }}>Archive</button>
                        <button className="text-left rounded px-2 py-1 hover:bg-gray-50" onClick={() => { onHistoryAction?.('delete', h.id); setOpenMenuId(null); }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* spacer pushes footer down */}
        <div className="flex-1" />

        {/* Sticky footer: avatar or login */}
        <div className="sticky bottom-0 border-t bg-white p-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm w-full"
            onClick={onSettings}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19.14 12.94a7.96 7.96 0 000-1.88l2.03-1.58a.5.5 0 00.12-.65l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.8 7.8 0 00-1.63-.95l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.57.23-1.12.54-1.63.95l-2.39-.96a.5.5 0 00-.6.22L2.71 8.83a.5.5 0 00.12.65l2.03 1.58a7.96 7.96 0 000 1.88L2.83 14.6a.5.5 0 00-.12.65l1.92 3.32c.14.24.44.34.7.22l2.39-.96c.51.41 1.06.72 1.63.95l.36 2.54c.05.25.26.42.5.42h3.84c.24 0 .45-.17.5-.42l.36-2.54c.57-.23 1.12-.54 1.63-.95l2.39.96c.26.12.56.02.7-.22l1.92-3.32a.5.5 0 00-.12-.65l-2.03-1.66zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" fill="currentColor" />
            </svg>
            Settings
          </button>

          <div className="mt-2">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="w-full rounded-md px-3 py-2 border text-sm">Login</button>
              </SignInButton>
            </SignedOut>

            <SignedIn>
              <div className="flex items-center gap-3">
                <UserButton appearance={{ elements: { avatarBox: { width: "40px", height: "40px" } } }} />
                <div className="text-sm">
                  <div className="font-medium">{user?.fullName ?? user?.firstName ?? "Signed in"}</div>
                  <div className="text-gray-500">{user?.primaryEmailAddress?.emailAddress}</div>
                </div>
              </div>
              <div className="mt-2">
                <Link href="/profile" className="block w-full rounded-md px-3 py-2 border text-sm">
                  Profile
                </Link>
              </div>
            </SignedIn>
          </div>
        </div>
      </aside>
    </>
  );
}
// END Sidebar.tsx (REPLACE ALL)
