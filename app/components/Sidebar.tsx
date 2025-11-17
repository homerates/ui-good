// ==== REPLACE ENTIRE FILE: app/components/Sidebar.tsx ====
// Sidebar: Clerk-ready, light UI, with Knowledge Tools section (projects, library, underwriting)

'use client';

import * as React from 'react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/nextjs';

type HistoryItem = { id: string; title: string; updatedAt?: number };

// Knowledge tools you'll wire in from app/page.tsx later
export type KnowledgeToolId =
  | 'programs' // general mortgage programs hub
  | 'uw-fnma'
  | 'uw-freddie'
  | 'uw-fha'
  | 'uw-jumbo'
  | 'uw-dscr'
  | 'uw-bank-statement';

export type SidebarProps = {
  id?: string;
  history: HistoryItem[];
  activeId: string | null;
  isOpen: boolean;

  onToggle: () => void;

  onSelectHistory: (id: string) => void;
  onHistoryAction: (
    action: 'rename' | 'move' | 'archive' | 'delete',
    id: string
  ) => void;

  onNewChat: () => void;
  onSettings: () => void;
  onShare: () => void; // kept for prop parity (not rendered as a pill)
  onSearch: () => void;
  onLibrary: () => void;
  onNewProject: () => void;
  onMortgageCalc: () => void;

  // Optional intelligence layer hook – safe even if not passed yet
  onKnowledgeTool?: (tool: KnowledgeToolId) => void;
};

export default function Sidebar({
  id,
  history,
  activeId,
  isOpen,
  onToggle,
  onSelectHistory,
  onHistoryAction,
  onNewChat,
  onSettings,
  onShare, // not used in UI (per request), but kept to match page props
  onSearch,
  onLibrary,
  onNewProject,
  onMortgageCalc,
  onKnowledgeTool,
}: SidebarProps) {
  const handleKnowledgeClick = (tool: KnowledgeToolId) => {
    if (onKnowledgeTool) onKnowledgeTool(tool);
  };

  return (
    <aside
      id={id}
      className={`sidebar ${isOpen ? 'open' : 'closed'}`}
      aria-label="Sidebar"
    >
      {/* Header: hamburger + brand placeholder */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 12px 8px 12px',
        }}
      >
        <button
          className="hamburger"
          onClick={onToggle}
          aria-label={isOpen ? 'Close Sidebar' : 'Open Sidebar'}
          title={isOpen ? 'Close Sidebar' : 'Open Sidebar'}
          type="button"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div style={{ height: 0 }} />
      </div>

      {/* Primary actions */}
      <div style={{ display: 'grid', gap: 10, padding: '8px 12px' }}>
        <button className="btn primary" onClick={onNewChat} type="button">
          New chat
        </button>
        <button className="btn" onClick={onSearch} type="button">
          Search
        </button>
        <button className="btn" onClick={onLibrary} type="button">
          Library
        </button>
        <button className="btn" onClick={onNewProject} type="button">
          New Project +
        </button>
        <button className="btn" onClick={onMortgageCalc} type="button">
          Mortgage Calculator
        </button>
      </div>

      {/* Knowledge tools: Programs + Ask Underwriting */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid rgba(0,0,0,0.05)',
          borderBottom: '1px solid rgba(0,0,0,0.04)',
          marginTop: 4,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            opacity: 0.7,
            marginBottom: 6,
          }}
        >
          Knowledge tools
        </div>

        {/* Mortgage Programs hub (can later open a dedicated view or prefill prompts) */}
        <button
          className="btn"
          type="button"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => handleKnowledgeClick('programs')}
        >
          Mortgage Programs
        </button>

        {/* Ask Underwriting shortcuts */}
        <div
          style={{
            fontSize: 12,
            opacity: 0.8,
            marginBottom: 4,
            marginTop: 4,
          }}
        >
          Ask Underwriting
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 6,
          }}
        >
          <button
            className="btn"
            type="button"
            onClick={() => handleKnowledgeClick('uw-fnma')}
          >
            FNMA
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => handleKnowledgeClick('uw-freddie')}
          >
            Freddie
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => handleKnowledgeClick('uw-fha')}
          >
            FHA
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => handleKnowledgeClick('uw-jumbo')}
          >
            Jumbo
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => handleKnowledgeClick('uw-dscr')}
          >
            DSCR
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => handleKnowledgeClick('uw-bank-statement')}
          >
            Bank Stmnt
          </button>
        </div>
      </div>

      {/* Threads */}
      <div style={{ padding: '8px 12px' }}>
        {history.length > 0 ? (
          <div className="chat-list" role="list" aria-label="Chats">
            {history.map((h) => {
              const isActive = h.id === activeId;
              return (
                <div
                  key={h.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <button
                    className="chat-item"
                    role="listitem"
                    onClick={() => onSelectHistory(h.id)}
                    aria-current={isActive ? 'true' : 'false'}
                    title={h.title}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      fontWeight: isActive ? 600 : 400,
                    }}
                    type="button"
                  >
                    {h.title}
                  </button>
                  <div className="menu">
                    <button
                      className="btn"
                      aria-label="Rename chat"
                      title="Rename chat"
                      onClick={() => onHistoryAction('rename', h.id)}
                      type="button"
                    >
                      …
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ opacity: 0.7, fontSize: 13 }}>No chats yet</div>
        )}
      </div>

      {/* Footer: settings + Clerk (no Copy conversation pill) */}
      <div style={{ marginTop: 'auto', padding: '12px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onSettings} type="button">
            Settings
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <SignedIn>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <UserButton
                showName
                appearance={{
                  elements: {
                    userButtonOuterIdentifier: { fontWeight: 600 },
                  },
                }}
              />
            </div>
          </SignedIn>

          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn primary" type="button">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </div>
    </aside>
  );
}
