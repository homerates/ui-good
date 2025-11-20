// ==== REPLACE ENTIRE FILE: app/components/Sidebar.tsx ====
'use client';

import * as React from 'react';
import ProjectsPanel from './ProjectsPanel';

type HistoryItem = {
  id: string;
  title: string;
  updatedAt?: number;
};

type SidebarProps = {
  history: HistoryItem[];
  activeId: string | null;

  onSelectHistory: (id: string) => void;
  onHistoryAction: (
    action: 'rename' | 'move' | 'archive' | 'delete',
    id: string
  ) => void;

  onNewChat: () => void;
  onSettings: () => void;
  onShare: () => void;
  onSearch: () => void;
  onLibrary: () => void;
  onNewProject: () => void;
  onMortgageCalc: () => void;

  isOpen: boolean;
  onToggle: () => void;

  onProjectAction?: (action: 'rename' | 'delete', project: any) => void;
  onMoveChatToProject?: (threadId: string, projectId: string) => void;
  onSelectProject?: (project: { id: string; name?: string | null }) => void;
};

export default function Sidebar({
  history,
  activeId,
  onSelectHistory,
  onHistoryAction,
  onNewChat,
  onSettings,
  onShare,
  onSearch,
  onLibrary,
  onNewProject,
  onMortgageCalc,
  isOpen,
  onToggle,
  onProjectAction,
  onMoveChatToProject,
  onSelectProject,
}: SidebarProps) {
  const [menuChatId, setMenuChatId] = React.useState<string | null>(null);

  const handleChatClick = (id: string) => {
    onSelectHistory(id);
    setMenuChatId(null);
  };

  const handleChatAction = (action: 'rename' | 'move' | 'archive' | 'delete', id: string) => {
    setMenuChatId(null);
    onHistoryAction(action, id);
  };

  return (
    <aside
      className="sidebar"
      data-open={isOpen ? 'true' : 'false'}
      style={{
        // let existing CSS handle layout; this just makes it sane if CSS is minimal
        width: isOpen ? 260 : 0,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        borderRight: '1px solid rgba(148, 163, 184, 0.25)',
        background: 'var(--sidebar-bg, #020617)',
        color: 'var(--sidebar-fg, #e5e7eb)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
      }}
    >
      {/* Top bar with toggle (if you want it) */}
      <div
        className="sidebar-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.25)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        <span>Sessions</span>
        <button
          type="button"
          onClick={onToggle}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            fontSize: 11,
            cursor: 'pointer',
            opacity: 0.8,
          }}
        >
          {isOpen ? 'Hide' : 'Show'}
        </button>
      </div>

      {/* Scrollable body */}
      <div
        className="sidebar-body"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* New Chat button */}
        <button
          type="button"
          onClick={onNewChat}
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: 6,
            border: 'none',
            background: '#22c55e',
            color: '#020617',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 6,
          }}
        >
          New chat
        </button>

        {/* Chats list */}
        <div>
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              opacity: 0.7,
              marginBottom: 4,
            }}
          >
            Chats
          </div>

          <div className="chat-list" role="list">
            {history.length === 0 && (
              <div
                className="chat-item"
                role="listitem"
                style={{
                  opacity: 0.7,
                  fontSize: 12,
                  padding: '4px 4px',
                }}
              >
                No chats yet
              </div>
            )}

            {history.map((h) => {
              const isActive = h.id === activeId;
              const title = h.title || 'Untitled chat';
              const updated =
                typeof h.updatedAt === 'number'
                  ? new Date(h.updatedAt).toLocaleString()
                  : null;

              return (
                <div
                  key={h.id}
                  className="chat-item"
                  role="listitem"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginBottom: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleChatClick(h.id)}
                    title={title}
                    style={{
                      flex: '1 1 auto',
                      textAlign: 'left',
                      padding: '4px 6px',
                      borderRadius: 6,
                      border: 'none',
                      background: isActive
                        ? 'rgba(148, 163, 184, 0.25)'
                        : 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: 12,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {title}
                    {updated && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10,
                          opacity: 0.6,
                          marginTop: 1,
                        }}
                      >
                        {updated}
                      </span>
                    )}
                  </button>

                  {/* Simple per-chat "..." menu */}
                  <button
                    type="button"
                    aria-label="Chat options"
                    onClick={() =>
                      setMenuChatId((prev) =>
                        prev === h.id ? null : h.id
                      )
                    }
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: 14,
                      lineHeight: 1,
                      padding: '0 2px',
                      opacity: 0.8,
                    }}
                  >
                    …
                  </button>

                  {menuChatId === h.id && (
                    <div
                      style={{
                        position: 'absolute',
                        marginTop: 24,
                        marginLeft: 120,
                        padding: 6,
                        background: '#0b1120',
                        borderRadius: 8,
                        boxShadow:
                          '0 10px 25px rgba(0,0,0,0.35), 0 0 0 1px rgba(15,23,42,0.8)',
                        zIndex: 100,
                        minWidth: 150,
                        fontSize: 12,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleChatAction('rename', h.id)
                        }
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: 'transparent',
                          padding: '4px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        Rename chat
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleChatAction('move', h.id)
                        }
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: 'transparent',
                          padding: '4px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        Move to project
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleChatAction('archive', h.id)
                        }
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: 'transparent',
                          padding: '4px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        Archive chat
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleChatAction('delete', h.id)
                        }
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: 'transparent',
                          padding: '4px 6px',
                          cursor: 'pointer',
                          color: '#f97373',
                        }}
                      >
                        Delete chat
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Projects */}
        <div>
          <ProjectsPanel
            className="sidebar-projects"
            activeProjectId={null}
            onProjectAction={onProjectAction}
            onSelectProject={onSelectProject}
          />
        </div>
      </div>

      {/* Footer buttons */}
      <div
        className="sidebar-footer"
        style={{
          padding: 8,
          borderTop: '1px solid rgba(148, 163, 184, 0.25)',
          display: 'grid',
          gap: 6,
          fontSize: 11,
        }}
      >
        <button
          type="button"
          onClick={onMortgageCalc}
          style={btnStyle}
        >
          Mortgage calculator
        </button>
        <button type="button" onClick={onNewProject} style={btnStyle}>
          New project
        </button>
        <button type="button" onClick={onSearch} style={btnStyle}>
          Search chats
        </button>
        <button type="button" onClick={onLibrary} style={btnStyle}>
          Open library
        </button>
        <button type="button" onClick={onSettings} style={btnStyle}>
          Settings
        </button>
        <button type="button" onClick={onShare} style={btnStyle}>
          Export conversation
        </button>
      </div>
    </aside>
  );
}

const btnStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid rgba(148,163,184,0.4)',
  background: 'rgba(15,23,42,0.85)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontSize: 11,
  textAlign: 'left',
};
