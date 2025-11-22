'use client';

import * as React from 'react';

export type HistoryItem = {
  id: string;
  title: string;
  updatedAt?: number;
};

// Knowledge tools you'll wire in from app/page.tsx later
export type KnowledgeToolId = 'mortgage-solutions' | 'ask-underwriting';

export type SidebarProps = {
  id?: string;

  history: HistoryItem[];
  activeId: string | null;
  onSelectHistory: (id: string) => void;

  onNewChat: () => void;
  onSettings: () => void;
  onShare: () => void; // kept for prop parity (not rendered as a pill today)
  onSearch: () => void;
  onLibrary: () => void;
  onNewProject: () => void;
  onMortgageCalc: () => void;
  onAskUnderwriting?: () => void;

  // Optional intelligence layer hook – safe even if not passed yet
  onKnowledgeTool?: (tool: KnowledgeToolId) => void;

  // Optional hooks for future project actions (rename/delete, etc.)
  onProjectAction?: (action: 'rename' | 'delete', project: any) => void;
  onMoveChatToProject?: (threadId: string, projectId: string) => void;

  // Optional history action hook (delete/rename etc.), kept for prop parity
  onHistoryAction?: (action: string, item: HistoryItem) => void;

  isOpen: boolean;
  onToggle: () => void;
};

export default function Sidebar({
  history,
  activeId,
  onSelectHistory,
  onNewChat,
  onSettings,
  onShare, // not used visually yet, kept for future parity
  onSearch,
  onLibrary,
  onNewProject,
  onMortgageCalc,
  onAskUnderwriting,
  onKnowledgeTool,
  onProjectAction,
  onMoveChatToProject,
  onHistoryAction, // currently unused, but accepted so page.tsx compiles
  isOpen,
  onToggle,
}: SidebarProps) {
  // Simple helper to render a history item row
  const renderHistoryItem = (item: HistoryItem) => {
    const isActive = item.id === activeId;
    return (
      <button
        key={item.id}
        type="button"
        className="chat-item"
        onClick={() => onSelectHistory(item.id)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '6px 8px',
          borderRadius: 8,
          border: 'none',
          background: isActive ? 'rgba(15,118,110,0.12)' : 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 13,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
        }}
        title={item.title}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: '1 1 auto',
          }}
        >
          {item.title}
        </span>
        {item.updatedAt && (
          <span
            style={{
              fontSize: 11,
              opacity: 0.6,
              flex: '0 0 auto',
            }}
          >
            {new Date(item.updatedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`sidebar ${isOpen ? 'open' : 'closed'}`}
      aria-label="Chat sidebar"
    >
      <div className="sidebar-inner">
        {/* Header + collapse toggle */}
        <div
          className="sidebar-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 10px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14 }}>HomeRates.ai</div>
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            {isOpen ? '⟨' : '⟩'}
          </button>
        </div>

        {/* Primary actions */}
        <div
          className="nav"
          style={{
            display: 'grid',
            gap: 6,
            padding: '8px 10px',
          }}
        >
          <button
            type="button"
            className="nav-item"
            onClick={onNewChat}
            style={pillStyle(true)}
          >
            New chat
          </button>

          <button
            type="button"
            className="nav-item"
            onClick={onSearch}
            style={pillStyle()}
          >
            Search
          </button>

          <button
            type="button"
            className="nav-item"
            onClick={onLibrary}
            style={pillStyle()}
          >
            Library
          </button>

          <button
            type="button"
            className="nav-item"
            onClick={onNewProject}
            style={pillStyle()}
          >
            New project
          </button>

          <button
            type="button"
            className="nav-item"
            onClick={onMortgageCalc}
            style={pillStyle()}
          >
            Mortgage calculator
          </button>

          {/* New: Ask Underwriting pill – uses seed + routing keywords */}
          <button
            type="button"
            className="nav-item"
            onClick={() => onAskUnderwriting?.()}
            style={pillStyle()}
          >
            Ask underwriting
          </button>
        </div>

        {/* Knowledge tools area (if you decide to use it later) */}
        {onKnowledgeTool && (
          <div
            style={{
              padding: '4px 10px 10px',
              borderTop: '1px solid rgba(148,163,184,0.25)',
              marginTop: 6,
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: 0.06,
                opacity: 0.7,
                marginBottom: 4,
              }}
            >
              Tools
            </div>
            <div
              style={{
                display: 'grid',
                gap: 4,
              }}
            >
              <button
                type="button"
                className="nav-item"
                onClick={() => onKnowledgeTool('mortgage-solutions')}
                style={pillStyle(false, 11)}
              >
                Mortgage solutions
              </button>
              <button
                type="button"
                className="nav-item"
                onClick={() => onKnowledgeTool('ask-underwriting')}
                style={pillStyle(false, 11)}
              >
                Ask underwriting (pro)
              </button>
            </div>
          </div>
        )}

        {/* History list */}
        <div
          style={{
            padding: '8px 10px 10px',
            borderTop: '1px solid rgba(148,163,184,0.25)',
            marginTop: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            flex: '1 1 auto',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.06,
              opacity: 0.7,
            }}
          >
            Recent chats
          </div>

          <div
            className="chat-list"
            role="list"
            style={{
              flex: '1 1 auto',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {history.length === 0 && (
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.7,
                  padding: '4px 0',
                }}
              >
                No history yet
              </div>
            )}

            {history.map((item) => renderHistoryItem(item))}
          </div>
        </div>

        {/* Footer settings */}
        <div
          style={{
            padding: '8px 10px 10px',
            borderTop: '1px solid rgba(148,163,184,0.25)',
            marginTop: 'auto',
            display: 'flex',
            gap: 6,
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={onSettings}
            style={footerBtnStyle}
          >
            Settings
          </button>
          {/* onShare kept for parity; you can add a button later if you want */}
        </div>
      </div>
    </aside>
  );
}

/* ===== Small inline style helpers to keep JSX cleaner ===== */

function pillStyle(primary = false, fontSize = 12): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 999,
    border: primary ? 'none' : '1px solid rgba(148,163,184,0.5)',
    background: primary ? 'rgba(15,118,110,0.15)' : 'transparent',
    color: 'inherit',
    fontSize,
    cursor: 'pointer',
    textAlign: 'left',
    display: 'block',
  };
}

const footerBtnStyle: React.CSSProperties = {
  flex: '0 0 auto',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,0.5)',
  background: 'transparent',
  fontSize: 11,
  cursor: 'pointer',
};
