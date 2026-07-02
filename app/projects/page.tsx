'use client';

import * as React from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

type Project = {
  id: string;
  name: string;
  description: string | null;
  chat_count: number;
  updated_at: string;
};

type SortKey = 'updated' | 'name';

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ProjectsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  const [projects, setProjects]   = React.useState<Project[]>([]);
  const [loading, setLoading]     = React.useState(true);
  const [sort, setSort]           = React.useState<SortKey>('updated');
  const [query, setQuery]         = React.useState('');

  // New project modal
  const [showNew, setShowNew]     = React.useState(false);
  const [newName, setNewName]     = React.useState('');
  const [newDesc, setNewDesc]     = React.useState('');
  const [newError, setNewError]   = React.useState('');
  const [creating, setCreating]   = React.useState(false);

  // Per-card state
  const [menuId, setMenuId]       = React.useState<string | null>(null);
  const [renameId, setRenameId]   = React.useState<string | null>(null);
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
    if (sort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    return list;
  }, [projects, sort, query]);

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
      if (res.status === 409) {
        setNewError(json?.error ?? 'A project with that name already exists.');
        return;
      }
      if (!res.ok) {
        setNewError(json?.error ?? 'Failed to create project.');
        return;
      }
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json?.error ?? 'Failed to rename project.');
        return;
      }
      setRenameId(null);
      await loadProjects();
    } catch {
      setRenameId(null);
    }
  }

  async function handleDelete(project: Project) {
    setMenuId(null);
    if (!window.confirm(`Delete project "${project.name}"?`)) return;
    try {
      const res = await fetch(`/api/v2/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        window.alert(
          json?.error ??
            'Cannot delete: this project has chats attached. Move or delete the chats first.'
        );
        return;
      }
      if (!res.ok) {
        window.alert(json?.error ?? 'Failed to delete project.');
        return;
      }
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

  if (!isLoaded || loading) {
    return (
      <div style={S.root}>
        <div style={{ padding: '80px 24px', textAlign: 'center', opacity: 0.4 }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div style={S.root} onClick={() => setMenuId(null)}>

      {/* ── Top bar ── */}
      <div style={S.topBar}>
        <button
          style={S.backBtn}
          onClick={() => router.push('/chat')}
          type="button"
        >
          ← Chat
        </button>
        <h1 style={S.pageTitle}>Projects</h1>
        <div style={{ flex: 1 }} />
        <div style={S.sortControl}>
          <span style={{ opacity: 0.5, fontSize: 12 }}>Sort by:</span>
          <button
            type="button"
            style={{ ...S.sortBtn, ...(sort === 'updated' ? S.sortBtnActive : {}) }}
            onClick={() => setSort('updated')}
          >
            Last updated
          </button>
          <button
            type="button"
            style={{ ...S.sortBtn, ...(sort === 'name' ? S.sortBtnActive : {}) }}
            onClick={() => setSort('name')}
          >
            Name
          </button>
        </div>
        <button
          type="button"
          style={S.newBtn}
          onClick={() => setShowNew(true)}
        >
          + New project
        </button>
      </div>

      {/* ── Search ── */}
      <div style={S.searchRow}>
        <input
          type="search"
          placeholder="Search projects…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={S.searchInput}
        />
      </div>

      {/* ── Grid ── */}
      {displayed.length === 0 ? (
        <div style={S.emptyState}>
          {query ? 'No projects match your search.' : 'No projects yet. Create one to get started.'}
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
            >
              {/* Card header */}
              <div style={S.cardHeader}>
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

                {/* 3-dot menu */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    type="button"
                    style={S.dotBtn}
                    onClick={e => openMenu(e, project.id)}
                    aria-label="Project options"
                  >
                    …
                  </button>
                  {menuId === project.id && (
                    <div style={S.dropdown} onMouseDown={e => e.stopPropagation()}>
                      <button
                        type="button"
                        style={S.dropItem}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        onClick={e => { e.stopPropagation(); startRename(project); }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        style={{ ...S.dropItem, color: '#f87171' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        onClick={e => { e.stopPropagation(); void handleDelete(project); }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {project.description && (
                <p style={S.cardDesc}>{project.description}</p>
              )}

              {/* Footer */}
              <div style={S.cardFooter}>
                <span style={S.chatCount}>
                  {project.chat_count} {project.chat_count === 1 ? 'chat' : 'chats'}
                </span>
                <span style={S.updatedAt}>
                  Updated {formatUpdated(project.updated_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── New project modal ── */}
      {showNew && (
        <div style={S.modalBackdrop} onClick={closeModal}>
          <div
            style={S.modal}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="New project"
          >
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

            <label style={{ ...S.label, marginTop: 12 }}>Description</label>
            <textarea
              placeholder="Optional description"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              rows={3}
              style={{ ...S.modalInput, resize: 'vertical', height: 'auto' }}
            />

            {newError && (
              <div style={S.errorMsg}>{newError}</div>
            )}

            <div style={S.modalActions}>
              <button type="button" style={S.cancelBtn} onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                style={{ ...S.createBtn, opacity: creating || !newName.trim() ? 0.5 : 1 }}
                disabled={creating || !newName.trim()}
                onClick={() => void handleCreate()}
              >
                {creating ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#080c12',
    color: '#e2e8f0',
    fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
    padding: '0 0 80px',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '20px 28px 0',
    flexWrap: 'wrap',
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    fontSize: 13,
    cursor: 'pointer',
    padding: '4px 0',
    fontFamily: 'inherit',
  },
  pageTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  sortControl: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sortBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: '#94a3b8',
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.1s',
  },
  sortBtnActive: {
    background: 'rgba(255,255,255,0.09)',
    borderColor: 'rgba(255,255,255,0.22)',
    color: '#e2e8f0',
  },
  newBtn: {
    background: '#1d9a6c',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 16px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  searchRow: {
    padding: '16px 28px 0',
  },
  searchInput: {
    width: '100%',
    maxWidth: 400,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    padding: '9px 14px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  emptyState: {
    padding: '64px 28px',
    textAlign: 'center',
    opacity: 0.4,
    fontSize: 15,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
    padding: '20px 28px 0',
  },
  card: {
    background: '#0f1923',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: '16px 16px 14px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    position: 'relative',
    userSelect: 'none',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    fontWeight: 700,
    fontSize: 15,
    color: '#e2e8f0',
    flex: 1,
    lineHeight: 1.3,
  },
  renameInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: 700,
    padding: '2px 8px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  dotBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: 18,
    lineHeight: 1,
    borderRadius: 6,
    fontFamily: 'inherit',
  },
  dropdown: {
    position: 'absolute',
    top: 28,
    right: 0,
    background: '#1a2330',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
    zIndex: 100,
    minWidth: 140,
    padding: 6,
  },
  dropItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 500,
    padding: '7px 10px',
    cursor: 'pointer',
    borderRadius: 6,
    fontFamily: 'inherit',
  },
  cardDesc: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  chatCount: {
    fontSize: 11,
    color: '#475569',
    fontWeight: 500,
  },
  updatedAt: {
    fontSize: 11,
    color: '#475569',
  },
  // Modal
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 24,
  },
  modal: {
    background: '#0f1923',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    padding: '28px 28px 24px',
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
  },
  modalTitle: {
    margin: '0 0 20px',
    fontSize: 18,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 6,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  modalInput: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    padding: '10px 14px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  errorMsg: {
    marginTop: 10,
    fontSize: 13,
    color: '#f87171',
    background: 'rgba(248,113,113,0.08)',
    borderRadius: 6,
    padding: '8px 12px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 500,
    padding: '9px 18px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  createBtn: {
    background: '#1d9a6c',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    padding: '9px 20px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
