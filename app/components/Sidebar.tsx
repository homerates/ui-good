// ==== REPLACE ENTIRE FILE: app/components/Sidebar.tsx ====
// Sidebar: Clerk-ready, projects-aware, with Ask Underwriting pill
// Now with global mobile auto-close for sidebar actions

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
import LegalLinks from "./LegalLinks";
import SidebarLegal from "./SidebarLegal";


// ===== Types =====

export type HistoryItem = {
  id: string;
  title: string;
  updatedAt?: number;
};

// Knowledge tools you'll wire from app/page.tsx later if you want
export type KnowledgeToolId = 'mortgage-solutions' | 'ask-underwriting';

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
  ) => void | Promise<void>;

  onNewChat: () => void;
  onSettings: () => void;
  onShare: () => void; // kept for prop parity (not rendered as a pill)
  onSearch: () => void;
  onLibrary: () => void;
  onNewProject: () => void;
  onMortgageCalc: () => void;

  // Optional underwriting seed handler from page.tsx
  onAskUnderwriting?: () => void;

  // Optional About HomeRates handler
  onAboutHomeRates?: () => void;

  // Optional intelligence layer hook
  onKnowledgeTool?: (tool: KnowledgeToolId) => void;

  // Optional hooks for project actions
  onProjectAction?: (
    action: 'rename' | 'delete',
    project: any
  ) => void | Promise<void>;
  onMoveChatToProject?: (
    threadId: string,
    projectId: string
  ) => void | Promise<void>;
};

// ===== Helpers =====

// Small helper: keep chat titles short
function truncateChatTitle(raw: string): string {
  const title = (raw || '').trim();
  if (!title) return 'New chat';
  const words = title.split(/\s+/);
  if (words.length <= 3) return title;
  return words.slice(0, 3).join(' ') + '…';
}

// Shape of /api/projects/threads-map response
type ThreadsMapResponse = {
  ok?: boolean;
  map?: Record<string, string[]>;
};

// ===== Component =====

export default function Sidebar(props: SidebarProps) {
  const {
    id,
    history,
    activeId,
    isOpen,
    onToggle,

    // Callbacks from page.tsx (raw versions)
    onSelectHistory: rawOnSelectHistory,
    onHistoryAction,
    onNewChat: rawOnNewChat,
    onSettings: rawOnSettings,
    onShare, // not used in UI (kept for parity)
    onSearch: rawOnSearch,
    onLibrary: rawOnLibrary,
    onNewProject: rawOnNewProject,
    onMortgageCalc: rawOnMortgageCalc,
    onAskUnderwriting: rawOnAskUnderwriting,
    onAboutHomeRates: rawOnAboutHomeRates,
    onKnowledgeTool: rawOnKnowledgeTool,
    onProjectAction,
    onMoveChatToProject,
  } = props;

  // ===== Global mobile auto-close wrapper =====
  //
  // Any sidebar action that uses this wrapper will:
  // 1) Run its original callback.
  // 2) If on a small screen, call onToggle() to close the drawer.
  //
  // Desktop behavior is unchanged.

  const autoWrap = React.useCallback(
    (fn?: (...args: any[]) => void) =>
      (...args: any[]) => {
        // Run the original action first
        fn?.(...args);

        // Auto-close on mobile only
        if (typeof window !== 'undefined' && window.innerWidth <= 768) {
          onToggle();
        }
      },
    [onToggle]
  );

  // Wrapped versions of primary actions used in the JSX
  const onNewChat = autoWrap(rawOnNewChat);
  const onSearch = autoWrap(rawOnSearch);
  const onLibrary = autoWrap(rawOnLibrary);
  const onNewProject = autoWrap(rawOnNewProject);
  const onMortgageCalc = autoWrap(rawOnMortgageCalc);
  const onSettings = autoWrap(rawOnSettings);
  const onAboutHomeRates = rawOnAboutHomeRates
    ? autoWrap(rawOnAboutHomeRates)
    : undefined;

  const onKnowledgeTool = rawOnKnowledgeTool;

  // Chat selection: also auto-close on mobile so answers are visible
  const onSelectHistory = React.useCallback(
    (chatId: string) => {
      rawOnSelectHistory(chatId);

      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        onToggle();
      }
    },
    [rawOnSelectHistory, onToggle]
  );

  // Ask Underwriting click handler
  const handleAskUnderwritingClick = React.useCallback(() => {
    if (rawOnAskUnderwriting) {
      rawOnAskUnderwriting();
    } else if (onKnowledgeTool) {
      onKnowledgeTool('ask-underwriting');
    }

    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      onToggle();
    }
  }, [rawOnAskUnderwriting, onKnowledgeTool, onToggle]);

  // Mortgage Solutions knowledge tool click
  const handleKnowledgeClick = React.useCallback(
    (tool: KnowledgeToolId) => {
      if (onKnowledgeTool) {
        onKnowledgeTool(tool);
      }

      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        onToggle();
      }
    },
    [onKnowledgeTool, onToggle]
  );

  // ===== Move-to-project dialog state =====
  const [moveDialogOpen, setMoveDialogOpen] = React.useState(false);
  const [moveDialogThreadId, setMoveDialogThreadId] =
    React.useState<string | null>(null);

  const handleMoveToProject = React.useCallback((threadId: string) => {
    setMoveDialogThreadId(threadId);
    setMoveDialogOpen(true);
  }, []);

  const handleCloseMoveDialog = React.useCallback(() => {
    setMoveDialogOpen(false);
    setMoveDialogThreadId(null);
  }, []);

  // Wrapper: when dialog fires onMoved(projectId), forward both threadId + projectId to parent
  const handleMoveDialogMoved = React.useCallback(
    (projectId: string) => {
      if (moveDialogThreadId && onMoveChatToProject) {
        onMoveChatToProject(moveDialogThreadId, projectId);
      }
    },
    [moveDialogThreadId, onMoveChatToProject]
  );

  // ===== Project-aware chat filtering =====
  const [activeProjectId, setActiveProjectId] =
    React.useState<string | null>(null);

  const [projectThreadsMap, setProjectThreadsMap] =
    React.useState<Record<string, string[]>>({});

  const loadProjectThreadsMap = React.useCallback(async () => {
    try {
      const res = await fetch('/api/projects/threads-map', {
        cache: 'no-store',
      });
      if (!res.ok) {
        console.warn(
          '[Sidebar] /api/projects/threads-map responded with status',
          res.status
        );
        return;
      }

      const json = (await res.json()) as ThreadsMapResponse;
      if (!json.ok || !json.map) return;

      setProjectThreadsMap(json.map);
    } catch (err) {
      console.error(
        '[Sidebar] Failed to load project thread map from /api/projects/threads-map',
        err
      );
    }
  }, []);

  React.useEffect(() => {
    void loadProjectThreadsMap();
  }, [loadProjectThreadsMap]);

  React.useEffect(() => {
    if (!moveDialogOpen) {
      void loadProjectThreadsMap();
    }
  }, [moveDialogOpen, loadProjectThreadsMap]);

  const handleSelectProject = React.useCallback(
    (project: any) => {
      if (!project || !project.id) return;

      setActiveProjectId((prev) => (prev === project.id ? null : project.id));

      // When a project is selected on mobile, also close the drawer
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        onToggle();
      }
    },
    [onToggle]
  );

  // Forward project actions to page.tsx if provided
  const handleProjectPanelAction = React.useCallback(
    (action: 'rename' | 'delete', project: any) => {
      if (onProjectAction) {
        onProjectAction(action, project);
      } else {
        console.log('[Sidebar] project action (no handler wired):', {
          action,
          projectId: project?.id,
          name: project?.name,
        });
      }
    },
    [onProjectAction]
  );

  const visibleHistory = React.useMemo(() => {
    if (!activeProjectId) return history;

    const threadIds = projectThreadsMap[activeProjectId];
    if (!threadIds || threadIds.length === 0) {
      return history;
    }

    const allowed = new Set(threadIds);
    return history.filter((h) => allowed.has(h.id));
  }, [history, activeProjectId, projectThreadsMap]);

  // ===== Hover + context menu state for chats =====
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

  // ===== Render =====
  return (
    <>
      <aside
        id={id}
        className={`sidebar ${isOpen ? 'open' : 'closed'}`}
        aria-label="Sidebar"
      >
        {/* Header: hamburger only (brand lives in main layout) */}
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

          {/* Ask Underwriting pill – uses onAskUnderwriting if provided, otherwise onKnowledgeTool */}
          {(rawOnAskUnderwriting || onKnowledgeTool) && (
            <button
              className="btn"
              onClick={handleAskUnderwritingClick}
              type="button"
            >
              Ask Underwriting
            </button>
          )}

          {/* About HomeRates.ai – only shows if handler is provided from page.tsx */}
          {onAboutHomeRates && (
            <button className="btn" onClick={onAboutHomeRates} type="button">
              About HomeRates.ai
            </button>
          )}
        </div>

        {/* Knowledge tools section (Mortgage Solutions only for now) */}
        {onKnowledgeTool && (
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
              style={{ width: '100%' }}
              onClick={() => handleKnowledgeClick('mortgage-solutions')}
            >
              Mortgage Solutions
            </button>
          </div>
        )}

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
            onProjectAction={handleProjectPanelAction}
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

          {visibleHistory.length > 0 ? (
            <div className="chat-list" role="list" aria-label="Chats">
              {visibleHistory.map((h) => {
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

                    {/* Plain text "..." trigger – matches your previous layout */}
                    <button
                      type="button"
                      aria-label="Chat options"
                      title="Chat options"
                      onClick={() =>
                        setMenuOpenForId((prev) =>
                          prev === h.id ? null : h.id
                        )
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <UserButton
                  showName
                  appearance={{
                    elements: {
                      userButtonOuterIdentifier: {
                        fontWeight: 600,
                      },
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
        {/* About & Legal links */}
        <div style={{ marginTop: 16, padding: "0 12px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 6 }}>
            About & Legal
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <a href="/about" className="sidebar-legal-link">
              About HomeRates.ai
            </a>
            <a href="/disclosures" className="sidebar-legal-link">
              Terms & Disclosures
            </a>
            <a href="/privacy" className="sidebar-legal-link">
              Privacy & Data Policy
            </a>
          </div>
        </div>

      </aside>

      {/* Move-to-project dialog lives outside the sidebar */}
      <MoveToProjectDialog
        open={moveDialogOpen}
        threadId={moveDialogThreadId}
        onClose={handleCloseMoveDialog}
        onMoved={handleMoveDialogMoved}
      />
    </>
  );
}
