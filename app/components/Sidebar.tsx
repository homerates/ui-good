'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
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

type Anchor = { top: number; bottom: number; right: number; flipped: boolean };

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

  // Portal requires client-side only
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

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

  // Suppress unused-ref warnings (kept for future wiring)
  void onSearch; void onLibrary; void onSettings; void onLabSeed;
  void onAboutHomeRates; void onHowItWorks; void onKnowledgeTool;

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

  React.useEffect(() => {
    void loadChats(activeProjectId);
  }, [activeProjectId, loadChats, chatSaveCount]);

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

  // ===== Portal menu state =====
  // .sidebar has transform + overflow:hidden — menus must escape via portal.
  // Anchors are computed from getBoundingClientRect() at click time.

  const [menuOpenForId, setMenuOpenForId] = React.useState<string | null>(null);
  const [addToProjectChatId, setAddToProjectChatId] = React.useState<string | null>(null);
  const [chatMenuAnchor, setChatMenuAnchor] = React.useState<Anchor | null>(null);

  const [projectMenuOpenId, setProjectMenuOpenId] = React.useState<string | null>(null);
  const [projectMenuAnchor, setProjectMenuAnchor] = React.useState<Anchor | null>(null);

  const [hoverChatId, setHoverChatId] = React.useState<string | null>(null);

  const closeAll = React.useCallback(() => {
    setMenuOpenForId(null);
    setAddToProjectChatId(null);
    setChatMenuAnchor(null);
    setProjectMenuOpenId(null);
    setProjectMenuAnchor(null);
  }, []);

  const openChatMenu = React.useCallback((chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Flip upward if < 90px below trigger (2-item menu estimate)
    const flipped = (window.innerHeight - rect.bottom - 8) < 90;
    setChatMenuAnchor({
      top: rect.bottom + 6,
      bottom: window.innerHeight - rect.top + 6,
      right: window.innerWidth - rect.right,
      flipped,
    });
    setMenuOpenForId(chatId);
    setAddToProjectChatId(null);
    setProjectMenuOpenId(null);
    setProjectMenuAnchor(null);
  }, []);

  const openProjectMenu = React.useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Flip upward if < 90px below trigger (2-item menu estimate)
    const flipped = (window.innerHeight - rect.bottom - 8) < 90;
    setProjectMenuAnchor({
      top: rect.bottom + 6,
      bottom: window.innerHeight - rect.top + 6,
      right: window.innerWidth - rect.right,
      flipped,
    });
    setProjectMenuOpenId(projectId);
    setMenuOpenForId(null);
    setChatMenuAnchor(null);
    setAddToProjectChatId(null);
  }, []);

  // ===== Project CRUD =====
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
    closeAll();
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
  }, [closeAll, loadProjects]);

  const handleDeleteProject = React.useCallback(async (project: ProjectItem) => {
    closeAll();
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
        if (activeProjectId === project.id) setActiveProjectId(null);
      } else {
        window.alert(json?.error || 'Failed to delete project.');
      }
    } catch (e) {
      console.warn('[Sidebar] delete project error:', e);
    }
  }, [closeAll, activeProjectId]);

  // ===== Chat CRUD =====
  const handleDeleteChat = React.useCallback(async (chatId: string) => {
    closeAll();
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
  }, [closeAll, onHistoryAction]);

  const handleAssignProject = React.useCallback(async (chatId: string, projectId: string | null) => {
    closeAll();
    try {
      await fetch(`/api/v2/chats/${encodeURIComponent(chatId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      void loadChats(activeProjectId);
    } catch (e) {
      console.warn('[Sidebar] assign project error:', e);
    }
  }, [closeAll, loadChats, activeProjectId]);

  // ===== Shared dropdown styles =====
  const dropdownBase: React.CSSProperties = {
    position: 'fixed',
    padding: 6,
    background: '#1a2330',
    borderRadius: 10,
    boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
    zIndex: 9999,
    minWidth: 150,
    fontSize: 13,
  };

  const menuItemBase: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'transparent',
    padding: '7px 10px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    lineHeight: 1.3,
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

  // Active menu chat (for picker)
  const activeChatForPicker = addToProjectChatId
    ? chats.find(c => c.id === addToProjectChatId) ?? null
    : null;

  // Active project for menu
  const activeProjectForMenu = projectMenuOpenId
    ? projects.find(p => p.id === projectMenuOpenId) ?? null
    : null;

  const anyMenuOpen = !!(menuOpenForId || projectMenuOpenId);

  return (
    <aside id={id} className={`sidebar ${isOpen ? 'open' : 'closed'}`} aria-label="Sidebar">

      {/* ── Scrollable content ── */}
      <div className="sidebar-scroll">

        {/* Header */}
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
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Link
              href="/projects"
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.4, color: 'inherit', textDecoration: 'none' }}
              onClick={e => e.stopPropagation()}
            >
              Projects
            </Link>
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
            <div style={{ opacity: 0.4, fontSize: 11, padding: '2px 0 4px' }}>No projects yet.</div>
          )}

          {projects.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {projects.map(project => {
                const isActive = project.id === activeProjectId;
                return (
                  <li key={project.id}>
                    <div style={{ display: 'flex', alignItems: 'center', borderRadius: 7, background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
                      <button
                        type="button"
                        onClick={() => handleSelectProject(project)}
                        title={project.name}
                        style={{
                          flex: 1, textAlign: 'left', border: 'none',
                          padding: '6px 6px 6px 8px', background: 'transparent',
                          cursor: 'pointer', fontSize: 12,
                          fontWeight: isActive ? 600 : 400,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          borderRadius: 7,
                        }}
                      >
                        {truncateProjectName(project.name)}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => openProjectMenu(project.id, e)}
                        aria-label="Project options"
                        style={{
                          flexShrink: 0, border: 'none', background: 'transparent',
                          cursor: 'pointer', padding: '6px 8px 6px 4px',
                          fontSize: 16, lineHeight: 1, opacity: 0.55,
                        }}
                      >
                        …
                      </button>
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
              style={{ marginTop: 8, fontSize: 10, opacity: 0.5, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              ← All chats
            </button>
          )}
        </div>

        {/* ── Chats ── */}
        <div style={{ padding: '10px 12px 12px' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', opacity: 0.4, fontWeight: 700, marginBottom: 8 }}>
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

                const rowBg = isActive
                  ? 'rgba(255,255,255,0.10)'
                  : isHovered ? 'rgba(255,255,255,0.05)' : 'transparent';

                return (
                  <div
                    key={chat.id}
                    style={{ display: 'flex', alignItems: 'center', marginBottom: 2, borderRadius: 7, background: rowBg, transition: 'background 0.1s ease-out' }}
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
                        flex: 1, minWidth: 0, border: 'none', background: 'transparent',
                        padding: '6px 4px 6px 8px', borderRadius: 7, fontSize: 12, fontWeight: 400,
                        textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {label}
                    </button>

                    <button
                      type="button"
                      aria-label="Chat options"
                      title="Chat options"
                      onClick={(e) => openChatMenu(chat.id, e)}
                      style={{
                        flexShrink: 0, border: 'none', background: 'transparent',
                        cursor: 'pointer', padding: '6px 8px 6px 4px',
                        fontSize: 16, lineHeight: 1, opacity: 0.55,
                      }}
                    >
                      …
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ opacity: 0.5, fontSize: 12, padding: '2px 0' }}>No chats yet</div>
          )}
        </div>

      </div>{/* end sidebar-scroll */}

      {/* ── Sticky footer ── */}
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

      {/* ── Portaled menus — rendered into document.body to escape sidebar transform + overflow ── */}
      {mounted && anyMenuOpen && createPortal(
        <>
          {/* Transparent backdrop: click outside closes everything */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onMouseDown={() => closeAll()}
          />

          {/* Chat 3-dot menu */}
          {menuOpenForId && !addToProjectChatId && chatMenuAnchor && (
            <div
              style={{
                ...dropdownBase,
                right: chatMenuAnchor.right,
                ...(chatMenuAnchor.flipped
                  ? { bottom: chatMenuAnchor.bottom }
                  : { top: chatMenuAnchor.top }),
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <button
                type="button"
                style={{ ...menuItemBase, color: '#e2e8f0' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onClick={() => {
                  // Re-check flip for picker — taller than the 2-item chat menu
                  const pickerH = 84 + projects.length * 34;
                  const triggerBottom = chatMenuAnchor.top - 6;
                  const pickerFlipped = (window.innerHeight - triggerBottom - 8) < pickerH;
                  if (pickerFlipped !== chatMenuAnchor.flipped) {
                    setChatMenuAnchor(prev => prev ? { ...prev, flipped: pickerFlipped } : null);
                  }
                  setAddToProjectChatId(menuOpenForId);
                }}
              >
                Add to project
              </button>
              <button
                type="button"
                style={{ ...menuItemBase, color: '#f87171' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onClick={() => void handleDeleteChat(menuOpenForId)}
              >
                Delete
              </button>
            </div>
          )}

          {/* Project picker (replaces chat menu) */}
          {addToProjectChatId && chatMenuAnchor && (
            <div
              style={{
                ...dropdownBase,
                right: chatMenuAnchor.right,
                minWidth: 170,
                ...(chatMenuAnchor.flipped
                  ? { bottom: chatMenuAnchor.bottom }
                  : { top: chatMenuAnchor.top }),
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div style={{ fontSize: 10, opacity: 0.45, padding: '4px 10px 6px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
                Move to project
              </div>
              <button
                type="button"
                style={{ ...menuItemBase, color: '#94a3b8' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onClick={() => void handleAssignProject(addToProjectChatId, null)}
              >
                None (unassign)
              </button>
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  style={{
                    ...menuItemBase,
                    color: '#e2e8f0',
                    background: activeChatForPicker?.project_id === p.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background =
                      activeChatForPicker?.project_id === p.id ? 'rgba(255,255,255,0.07)' : 'transparent';
                  }}
                  onClick={() => void handleAssignProject(addToProjectChatId, p.id)}
                >
                  {p.name}
                </button>
              ))}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
              <button
                type="button"
                style={{ ...menuItemBase, color: '#64748b', fontSize: 12 }}
                onClick={closeAll}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Project 3-dot menu */}
          {projectMenuOpenId && projectMenuAnchor && activeProjectForMenu && (
            <div
              style={{
                ...dropdownBase,
                right: projectMenuAnchor.right,
                ...(projectMenuAnchor.flipped
                  ? { bottom: projectMenuAnchor.bottom }
                  : { top: projectMenuAnchor.top }),
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <button
                type="button"
                style={{ ...menuItemBase, color: '#e2e8f0' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onClick={() => void handleRenameProject(activeProjectForMenu)}
              >
                Rename
              </button>
              <button
                type="button"
                style={{ ...menuItemBase, color: '#f87171' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onClick={() => void handleDeleteProject(activeProjectForMenu)}
              >
                Delete
              </button>
            </div>
          )}
        </>,
        document.body
      )}

    </aside>
  );
}
