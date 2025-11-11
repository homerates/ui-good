// ==== REPLACE ENTIRE FILE: app/components/Sidebar.tsx ====
'use client';

import * as React from 'react';

export type SidebarHistoryItem = { id: string; title: string; updatedAt?: number };

export type SidebarProps = {
  history: SidebarHistoryItem[];
  activeId: string | null;
  onSelectHistory: (id: string) => void;

  onNewChat: () => void;
  onSearch: () => void;
  onLibrary: () => void;
  onSettings: () => void;
  onNewProject: () => void;
  onMortgageCalc: () => void;
  onShare: () => void;

  isOpen: boolean;
  onToggle: () => void;
  onHistoryAction: (action: 'rename' | 'move' | 'archive' | 'delete', id: string) => void;
  id?: string; // optional id (you passed "hr-sidebar")
};

export default function Sidebar({
  history,
  activeId,
  onSelectHistory,
  onNewChat,
  onSearch,
  onLibrary,
  onSettings,
  onNewProject,
  onMortgageCalc,
  onShare,
  isOpen,
  onToggle,
  onHistoryAction,
  id,
}: SidebarProps) {
  return (
    <aside
      id={id}
      className={`sidebar ${isOpen ? 'open' : 'closed'}`}
      aria-hidden={!isOpen}
    >
      <div className="sidebar-inner">
        <button className="pill primary" onClick={onNewChat}>
          <span className="icon">＋</span> New chat
        </button>

        <button className="pill" onClick={onSearch}>
          <span className="icon">🔎</span> Search
        </button>

        <button className="pill" onClick={onLibrary}>
          <span className="icon">📚</span> Library
        </button>

        <button className="pill" onClick={onNewProject}>
          <span className="icon">📁</span> New Project +
        </button>

        <button className="pill" onClick={onMortgageCalc}>
          <span className="icon">🏠</span> Mortgage Calculator
        </button>

        <div className="sidebar-section">
          {history.map((h) => {
            const active = h.id === activeId;
            return (
              <div key={h.id} className={`chat-row ${active ? 'active' : ''}`}>
                <button
                  className="chat-button"
                  title={h.title}
                  onClick={() => onSelectHistory(h.id)}
                >
                  {h.title}
                </button>
                <div className="chat-actions">
                  <button
                    className="dotbtn"
                    title="Rename"
                    onClick={() => onHistoryAction('rename', h.id)}
                  >
                    …
                  </button>
                  <button
                    className="dotbtn"
                    title="Delete"
                    onClick={() => onHistoryAction('delete', h.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <button className="pill" onClick={onSettings}>
            <span className="icon">⚙️</span> Settings
          </button>
          <button className="pill" onClick={onShare}>
            <span className="icon">⧉</span> Copy conversation
          </button>
          <button className="pill subtle" onClick={onToggle}>
            {isOpen ? 'Close Sidebar' : 'Open Sidebar'}
          </button>
        </div>
      </div>
    </aside>
  );
}
