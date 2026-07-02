'use client';

import * as React from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import AppShell from '../components/AppShell';
import { useConsumerMode } from '@/useConsumerMode';
import type { NavMode } from '@/nav-config';

// ── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  name: string;
  description: string | null;
  chat_count: number;
  updated_at: string;
};

type SortKey = 'updated' | 'name';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const isConsumer = useConsumerMode();
  const mode: NavMode = isConsumer ? 'consumer' : 'pro';

  const [projects, setProjects]     = React.useState<Project[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [sort, setSort]             = React.useState<SortKey>('updated');
  const [query, setQuery]           = React.useState('');

  // New project modal
  const [showNew, setShowNew]       = React.useState(false);
  const [newName, setNewName]       = React.useState('');
  const [newDesc, setNewDesc]       = React.useState('');
  const [newError, setNewError]     = React.useState('');
  const [creating, setCreating]     = React.useState(false);

  // Per-card state
  const [menuId, setMenuId]         = React.useState<string | null>(null);
  const [renameId, setRenameId]     = React.useState<string | null>(null);
  const [renameName, setRenameName] = React.useState('');

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.replace('/sign-in'); return; }
    void loadProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/projects', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  const displayed = React.useMemo(() => {
    let list = [...projects];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
      );
    }
    list.sort(
      sort === 'name'
        ? (a, b) => a.name.localeCompare(b.name)
        : (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    return list;
  }, [projects, sort, query]);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setNewError('');
    try {
      const res = await fetch('/api/v2/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) { setNewError(json?.error ?? 'A project with that name already exists.'); return; }
      if (!res.ok)            { setNewError(json?.error ?? 'Failed to create project.'); return; }
      setShowNew(false);
      setNewName('');
      setNewDesc('');
      await loadProjects();
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(project: Project) {
    const name = renameName.trim();
    if (!name || name === project.name) { setRenameId(null); return; }
    try {
      const res = await fetch(`/api/v2/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        window.alert(json?.error ?? 'Failed to rename project.');
        return;
      }
      setRenameId(null);
      await loadProjects();
    } catch { setRenameId(null); }
  }

  async function handleDelete(project: Project) {
    setMenuId(null);
    if (!window.confirm(`Delete project "${project.name}"?`)) return;
    try {
      const res = await fetch(`/api/v2/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        window.alert(json?.error ?? 'Cannot delete: this project has chats attached. Move or delete the chats first.');
        return;
      }
      if (!res.ok) { window.alert(json?.error ?? 'Failed to delete project.'); return; }
      setProjects(prev => prev.filter(p => p.id !== project.id));
    } catch {}
  }

  function openMenu(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setMenuId(prev => (prev === id ? null : id));
    setRenameId(null);
  }

  function startRename(project: Project) {
    setMenuId(null);
    setRenameId(project.id);
    setRenameName(project.name);
  }

  function closeModal() {
    setShowNew(false);
    setNewName('');
    setNewDesc('');
    setNewError('');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isLoaded || !isSignedIn) {
    return (
      <AppShell mode={mode}>
        <div style={{ padding: '80px 24px', textAlign: 'center', opacity: 0.4 }}>Loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell mode={mode}>
      <div style={S.page} onClick={() => setMenuId(null)}>

        {/* ── Page header ── */}
        <div style={S.pageHeader}>
          <div style={S.titleRow}>
            <h1 style={S.title}>Projects</h1>
            <div style={S.headerRight}>
              <div style={S.sortRow}>
                <span style={S.sortLabel}>Sort:</span>
                <button
                  type="button"
                  style={{ ...S.sortBtn, ...(sort === 'updated' ? S.sortBtnOn : {}) }}
                  onClick={() => setSort('updated')}
                >
                  Last updated
                </button>
                <button
                  type="button"
                  style={{ ...S.sortBtn, ...(sort === 'name' ? S.sortBtnOn : {}) }}
                  onClick={() => setSort('name')}
                >
                  Name
                </button>
              </div>
              <button type="button" style={S.newBtn} onClick={() => setShowNew(true)}>
                + New project
              </button>
            </div>
          </div>

          <input
            type="search"
            placeholder="Search projects…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={S.search}
          />
        </div>

        {/* ── Grid ── */}
        {loading ? (
          <div style={S.empty}>Loading…</div>
        ) : displayed.length === 0 ? (
          <div style={S.empty}>
            {query ? 'No projects match your search.' : 'No projects yet — create one to get started.'}
          </div>
        ) : (
          <div style={S.grid}>
            {displayed.map(project => (
              <div
                key={project.id}
                style={S.card}
                onClick={() => router.push('/chat')}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') router.push('/chat'); }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,232,122,0.22)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
              >
                {/* Card header */}
                <div style={S.cardHead}>
                  {renameId === project.id ? (
                    <input
                      autoFocus
                      value={renameName}
                      onChange={e => setRenameName(e.target.value)}
                      onBlur={() => void handleRename(project)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void handleRename(project);
                        if (e.key === 'Escape') setRenameId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      style={S.renameInput}
                    />
                  ) : (
                    <span style={S.cardName}>{project.name}</span>
                  )}

                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      type="button"
                      style={S.dotBtn}
                      onClick={e => openMenu(e, project.id)}
                      aria-label="Project options"
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#e0f0e8'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(185,208,192,0.5)'; }}
                    >
                      ···
                    </button>
                    {menuId === project.id && (
                      <div style={S.dropdown} onMouseDown={e => e.stopPropagation()}>
                        <button
                          type="button"
                          style={S.dropItem}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          onClick={e => { e.stopPropagation(); startRename(project); }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          style={{ ...S.dropItem, color: '#f87171' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.07)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          onClick={e => { e.stopPropagation(); void handleDelete(project); }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {project.description && (
                  <p style={S.cardDesc}>{project.description}</p>
                )}

                <div style={S.cardFoot}>
                  <span style={S.chatCount}>
                    {project.chat_count} {project.chat_count === 1 ? 'chat' : 'chats'}
                  </span>
                  <span style={S.updatedAt}>Updated {formatUpdated(project.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ── New project modal ── */}
      {showNew && (
        <div style={S.backdrop} onClick={closeModal}>
          <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New project">
            <h2 style={S.modalTitle}>New project</h2>

            <label style={S.label}>
              Name <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              autoFocus
              type="text"
              placeholder="Project name"
              value={newName}
              onChange={e => { setNewName(e.target.value); setNewError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') closeModal(); }}
              style={S.modalInput}
            />

            <label style={{ ...S.label, marginTop: 14 }}>Description</label>
            <textarea
              placeholder="Optional description"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              rows={3}
              style={{ ...S.modalInput, resize: 'vertical', height: 'auto' }}
            />

            {newError && <div style={S.errorBox}>{newError}</div>}

            <div style={S.modalActions}>
              <button type="button" style={S.cancelBtn} onClick={closeModal}>Cancel</button>
              <button
                type="button"
                style={{ ...S.primaryBtn, opacity: creating || !newName.trim() ? 0.45 : 1 }}
                disabled={creating || !newName.trim()}
                onClick={() => void handleCreate()}
              >
                {creating ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Design tokens (aligned with AppShell) ────────────────────────────────────
// Background:   #080c12 (ash-root)
// Surface:      #0d1117 (ash-drawer / cards)
// Border:       rgba(255,255,255,0.07)  (ash-drawer border-left)
// Text primary: #e0f0e8
// Text muted:   rgba(185,208,192,0.8)
// Accent green: #00e87a
// Danger:       #f87171

const S: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '36px 28px 80px',
  },
  pageHeader: {
    marginBottom: 28,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: '#e0f0e8',
    flex: 1,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  sortRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sortLabel: {
    fontSize: 12,
    color: 'rgba(185,208,192,0.5)',
    fontWeight: 500,
  },
  sortBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 7,
    color: 'rgba(185,208,192,0.6)',
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.13s',
  },
  sortBtnOn: {
    background: 'rgba(0,232,122,0.08)',
    borderColor: 'rgba(0,232,122,0.3)',
    color: '#00e87a',
  },
  newBtn: {
    background: '#00e87a',
    border: 'none',
    borderRadius: 8,
    color: '#080c12',
    fontSize: 13,
    fontWeight: 700,
    padding: '9px 18px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    letterSpacing: '0.01em',
  },
  search: {
    width: '100%',
    maxWidth: 380,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#e0f0e8',
    fontSize: 14,
    padding: '9px 14px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  empty: {
    padding: '72px 0',
    textAlign: 'center',
    color: 'rgba(185,208,192,0.4)',
    fontSize: 15,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: '18px 18px 14px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    position: 'relative',
    userSelect: 'none',
    transition: 'border-color 0.15s',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    fontWeight: 700,
    fontSize: 15,
    color: '#e0f0e8',
    flex: 1,
    lineHeight: 1.35,
  },
  renameInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(0,232,122,0.3)',
    borderRadius: 6,
    color: '#e0f0e8',
    fontSize: 15,
    fontWeight: 700,
    padding: '3px 8px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  dotBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(185,208,192,0.5)',
    cursor: 'pointer',
    padding: '2px 8px',
    fontSize: 14,
    lineHeight: 1,
    borderRadius: 6,
    fontFamily: 'inherit',
    letterSpacing: '0.08em',
    transition: 'color 0.13s',
  },
  dropdown: {
    position: 'absolute',
    top: 28,
    right: 0,
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 10,
    boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
    zIndex: 50,
    minWidth: 140,
    padding: 6,
  },
  dropItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    color: 'rgba(185,208,192,0.9)',
    fontSize: 13,
    fontWeight: 500,
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: 7,
    fontFamily: 'inherit',
    transition: 'background 0.1s',
  },
  cardDesc: {
    margin: 0,
    fontSize: 13,
    color: 'rgba(185,208,192,0.6)',
    lineHeight: 1.55,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardFoot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  chatCount: {
    fontSize: 11,
    color: 'rgba(185,208,192,0.35)',
    fontWeight: 500,
  },
  updatedAt: {
    fontSize: 11,
    color: 'rgba(185,208,192,0.35)',
  },
  // Modal
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 24,
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  },
  modal: {
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 14,
    padding: '28px 28px 24px',
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
  },
  modalTitle: {
    margin: '0 0 20px',
    fontSize: 18,
    fontWeight: 700,
    color: '#e0f0e8',
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(185,208,192,0.55)',
    marginBottom: 7,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  modalInput: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 8,
    color: '#e0f0e8',
    fontSize: 14,
    padding: '10px 14px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  errorBox: {
    marginTop: 12,
    fontSize: 13,
    color: '#f87171',
    background: 'rgba(248,113,113,0.07)',
    border: '1px solid rgba(248,113,113,0.15)',
    borderRadius: 7,
    padding: '9px 13px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 22,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 8,
    color: 'rgba(185,208,192,0.7)',
    fontSize: 14,
    fontWeight: 500,
    padding: '9px 18px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    background: '#00e87a',
    border: 'none',
    borderRadius: 8,
    color: '#080c12',
    fontSize: 14,
    fontWeight: 700,
    padding: '9px 20px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
};
