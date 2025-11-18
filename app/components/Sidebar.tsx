// ==== REPLACE ENTIRE FILE: app/components/Sidebar.tsx ====
// Sidebar: Clerk-ready, light UI, with streamlined Knowledge Tools section

'use client';

import * as React from 'react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/nextjs';

import ProjectsPanel from './ProjectsPanel';
import MoveToProjectDialog from './MoveToProjectDialog';
import type { Project } from '../../lib/projectsClient';

type HistoryItem = { id: string; title: string; updatedAt?: number };

// Knowledge tools you'll wire in from app/page.tsx later
export type KnowledgeToolId =
  | 'mortgage-solutions'
  | 'ask-underwriting';

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

  // NEW: optional hooks for project actions and moving chats to projects
  onProjectAction?: (action: 'rename' | 'delete', project: Project) => void;
  onMoveChatToProject?: (threadId: string, projectId: string) => void;
};

// Small helper: keep chat titles to ~2–3 words + …
function truncateChatTitle(raw: string): string {
  const title = (raw || '').trim();
  if (!title) return 'New chat';

  const words = title.split(/\s+/);
  if (words.length <= 3) return title;
  return words.slice(0, 3).join(' ') + '…';
}

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
  onProjectAction,
  onMoveChatToProject,
}: SidebarProps) {
  const handleKnowledgeClick = (tool: KnowledgeToolId) => {
    if (onKnowledgeTool) onKnowledgeTool(tool);
  };

  // Local state for "Move to project" dialog
  const [moveDialogOpen, setMoveDialogOpen] = React.useState(false);
  const [moveDialogThreadId, setMoveDialogThreadId] =
    React.useState<string | null>(null);

  const handleMoveToProject = React.useCallback((threadId: string) => {
    setMoveDialogThreadId(threadId);
    setMoveDialogOpen(true);
    // IMPORTANT: do not call onHistoryAction('move', ...) here – that still uses window.prompt upstream.
  }, []);

  const handleCloseMoveDialog = React.useCallback(() => {
    setMoveDialogOpen(false);
    setMoveDialogThreadId(null);
  }, []);

  // Local active project selection – for now this is purely visual
  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(null);

  const handleSelectProject = React.useCallback((project: Project) => {
    // For now: just highlight the selected project in the list.
    // Later: we can wire this to filter chats or route to a /projects/[id] view.
    setActiveProjectId(project.id);
  }, []);

  // Hover + menu state for chats
  const [hoverChatId, setHoverChatId] = React.useState<string | null>(null);
  const [menuOpenForId, setMenuOpenForId] = React.useState<string | null>(null);

  const closeMenu = React.useCallback(() => setMenuOpenForId(null), []);

  const handleDeleteChat = React.useCallback(
    (id: string) => {
      closeMenu();
      onHistoryAction('delete', id);
    },
    [closeMenu, onHistoryAction]
  );

  return (
    <>
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

        {/* Knowledge tools: two portal-style entries */}
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

          <button
            className="btn"
            type="button"
            style={{ width: '100%', marginBottom: 8 }}
            onClick={() => handleKnowledgeClick('mortgage-solutions')}
          >
            Mortgage Solutions
          </button>

          <button
            className="btn"
            type="button"
            style={{ width: '100%', marginBottom: 4 }}
            onClick={() => handleKnowledgeClick('ask-underwriting')}
          >
            Ask Underwriting
          </button>

          <div
            style={{
              fontSize: 11,
              opacity: 0.65,
              marginTop: 4,
            }}
          >
            Portal-style views coming soon
          </div>
        </div>

        {/* Projects list */}
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid rgba(0,0,0,0.04)',
            marginBottom: 4,
          }}
        >
          <ProjectsPanel
            activeProjectId={activeProjectId}
            onSelectProject={handleSelectProject}
            onProjectAction={onProjectAction}
          />
        </div>

        {/* Threads / Chats */}
        <div style={{ padding: '8px 12px' }}>
          {/* Small CHATS header */}
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              opacity: 0.7,
              marginBottom: 6,
            }}
          >
            Chats
          </div>

          {history.length > 0 ? (
            <div className="chat-list" role="list" aria-label="Chats">
              {history.map((h) => {
                const isActive = h.id === activeId;
                const label = truncateChatTitle(h.title);
                const isHovered = hoverChatId === h.id;
                const menuOpen = menuOpenForId === h.id;

                const background = isActive
                  ? 'rgba(0,0,0,0.06)'
                  : isHovered
                    ? 'rgba(0,0,0,0.03)'
                    : 'transparent';

                return (
                  <div
                    key={h.id}
                    style={{
                      display: 'flex',
                      gap: 4,
                      alignItems: 'center',
                      marginBottom: 4,
                      position: 'relative',
                    }}
                    onMouseEnter={() => setHoverChatId(h.id)}
                    onMouseLeave={() => {
                      setHoverChatId((prev) => (prev === h.id ? null : prev));
                    }}
                  >
                    <button
                      role="listitem"
                      onClick={() => onSelectHistory(h.id)}
                      aria-current={isActive ? 'true' : 'false'}
                      title={h.title}
                      type="button"
                      style={{
                        flex: 1,
                        border: 'none',
                        background,
                        padding: '2px 4px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: isActive ? 400 : 400,
                        textAlign: 'left',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        transition: 'background 0.12s ease-out',
                      }}
                    >
                      {label}
                    </button>

                    {/* Plain text "..." trigger – no white circle */}
                    <button
                      type="button"
                      aria-label="Chat options"
                      title="Chat options"
                      onClick={() =>
                        setMenuOpenForId((prev) => (prev === h.id ? null : h.id))
                      }
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 16,
                        lineHeight: 1,
                        opacity: 0.7,
                      }}
                    >
                      …
                    </button>

                    {/* Simple dropdown menu */}
                    {menuOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '100%',
                          marginTop: 4,
                          padding: 6,
                          background: '#fff',
                          borderRadius: 8,
                          boxShadow:
                            '0 10px 25px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
                          minWidth: 140,
                          zIndex: 50,
                          fontSize: 12,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            closeMenu();
                            handleMoveToProject(h.id);
                          }}
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
                          onClick={() => handleDeleteChat(h.id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            border: 'none',
                            background: 'transparent',
                            padding: '4px 6px',
                            cursor: 'pointer',
                            color: '#b00020',
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
          ) : (
            <div style={{ opacity: 0.7, fontSize: 13 }}>No chats yet</div>
          )}
        </div>

        {/* Footer: settings + Clerk */}
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

      {/* Move-to-project dialog lives outside the sidebar */}
      <MoveToProjectDialog
        open={moveDialogOpen}
        threadId={moveDialogThreadId}
        onClose={handleCloseMoveDialog}
        onMoved={
          onMoveChatToProject && moveDialogThreadId
            ? (projectId) => onMoveChatToProject(moveDialogThreadId, projectId)
            : undefined
        }
      />
    </>
  );
}
