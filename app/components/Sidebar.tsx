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
import { NAV_ITEMS } from '@/nav-config';


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
  onLabSeed?: (seed: string) => void;

  // Optional underwriting seed handler from page.tsx
  onAskUnderwriting?: () => void;

  // Optional About HomeRates handler
  onAboutHomeRates?: () => void;
  onHowItWorks?: () => void;

  // Optional intelligence layer hook
  onKnowledgeTool?: (tool: KnowledgeToolId) => void;

  // Price Check — focuses input so user can paste a listing URL
  onPriceCheck?: () => void;

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
    onAskUnderwriting: rawOnAskUnderwriting,
    onAboutHomeRates: rawOnAboutHomeRates,
    onHowItWorks: rawOnHowItWorks,
    onKnowledgeTool: rawOnKnowledgeTool,
    onPriceCheck: rawOnPriceCheck,
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

  const isMobile = () =>
    typeof window !== 'undefined' && window.innerWidth < 1024;

  const autoWrap = React.useCallback(
    (fn?: (...args: any[]) => void) =>
      (...args: any[]) => {
        // Close sidebar first on mobile so it doesn't race with state updates
        if (isMobile()) onToggle();
        fn?.(...args);
      },
    [onToggle]
  );

  // Wrapped versions of primary actions used in the JSX
  const onNewChat = autoWrap(rawOnNewChat);
  const onSearch = autoWrap(rawOnSearch);
  const onLibrary = autoWrap(rawOnLibrary);
  const onNewProject = autoWrap(rawOnNewProject);
  const onSettings = autoWrap(rawOnSettings);
  const onLabSeed = props.onLabSeed
    ? (seed: string) => {
        if (isMobile()) onToggle();
        props.onLabSeed!(seed);
      }
    : undefined;
  const onPriceCheck = rawOnPriceCheck ? autoWrap(rawOnPriceCheck) : undefined;
  const onAboutHomeRates = rawOnAboutHomeRates
    ? autoWrap(rawOnAboutHomeRates)
    : undefined;
  const onHowItWorks = rawOnHowItWorks
    ? autoWrap(rawOnHowItWorks)
    : undefined;
  const onKnowledgeTool = rawOnKnowledgeTool;

  // Chat selection: also auto-close on mobile so answers are visible
  const onSelectHistory = React.useCallback(
    (chatId: string) => {
      if (isMobile()) onToggle();
      rawOnSelectHistory(chatId);
    },
    [rawOnSelectHistory, onToggle]
  );

  // Ask Underwriting click handler
  const handleAskUnderwritingClick = React.useCallback(() => {
    if (isMobile()) onToggle();
    if (rawOnAskUnderwriting) {
      rawOnAskUnderwriting();
    } else if (onKnowledgeTool) {
      onKnowledgeTool('ask-underwriting');
    }
  }, [rawOnAskUnderwriting, onKnowledgeTool, onToggle]);

  // Mortgage Solutions knowledge tool click
  const handleKnowledgeClick = React.useCallback(
    (tool: KnowledgeToolId) => {
      if (isMobile()) onToggle();
      if (onKnowledgeTool) {
        onKnowledgeTool(tool);
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

      if (isMobile()) onToggle();
      setActiveProjectId((prev) => (prev === project.id ? null : project.id));
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
        {/* ── Scrollable content ── */}
        <div className="sidebar-scroll">

          {/* Header: hamburger only — logo lives in main header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '12px 14px 10px 14px',
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
          </div>

          {/* ── Section: New chat ── */}
          <div className="sidebar-section">
            <button className="btn primary" onClick={onNewChat} type="button">
              + New chat
            </button>
          </div>

          {/* ── Nav sections (nav-config driven: pro mode, chatPanel surface) ── */}
          {(['decide', 'tools', 'mine', 'learn'] as const).map((g) => {
            const groupItems = NAV_ITEMS.filter(i =>
              i.modes.includes('pro') &&
              i.surfaces.includes('chatPanel') &&
              !i.footer &&
              i.group === g &&
              i.id !== 'chat'
            );
            // Inject the Property Lookup in-chat shortcut at the bottom of Decide
            const showPropertyLookup = g === 'decide' && !!onPriceCheck;
            if (!groupItems.length && !showPropertyLookup) return null;

            const GROUP_LABEL: Record<string, string> = {
              decide: 'Decide', tools: 'Tools', mine: 'Mine', learn: 'Learn',
            };
            const proBadgeStyle: React.CSSProperties = {
              marginLeft: 'auto',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
              color: '#1a0a00',
              padding: '2px 6px',
              borderRadius: 999,
              flexShrink: 0,
            };

            return (
              <div key={g} className="sidebar-section">
                <div className="sidebar-section-label">{GROUP_LABEL[g]}</div>
                {groupItems.map(item => {
                  const label = item.labelByMode?.['pro'] ?? item.label;
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      className="btn sidebar-tool-btn"
                      style={{ textDecoration: 'none' }}
                    >
                      <span className="sidebar-tool-icon">{item.icon}</span>
                      {label}
                      {item.proBadge && <span style={proBadgeStyle}>⭐ Pro</span>}
                    </a>
                  );
                })}
                {showPropertyLookup && (
                  <button
                    className="btn sidebar-tool-btn"
                    type="button"
                    onClick={onPriceCheck}
                  >
                    <span className="sidebar-tool-icon">🔎</span>
                    Property Lookup
                  </button>
                )}
              </div>
            );
          })}

          {/* ── Projects list ── */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              marginBottom: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.45 }}>Projects</span>
              <button
                className="btn"
                type="button"
                onClick={onNewProject}
                title="New project"
                style={{ fontSize: 11, padding: '2px 8px', minWidth: 0, opacity: 0.7 }}
              >
                + New
              </button>
            </div>
            <ProjectsPanel
              activeProjectId={activeProjectId}
              onSelectProject={handleSelectProject}
              onProjectAction={handleProjectPanelAction}
            />
          </div>

          {/* ── Threads / Chats ── */}
          <div style={{ padding: '8px 12px' }}>
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
                    ? 'rgba(255,255,255,0.12)'
                    : isHovered
                      ? 'rgba(255,255,255,0.06)'
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
                        minWidth: 0,
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
                          minWidth: 0,
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
                          flex: '0 0 auto',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: '4px 6px',
                          fontSize: 18,
                          lineHeight: 1,
                          color: '#e2e8f0',
                          opacity: 0.8,
                          minWidth: 28,
                          textAlign: 'center',
                        }}
                      >
                        …
                      </button>

                      {menuOpen && (
                        <div
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: '100%',
                            marginTop: 4,
                            padding: 6,
                            background: '#1e2733',
                            borderRadius: 8,
                            boxShadow:
                              '0 10px 25px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
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
                              color: '#e2e8f0',
                              fontSize: 13,
                              fontWeight: 500,
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
                              color: '#dc2626',
                              fontSize: 13,
                              fontWeight: 500,
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

        </div>{/* end sidebar-scroll */}

        {/* ── Sticky footer: user ── */}
        <div className="sidebar-sticky-footer">
          <SignedIn>
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
          </SignedIn>

          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn primary" type="button" style={{ width: '100%' }}>
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
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
