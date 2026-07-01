// ==== REPLACE ENTIRE FILE: app/components/MoveToProjectDialog.tsx ====
// Move-to-project dialog: lets you pick a project and moves the chat via /api/projects/move-chat

'use client';

import * as React from 'react';
import { fetchProjects } from '../../lib/projectsClient';
import type { Project } from '../../lib/projectsClient';

type MoveToProjectDialogProps = {
    open: boolean;
    threadId: string | null;
    onClose: () => void;
    /**
     * Optional callback fired after a successful move.
     * Sidebar can use this to refresh state, but it is not required.
     */
    onMoved?: (projectId: string) => void;
};

type MoveState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; projectId: string }
    | { status: 'error'; message: string };

export default function MoveToProjectDialog({
    open,
    threadId,
    onClose,
    onMoved,
}: MoveToProjectDialogProps) {
    const [projects, setProjects] = React.useState<Project[]>([]);
    const [loadingProjects, setLoadingProjects] = React.useState(false);
    const [projectsError, setProjectsError] = React.useState<string | null>(null);

    const [selectedProjectId, setSelectedProjectId] = React.useState<string>('');
    const [newProjectName, setNewProjectName] = React.useState<string>('');
    const [moveState, setMoveState] = React.useState<MoveState>({ status: 'idle' });

    // Load projects when dialog opens
    React.useEffect(() => {
        if (!open) return;

        setProjects([]);
        setProjectsError(null);
        setSelectedProjectId('');
        setNewProjectName('');
        setMoveState({ status: 'idle' });

        const load = async () => {
            setLoadingProjects(true);
            try {
                const res = await fetchProjects();
                if (!res.ok) {
                    setProjectsError(
                        res.message ||
                        res.error ||
                        res.reason ||
                        'Unable to load projects.'
                    );
                    setProjects([]);
                } else {
                    const list = res.projects ?? [];
                    setProjects(list);
                    if (list.length > 0) {
                        setSelectedProjectId(list[0].id);
                    }
                }
            } catch (err) {
                setProjectsError(
                    err instanceof Error ? err.message : 'Unexpected error loading projects.'
                );
                setProjects([]);
            } finally {
                setLoadingProjects(false);
            }
        };

        void load();
    }, [open]);

    if (!open) {
        return null;
    }

    const handleCancel = () => {
        setMoveState({ status: 'idle' });
        onClose();
    };

    const handleMove = async () => {
        if (!threadId) return;

        const trimmedNewName = newProjectName.trim();
        setMoveState({ status: 'loading' });

        try {
            let projectId: string;

            if (trimmedNewName) {
                // Create a new project and attach the thread in one call
                const res = await fetch('/api/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ threadId, projectName: trimmedNewName }),
                });

                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    const msg =
                        json?.message || json?.error || json?.reason ||
                        `Create failed with status ${res.status}`;
                    setMoveState({ status: 'error', message: msg });
                    return;
                }

                const json = await res.json();
                if (!json?.ok) {
                    setMoveState({ status: 'error', message: json?.error ?? 'Failed to create project.' });
                    return;
                }
                projectId = json.project?.id ?? '';
            } else {
                // Move to an existing project
                if (!selectedProjectId) return;
                const res = await fetch('/api/projects/move-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ threadId, projectId: selectedProjectId }),
                });

                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    const msg =
                        json?.message || json?.error || json?.reason ||
                        `Move failed with status ${res.status}`;
                    setMoveState({ status: 'error', message: msg });
                    return;
                }
                projectId = selectedProjectId;
            }

            setMoveState({ status: 'success', projectId });

            if (onMoved) {
                onMoved(projectId);
            }

            setTimeout(() => {
                onClose();
                setMoveState({ status: 'idle' });
            }, 400);
        } catch (err) {
            setMoveState({
                status: 'error',
                message:
                    err instanceof Error
                        ? err.message
                        : 'Unexpected error moving chat to project.',
            });
        }
    };

    const trimmedNewName = newProjectName.trim();
    const canMove = !!threadId && !loadingProjects && moveState.status !== 'loading' &&
        (trimmedNewName.length > 0 || !!selectedProjectId);
    const disabled = !canMove;

    return (
        <div
            aria-modal="true"
            role="dialog"
            aria-labelledby="move-to-project-title"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
            }}
            onClick={handleCancel}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 12,
                    boxShadow: '0 18px 40px rgba(0,0,0,0.25)',
                    width: '100%',
                    maxWidth: 360,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    id="move-to-project-title"
                    style={{
                        fontWeight: 600,
                        fontSize: 15,
                        marginBottom: 4,
                    }}
                >
                    Move chat to a project
                </div>

                {loadingProjects && (
                    <div style={{ fontSize: 13, opacity: 0.8 }}>Loading projects…</div>
                )}

                {!loadingProjects && projectsError && (
                    <div
                        style={{
                            fontSize: 12,
                            color: '#b00020',
                            background: 'rgba(176,0,32,0.05)',
                            borderRadius: 6,
                            padding: 6,
                        }}
                    >
                        {projectsError}
                    </div>
                )}

                {/* Create new project */}
                <div>
                    <label
                        htmlFor="new-project-name"
                        style={{ fontSize: 12, opacity: 0.8, display: 'block', marginBottom: 4 }}
                    >
                        New project name
                    </label>
                    <input
                        id="new-project-name"
                        type="text"
                        placeholder="e.g. First Home, Refi 2026…"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        style={{
                            width: '100%',
                            fontSize: 13,
                            padding: '5px 8px',
                            borderRadius: 6,
                            border: '1px solid rgba(0,0,0,0.15)',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                {!loadingProjects && !projectsError && projects.length > 0 && !newProjectName.trim() && (
                    <>
                        <div style={{ fontSize: 11, opacity: 0.5, textAlign: 'center' }}>
                            — or move to existing —
                        </div>
                        <label
                            htmlFor="move-project-select"
                            style={{ fontSize: 12, opacity: 0.8, marginBottom: 4, display: 'block' }}
                        >
                            Choose a project
                        </label>
                        <select
                            id="move-project-select"
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            style={{
                                width: '100%',
                                fontSize: 13,
                                padding: '4px 6px',
                                borderRadius: 6,
                                border: '1px solid rgba(0,0,0,0.12)',
                            }}
                        >
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name || '(untitled project)'}
                                </option>
                            ))}
                        </select>
                    </>
                )}

                {!loadingProjects && !projectsError && projects.length === 0 && !newProjectName.trim() && (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>
                        No existing projects. Type a name above to create one.
                    </div>
                )}

                {moveState.status === 'error' && (
                    <div
                        style={{
                            fontSize: 12,
                            color: '#b00020',
                            background: 'rgba(176,0,32,0.05)',
                            borderRadius: 6,
                            padding: 6,
                        }}
                    >
                        {moveState.message}
                    </div>
                )}

                {moveState.status === 'success' && (
                    <div
                        style={{
                            fontSize: 12,
                            color: '#0b7a1b',
                            background: 'rgba(0,128,0,0.06)',
                            borderRadius: 6,
                            padding: 6,
                        }}
                    >
                        Chat moved to project successfully.
                    </div>
                )}

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 8,
                        marginTop: 10,
                    }}
                >
                    <button
                        type="button"
                        onClick={handleCancel}
                        style={{
                            borderRadius: 999,
                            border: '1px solid rgba(0,0,0,0.15)',
                            background: '#fff',
                            padding: '4px 10px',
                            fontSize: 13,
                            cursor: 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleMove}
                        disabled={disabled}
                        style={{
                            borderRadius: 999,
                            border: 'none',
                            background: disabled ? '#ccc' : '#111827',
                            color: '#fff',
                            padding: '4px 12px',
                            fontSize: 13,
                            cursor: disabled ? 'default' : 'pointer',
                        }}
                    >
                        {moveState.status === 'loading' ? 'Moving…' : 'Move'}
                    </button>
                </div>
            </div>
        </div>
    );
}
