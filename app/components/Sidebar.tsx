'use client';

import Link from "next/link";
import * as React from "react";

export type SidebarHistoryItem = { id: string; title: string };

export type SidebarProps = {
  history: SidebarHistoryItem[];
  onNewChat: () => void;
  onSettings?: () => void;
  onShare?: () => void;
};

export default function Sidebar({
  history,
  onNewChat,
  onSettings,
  onShare,
}: SidebarProps) {
  // Single gateway for clicks (future-proof for more items)
  const onClick = React.useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    const act = el.getAttribute('data-action');
    if (act === 'new-chat')   return onNewChat();
    if (act === 'settings')   return onSettings?.();
    if (act === 'share')      return onShare?.();
  }, [onNewChat, onSettings, onShare]);

  // ChatGPT-style keyboard shortcut (Cmd/Ctrl + N)
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

  return (
    <aside className="sidebar" style={{ position: "relative", zIndex: 1000 }} onClick={onClick}>
      <div className="side-top">
        <div className="brand" style={{ position: "relative", zIndex: 10000 }}>
          <Link
            href="/"
            aria-label="HomeRates.ai home"
            style={{ display: "inline-flex", alignItems: "center", pointerEvents: "auto" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/homerates-mark.svg"
              alt="HomeRates.ai"
              width={28}
              height={28}
              style={{ display: "block" }}
            />
          </Link>
        </div>

        {/* Primary action */}
        <button className="btn primary" type="button" data-action="new-chat" aria-label="New chat">
          New chat
        </button>
      </div>

      {/* History list */}
      <div className="chat-list" role="list">
        {history.length === 0 && (
          <div className="chat-item" style={{ opacity: 0.7 }} role="listitem" aria-disabled="true">
            No history yet
          </div>
        )}
        {history.map((h) => (
          <div key={h.id} className="chat-item" role="listitem" title={h.title}>
            {h.title}
          </div>
        ))}
      </div>

      {/* Secondary actions */}
      <div className="side-bottom">
        <button className="btn" type="button" data-action="settings" aria-label="Settings">
          Settings
        </button>
        <button className="btn" type="button" data-action="share" aria-label="Share">
          Share
        </button>
      </div>
    </aside>
  );
}
