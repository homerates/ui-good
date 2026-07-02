'use client';

import * as React from 'react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/nextjs';

import { NAV_ITEMS } from '@/nav-config';

// ===== Types =====

export type HistoryItem = {
  id: string;
  title: string;
  updatedAt?: number;
};

export type KnowledgeToolId = 'mortgage-solutions' | 'ask-underwriting';

type ChatItem = {
  id: string;
  title: string | null;
  project_id: string | null;
  updated_at: string;
};

type ProjectItem = {
  id: string;
  name: string;
  chat_count: number;
};

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
  onShare: () => void;
  onSearch: () => void;
  onLibrary: () => void;
  onNewProject: () => void;
  onLabSeed?: (seed: string) => void;
  onAskUnderwriting?: () => void;
  onAboutHomeRates?: () => void;
  onHowItWorks?: () => void;
  onKnowledgeTool?: (tool: KnowledgeToolId) => void;
  onPriceCheck?: () => void;
  // kept for prop parity — Sidebar now handles project actions internally
  onProjectAction?: (action: 'rename' | 'delete', project: any) => void | Promise<void>;
  onMoveChatToProject?: (threadId: string, projectId: string) => void | Promise<void>;
  chatSaveCount?: number;
};

// ===== Helpers =====

function truncateChatTitle(raw: string): string {
  const title = (raw || '').trim();
  if (!title) return 'New chat';
  const words = title.split(/\s+/);
  if (words.length <= 3) return title;
  return words.slice(0, 3).join(' ') + '…';
}

function truncateProjectName(raw: string): string {
  const name = (raw || '').trim();
  if (!name) return '(untitled project)';
  const words = name.split(/\s+/);
  if (words.length <= 3) return name;
  return words.slice(0, 3).join(' ') + '…';
}

// ===== Component =====

export default function Sidebar(props: SidebarProps) {
  const {
    id,
    history,
    activeId,
    isOpen,
    onToggle,
    onSelectHistory: rawOnSelectHistory,
    onHistoryAction,
    onNewChat: rawOnNewChat,
    onSettings: rawOnSettings,
    onSearch: rawOnSearch,
    onLibrary: rawOnLibrary,
    onAskUnderwriting: rawOnAskUnderwriting,
    onAboutHomeRates: rawOnAboutHomeRates,
    onHowItWorks: rawOnHowItWorks,
    onKnowledgeTool: rawOnKnowledgeTool,
    onPriceCheck: rawOnPriceCheck,
    chatSaveCount,
  } = props;

  // ===== Mobile auto-close =====
  const isMobile = () =>
    typeof window !== 'undefined' && window.innerWidth < 1024;

  const autoWrap = React.useCallback(
    (fn?: (...args: any[]) => void) =>
      (...args: any[]) => {
        if (isMobile()) onToggle();
        fn?.(...args);
      },
    [onToggle]
  );

  const onNewChat = autoWrap(rawOnNewChat);
  const onSearch = autoWrap(rawOnSearch);
  const onLibrary = autoWrap(rawOnLibrary);
  const onSettings = autoWrap(rawOnSettings);
  const onLabSeed = props.onLabSeed
    ? (seed: string) => { if (isMobile()) onToggle(); props.onLabSeed!(seed); }
    : undefined;
  const onPriceCheck = rawOnPriceCheck ? autoWrap(rawOnPriceCheck) : undefined;
  const onAboutHomeRates = rawOnAboutHomeRates ? autoWrap(rawOnAboutHomeRates) : undefined;
  const onHowItWorks = rawOnHowItWorks ? autoWrap(rawOnHowItWorks) : undefined;
  const onKnowledgeTool = rawOnKnowledgeTool;

  const onSelectHistory = React.useCallback(
    (chatId: string) => {
      if (isMobile()) onToggle();
      rawOnSelectHistory(chatId);
    },
    [rawOnSelectHistory, onToggle]
  );

  const handleAskUnderwritingClick = React.useCallback(() => {
    if (isMobile()) onToggle();
    if (rawOnAskUnderwriting) rawOnAskUnderwriting();
    else if (onKnowledgeTool) onKnowledgeTool('ask-underwriting');
  }, [rawOnAskUnderwriting, onKnowledgeTool, onToggle]);

  const handleKnowledgeClick = React.useCallback(
    (tool: KnowledgeToolId) => {
      if (isMobile()) onToggle();
      if (onKnowledgeTool) onKnowledgeTool(tool);
    },
    [onKnowledgeTool, onToggle]
  );

  // ===== v2 API state =====
  const [chats, setChats] = React.useState<ChatItem[]>([]);
  const [projects, setProjects] = React.useState<ProjectItem[]>([]);
  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(null);

  const loadChats = React.useCallback(async (projectId?: string | null) => {
    try {
      const url = projectId
        ? `/api/v2/chats?project_id=${encodeURIComponent(projectId)}`
        : '/api/v2/chats';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats ?? []);
      }
    } catch (e) {
      console.warn('[Sidebar] loadChats error:', e);
    }
  }, []);

  const loadProjects = React.useCallback(async () => {
    try {
      const res = await fetch('/api/v2/projects', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects ?? []);
      }
    } catch (e) {
      console.warn('[Sidebar] loadProjects error:', e);
    }
  }, []);

  // Load / reload when filter changes or a new chat is saved
  React.useEffect(() => {
    void loadChats(activeProjectId);
  }, [activeProjectId, loadChats, chatSaveCount]);

  // Load projects once on mount
  React.useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // ===== Project selection =====
  const handleSelectProject = React.useCallback(
    (project: ProjectItem) => {
      if (isMobile()) onToggle();
      setActiveProjectId(prev => prev === project.id ? null : project.id);
    },
    [onToggle]
  );

  // ===== Project CRUD =====
  const [projectMenuOpenId, setProjectMenuOpenId] = React.useState<string | null>(null);

  const handleNewProject = React.useCallback(async () => {
    const raw = window.prompt('New project name:');
    const name = raw?.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/v2/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        window.alert(json?.error || 'A project with that name already exists.');
        return;
      }
      if (res.ok) {
        void loadProjects();
      } else {
        window.alert(json?.error || 'Failed to create project.');
      }
    } catch (e) {
      console.warn('[Sidebar] new project error:', e);
    }
  }, [loadProjects]);

  const handleRenameProject = React.useCallback(async (project: ProjectItem) => {
    setProjectMenuOpenId(null);
    const raw = window.prompt('Rename project:', project.name || '');
    const newName = raw?.trim();
    if (!newName || newName === project.name) return;
    try {
      const res = await fetch(`/api/v2/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        void loadProjects();
      } else {
        const json = await res.json().catch(() => ({}));
        window.alert(json?.error || 'Failed to rename project.');
      }
    } catch (e) {
      console.warn('[Sidebar] rename project error:', e);
    }
  }, [loadProjects]);

  const handleDeleteProject = React.useCallback(async (project: ProjectItem) => {
    setProjectMenuOpenId(null);
    const confirmed = window.confirm(`Delete project "${project.name}"?`);
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/v2/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        window.alert(json?.error || 'Cannot delete this project.');
        return;
      }
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== project.id));
        if (activeProjectId === project.id) {
          setActiveProjectId(null);
        }
      } else {
        window.alert(json?.error || 'Failed to delete project.');
      }
    } catch (e) {
      console.warn('[Sidebar] delete project error:', e);
    }
  }, [activeProjectId]);

  // ===== Chat CRUD =====
  const [hoverChatId, setHoverChatId] = React.useState<string | null>(null);
  const [menuOpenForId, setMenuOpenForId] = React.useState<string | null>(null);
  const [addToProjectChatId, setAddToProjectChatId] = React.useState<string | null>(null);

  const closeMenu = React.useCallback(() => {
    setMenuOpenForId(null);
    setAddToProjectChatId(null);
  }, []);

  const handleDeleteChat = React.useCallback(async (chatId: string) => {
    closeMenu();
    try {
      const res = await fetch(`/api/v2/chats/${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setChats(prev => prev.filter(c => c.id !== chatId));
        void onHistoryAction('delete', chatId);
      }
    } catch (e) {
      console.warn('[Sidebar] delete chat error:', e);
    }
  }, [closeMenu, onHistoryAction]);

  const handleAssignProject = React.useCallback(async (chatId: string, projectId: string | null) => {
    try {
      await fetch(`/api/v2/chats/${encodeURIComponent(chatId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      closeMenu();
      void loadChats(activeProjectId);
    } catch (e) {
      console.warn('[Sidebar] assign project error:', e);
    }
  }, [closeMenu, loadChats, activeProjectId]);

  // ===== Render =====

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

  const menuItemStyle: React.CSSProperties = {
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'transparent',
    padding: '4px 6px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: 4,
    padding: 6,
    background: '#1e2733',
    borderRadius: 8,
    boxShadow: '0 10px 25px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
    zIndex: 50,
  };

  return (
    <aside id={id} className={`sidebar ${isOpen ? 'open' : 'closed'}`} aria-label="Sidebar">

      {/* ── Scrollable content ── */}
      <div className="sidebar-scroll">

        {/* Header: hamburger only */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '12px 14px 10px 14px' }}>
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

        {/* ── New chat ── */}
        <div className="sidebar-section">
          <button className="btn primary" onClick={onNewChat} type="button">
            + New chat
          </button>
        </div>

        {/* ── Nav sections (nav-config driven) ── */}
        {(['decide', 'tools', 'mine', 'learn'] as const).map((g) => {
          const groupItems = NAV_ITEMS.filter(i =>
            i.modes.includes('pro') &&
            i.surfaces.includes('chatPanel') &&
            !i.footer &&
            i.group === g &&
            i.id !== 'chat'
          );
          const showPropertyLookup = g === 'decide' && !!onPriceCheck;
          if (!groupItems.length && !showPropertyLookup) return null;

          const GROUP_LABEL: Record<string, string> = {
            decide: 'Decide', tools: 'Tools', mine: 'Mine', learn: 'Learn',
          };

          return (
            <div key={g} className="sidebar-section">
              <div className="sidebar-section-label">{GROUP_LABEL[g]}</div>
              {groupItems.map(item => {
                const label = item.labelByMode?.['pro'] ?? item.label;
                return (
                  <a key={item.id} href={item.href} className="btn sidebar-tool-btn" style={{ textDecoration: 'none' }}>
                    <span className="sidebar-tool-icon">{item.icon}</span>
                    {label}
                    {item.proBadge && <span style={proBadgeStyle}>⭐ Pro</span>}
                  </a>
                );
              })}
              {showPropertyLookup && (
                <button className="btn sidebar-tool-btn" type="button" onClick={onPriceCheck}>
                  <span className="sidebar-tool-icon">🔎</span>
                  Property Lookup
                </button>
              )}
            </div>
          );
        })}

        {/* ── Projects ── */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.45 }}>
              Projects
            </span>
            <button
              className="btn"
              type="button"
              onClick={() => { if (isMobile()) onToggle(); void handleNewProject(); }}
              title="New project"
              style={{ fontSize: 11, padding: '2px 8px', minWidth: 0, opacity: 0.7 }}
            >
              + New
            </button>
          </div>

          {projects.length === 0 && (
            <div style={{ opacity: 0.5, fontSize: 11 }}>No projects yet.</div>
          )}

          {projects.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {projects.map(project => {
                const isActive = project.id === activeProjectId;
                const pmOpen = projectMenuOpenId === project.id;
                return (
                  <li key={project.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => handleSelectProject(project)}
                        title={project.name}
                        style={{
                          flex: 1, textAlign: 'left', borderRadius: 6, border: 'none',
                          padding: '3px 4px',
                          background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                          cursor: 'pointer', fontSize: 11,
                          fontWeight: isActive ? 600 : 400,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {truncateProjectName(project.name)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProjectMenuOpenId(prev => prev === project.id ? null : project.id)}
                        aria-label="Project options"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 4px', fontSize: 14, lineHeight: 1, opacity: 0.7, flex: '0 0 auto' }}
                      >
                        …
                      </button>
                      {pmOpen && (
                        <div style={{ ...dropdownStyle, minWidth: 130 }}>
                          <button type="button"
                            onClick={() => void handleRenameProject(project)}
                            style={{ ...menuItemStyle, color: '#e2e8f0' }}>
                            Rename
                          </button>
                          <button type="button"
                            onClick={() => void handleDeleteProject(project)}
                            style={{ ...menuItemStyle, color: '#dc2626' }}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {activeProjectId && (
            <button
              type="button"
              onClick={() => setActiveProjectId(null)}
              style={{ marginTop: 6, fontSize: 10, opacity: 0.55, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              Show all chats
            </button>
          )}
        </div>

        {/* ── Chats ── */}
        <div style={{ padding: '8px 12px' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.7, marginBottom: 6 }}>
            {activeProjectId
              ? (projects.find(p => p.id === activeProjectId)?.name ?? 'Project')
              : 'Recents'}
          </div>

          {chats.length > 0 ? (
            <div className="chat-list" role="list" aria-label="Chats">
              {chats.map((chat) => {
                const isActive = chat.id === activeId;
                const label = truncateChatTitle(chat.title ?? '');
                const isHovered = hoverChatId === chat.id;
                const menuOpen = menuOpenForId === chat.id;
                const showingPicker = addToProjectChatId === chat.id;

                const background = isActive
                  ? 'rgba(255,255,255,0.12)'
                  : isHovered ? 'rgba(255,255,255,0.06)' : 'transparent';

                return (
                  <div
                    key={chat.id}
                    style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, position: 'relative', minWidth: 0 }}
                    onMouseEnter={() => setHoverChatId(chat.id)}
                    onMouseLeave={() => setHoverChatId(prev => prev === chat.id ? null : prev)}
                  >
                    <button
                      role="listitem"
                      onClick={() => onSelectHistory(chat.id)}
                      aria-current={isActive ? 'true' : 'false'}
                      title={chat.title ?? ''}
                      type="button"
                      style={{
                        flex: 1, minWidth: 0, border: 'none', background,
                        padding: '2px 4px', borderRadius: 6, fontSize: 11, fontWeight: 400,
                        textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        transition: 'background 0.12s ease-out',
                      }}
                    >
                      {label}
                    </button>

                    <button
                      type="button"
                      aria-label="Chat options"
                      title="Chat options"
                      onClick={() => setMenuOpenForId(prev => prev === chat.id ? null : chat.id)}
                      style={{
                        flex: '0 0 auto', border: 'none', background: 'transparent',
                        cursor: 'pointer', padding: '4px 6px', fontSize: 18, lineHeight: 1,
                        color: '#e2e8f0', opacity: 0.8, minWidth: 28, textAlign: 'center',
                      }}
                    >
                      …
                    </button>

                    {/* 3-dot menu */}
                    {menuOpen && !showingPicker && (
                      <div style={{ ...dropdownStyle, minWidth: 140, fontSize: 12 }}>
                        <button type="button"
                          onClick={() => setAddToProjectChatId(chat.id)}
                          style={{ ...menuItemStyle, color: '#e2e8f0' }}>
                          Add to project
                        </button>
                        <button type="button"
                          onClick={() => void handleDeleteChat(chat.id)}
                          style={{ ...menuItemStyle, color: '#dc2626' }}>
                          Delete
                        </button>
                      </div>
                    )}

                    {/* Inline project picker */}
                    {showingPicker && (
                      <div style={{ ...dropdownStyle, minWidth: 160, zIndex: 51, fontSize: 12 }}>
                        <div style={{ fontSize: 10, opacity: 0.5, padding: '2px 6px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Move to project
                        </div>
                        <button type="button"
                          onClick={() => void handleAssignProject(chat.id, null)}
                          style={{ ...menuItemStyle, color: '#94a3b8' }}>
                          None (unassign)
                        </button>
                        {projects.map(p => (
                          <button key={p.id} type="button"
                            onClick={() => void handleAssignProject(chat.id, p.id)}
                            style={{
                              ...menuItemStyle,
                              color: '#e2e8f0',
                              background: chat.project_id === p.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                            }}>
                            {p.name}
                          </button>
                        ))}
                        <button type="button"
                          onClick={closeMenu}
                          style={{ ...menuItemStyle, color: '#64748b', fontSize: 11, marginTop: 2 }}>
                          Cancel
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
            appearance={{ elements: { userButtonOuterIdentifier: { fontWeight: 600 } } }}
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
  );
}
