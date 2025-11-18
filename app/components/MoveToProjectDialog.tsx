// ==== REPLACE ENTIRE FILE: app/components/MoveToProjectDialog.tsx ====
'use client';

import * as React from 'react';
import type { Project } from '../../lib/projectsClient';
import { fetchProjects } from '../../lib/projectsClient';

type MoveToProjectDialogProps = {
    /** Controls visibility of the dialog */
    open: boolean;
    /** The chat / thread id we’re moving */
    threadId: string | null;
    /** Called when the dialog should close */
    onClose: () => void;
    /**
     * Optional: parent can do the real persistence (Supabase, etc.)
     * If not provided, we’ll just show a friendly alert so it never fails silently.
     */
    onMoved?: (projectId: string) => void;
};

export default function MoveToProjectDialog({
    open,
    threadId,
    onClose,
    onMoved,
}: MoveToProjectDialogProps) {
    const [projects, setProjects] = React.useState<Project[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
    const [submitting, setSubmitting] = React.useState(false);

    // Load projects when dialog opens
    React.useEffect(() => {
        if (!open) return;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetchProjects();
                if (!res.ok) {
                    const msg =
                        res.message || res.error || res.reason || 'Unable to load projects.';
                    setError(msg);
                    setProjects([]);
                } else {
                    const list = res.projects ?? [];
                    setProjects(list);
                    // Auto-select first project if none selected yet
                    if (list.length > 0 && !selectedProjectId) {
                        setSelectedProjectId(list[0].id);
                    }
                }
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : 'Unexpected error loading projects.'
                );
                setProjects([]);
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, [open, selectedProjectId]);

    // Reset state when closing
    React.useEffect(() => {
        if (!open) {
            setSelectedProjectId(null);
            setError(null);
            setSubmitting(false);
        }
    }, [open]);

    if (!open || !threadId) return null;

    const handleConfirm = async () => {
        if (!selectedProjectId) return;

        setSubmitting(true);
        try {
            if (onMoved) {
                await Promise.resolve(onMoved(selectedProjectId));
            } else {
                // Fallback so it doesn’t look broken if we forget to wire onMoved
                window.alert('Move-to-project is not fully wired yet (no onMoved handler).');
            }
            onClose();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'There was a problem moving this chat.'
            );
        } finally {
            setSubmitting(false);
        }
    };

    const cannotSubmit =
        submitting || loading || !selectedProjectId || (projects?.length ?? 0) === 0;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-to-project-title"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.35)',
            }}
            onClick={onClose}
        >
            {/* Inner card – stop propagation so clicks inside don’t close */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 420,
                    margin: '0 16px',
                    borderRadius: 12,
                    background: '#fff',
                    boxShadow:
                        '0 18px 40px rgba(0,0,0,0.20), 0 0 0 1px rgba(0,0,0,0.04)',
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                <div
                    id="move-to-project-title"
                    style={{
                        fontSize: 16,
                        fontWeight: 600,
                        marginBottom: 4,
                    }}
                >
                    Move chat to a project
                </div>

                <div style={{ fontSize: 13, opacity: 0.8 }}>
                    Choose which project you want this chat to live under. You can still
                    find it in your history.
                </div>

                {/* Status area */}
                {loading && (
                    <div style={{ fontSize: 13, opacity: 0.75 }}>Loading projects…</div>
                )}

                {!loading && error && (
                    <div
                        style={{
                            fontSize: 12,
                            color: '#b00020',
                            background: 'rgba(176,0,32,0.06)',
                            padding: 8,
                            borderRadius: 8,
                        }}
                    >
                        {error}
                    </div>
                )}

                {!loading && !error && projects.length === 0 && (
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                        You don&apos;t have any projects yet. Create a project from the sidebar
                        first, then move this chat.
                    </div>
                )}

                {/* Projects list */}
                {!loading && !error && projects.length > 0 && (
                    <div
                        style={{
                            maxHeight: 220,
                            overflowY: 'auto',
                            padding: '4px 0',
                            borderRadius: 8,
                            background: 'rgba(0,0,0,0.02)',
                        }}
                    >
                        {projects.map((project) => {
                            const isSelected = project.id === selectedProjectId;
                            return (
                                <button
                                    key={project.id}
                                    type="button"
                                    onClick={() => setSelectedProjectId(project.id)}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        border: 'none',
                                        padding: '6px 8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        background: isSelected
                                            ? 'rgba(0,0,0,0.06)'
                                            : 'transparent',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                    }}
                                    title={project.name}
                                >
                                    <span
                                        style={{
                                            width: 12,
                                            height: 12,
                                            borderRadius: '50%',
                                            border: '1px solid rgba(0,0,0,0.4)',
                                            background: isSelected
                                                ? 'rgba(0,0,0,0.8)'
                                                : 'transparent',
                                            boxShadow: isSelected
                                                ? '0 0 0 2px rgba(0,0,0,0.15)'
                                                : 'none',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span
                                        style={{
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            flex: '1 1 auto',
                                        }}
                                    >
                                        {project.name || '(untitled project)'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Buttons */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 8,
                        marginTop: 8,
                    }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        style={{
                            borderRadius: 6,
                            border: 'none',
                            padding: '6px 10px',
                            fontSize: 13,
                            background: 'transparent',
                            cursor: submitting ? 'default' : 'pointer',
                            opacity: submitting ? 0.6 : 0.9,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={cannotSubmit}
                        style={{
                            borderRadius: 6,
                            border: 'none',
                            padding: '6px 12px',
                            fontSize: 13,
                            fontWeight: 500,
                            background: cannotSubmit
                                ? 'rgba(0,0,0,0.08)'
                                : 'rgba(0,0,0,0.9)',
                            color: cannotSubmit ? 'rgba(0,0,0,0.4)' : '#fff',
                            cursor: cannotSubmit ? 'default' : 'pointer',
                        }}
                    >
                        {submitting ? 'Moving…' : 'Move chat'}
                    </button>
                </div>
            </div>
        </div>
    );
}
