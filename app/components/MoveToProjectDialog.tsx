// ==== REPLACE ENTIRE FILE: app/components/MoveToProjectDialog.tsx ====
// Modal dialog to move a chat thread into a project.
// Handles auth gracefully: if not signed in, shows a Sign in prompt instead of raw JSON.

'use client';

import * as React from 'react';
import { SignInButton, useUser } from '@clerk/nextjs';

type Project = {
    id: string;
    name: string;
    project_threads?: { id: string; thread_id: string | null; created_at: string }[];
};

type MoveToProjectDialogProps = {
    open: boolean;
    threadId: string | null;
    onClose: () => void;
    onMoved?: (projectId: string, threadId: string) => void;
};

type ProjectsResponse =
    | { ok: true; projects: Project[] }
    | { ok: false; reason: string; stage?: string; message?: string };

type PostResponse =
    | { ok: true; project: Project; mapping: any }
    | { ok: false; reason: string; stage?: string; message?: string };

export default function MoveToProjectDialog({
    open,
    threadId,
    onClose,
    onMoved,
}: MoveToProjectDialogProps) {
    const { isSignedIn } = useUser();

    const [projects, setProjects] = React.useState<Project[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
    const [newProjectName, setNewProjectName] = React.useState('');

    const [authRequired, setAuthRequired] = React.useState(false);
    const [errorText, setErrorText] = React.useState<string | null>(null);

    // Reset internal state whenever dialog opens/closes
    React.useEffect(() => {
        if (!open) {
            setProjects([]);
            setLoading(false);
            setSaving(false);
            setSelectedProjectId(null);
            setNewProjectName('');
            setAuthRequired(false);
            setErrorText(null);
        }
    }, [open]);

    // Load projects when dialog opens and user is signed in
    React.useEffect(() => {
        if (!open) return;
        if (!isSignedIn) {
            // User is not signed in – show auth prompt instead of trying API calls
            setAuthRequired(true);
            setProjects([]);
            return;
        }

        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setErrorText(null);
                setAuthRequired(false);

                const res = await fetch('/api/projects', {
                    method: 'GET',
                    cache: 'no-store',
                });

                const json = (await res.json()) as ProjectsResponse;

                if (!json.ok) {
                    // Defensive: if backend ever returns not_authenticated here, gate with auth prompt.
                    if (json.reason === 'not_authenticated') {
                        if (!cancelled) {
                            setAuthRequired(true);
                            setProjects([]);
                        }
                        return;
                    }
                    if (!cancelled) {
                        setErrorText('There was a problem loading your projects.');
                    }
                    return;
                }

                if (!cancelled) {
                    setProjects(json.projects ?? []);
                }
            } catch (err) {
                if (!cancelled) {
                    setErrorText('There was a problem loading your projects.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [open, isSignedIn]);

    if (!open) return null;

    const hasProjects = projects && projects.length > 0;

    async function handleSave() {
        if (!threadId) {
            onClose();
            return;
        }

        // If user is not signed in, show auth prompt instead of calling the API.
        if (!isSignedIn) {
            setAuthRequired(true);
            setErrorText(null);
            return;
        }

        const chosenExisting = selectedProjectId && selectedProjectId !== 'new';
        const trimmedNewName = newProjectName.trim();

        if (!chosenExisting && !trimmedNewName) {
            setErrorText('Please pick a project or enter a name.');
            return;
        }

        try {
            setSaving(true);
            setErrorText(null);

            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
                body: JSON.stringify({
                    threadId,
                    projectName: chosenExisting
                        ? projects.find((p) => p.id === selectedProjectId)?.name ?? ''
                        : trimmedNewName,
                }),
            });

            const json = (await res.json()) as PostResponse;

            if (!json.ok) {
                if (json.reason === 'not_authenticated') {
                    // Backend says we need auth – switch to authRequired state.
                    setAuthRequired(true);
                    setErrorText(null);
                    return;
                }

                setErrorText('There was a problem saving this chat to a project.');
                return;
            }

            // Success
            if (onMoved) {
                onMoved(json.project.id, threadId);
            }
            onClose();
        } catch (err) {
            setErrorText('There was a problem saving this chat to a project.');
        } finally {
            setSaving(false);
        }
    }

    const handleCancel = () => {
        onClose();
    };

    return (
        <div
            // Simple overlay
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
            }}
            aria-modal="true"
            role="dialog"
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: 420,
                    margin: '0 16px',
                    background: '#fff',
                    borderRadius: 20,
                    boxShadow:
                        '0 18px 45px rgba(15,23,42,0.25), 0 0 0 1px rgba(15,23,42,0.06)',
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                    }}
                >
                    <div
                        style={{
                            fontSize: 16,
                            fontWeight: 600,
                        }}
                    >
                        Move chat to project
                    </div>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={handleCancel}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: 18,
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* AUTH REQUIRED STATE */}
                {authRequired ? (
                    <>
                        <div
                            style={{
                                fontSize: 13,
                                lineHeight: 1.5,
                                marginTop: 4,
                                marginBottom: 8,
                            }}
                        >
                            You need to sign in to create projects and save chats into them.
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                gap: 8,
                                marginTop: 8,
                            }}
                        >
                            <SignInButton mode="modal">
                                <button
                                    type="button"
                                    className="btn primary"
                                    style={{ flex: '0 0 auto' }}
                                >
                                    Sign in
                                </button>
                            </SignInButton>
                            <button
                                type="button"
                                className="btn"
                                style={{ flex: '0 0 auto' }}
                                onClick={handleCancel}
                            >
                                Cancel
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* EXISTING PROJECTS */}
                        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                            {loading
                                ? 'Loading your projects…'
                                : hasProjects
                                    ? 'Choose a project below, or create a new one.'
                                    : 'No projects yet. Create one below.'}
                        </div>

                        {hasProjects && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                    marginTop: 4,
                                    marginBottom: 8,
                                    maxHeight: 200,
                                    overflowY: 'auto',
                                }}
                            >
                                {projects.map((p) => {
                                    const isActive = selectedProjectId === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setSelectedProjectId(p.id)}
                                            style={{
                                                border: 'none',
                                                background: isActive
                                                    ? 'rgba(15,23,42,0.06)'
                                                    : 'rgba(15,23,42,0.02)',
                                                borderRadius: 10,
                                                padding: '8px 10px',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                fontSize: 13,
                                            }}
                                        >
                                            <div style={{ fontWeight: 500 }}>{p.name}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* NEW PROJECT INPUT */}
                        <div
                            style={{
                                marginTop: 8,
                                paddingTop: 8,
                                borderTop: '1px solid rgba(148,163,184,0.3)',
                                fontSize: 12,
                                opacity: 0.9,
                            }}
                        >
                            Or create a new project
                        </div>

                        <input
                            type="text"
                            placeholder="New project name"
                            value={newProjectName}
                            onChange={(e) => {
                                setNewProjectName(e.target.value);
                                if (e.target.value.trim()) {
                                    setSelectedProjectId('new');
                                }
                            }}
                            style={{
                                marginTop: 6,
                                padding: '8px 10px',
                                borderRadius: 999,
                                border: '1px solid rgba(148,163,184,0.7)',
                                fontSize: 13,
                                outline: 'none',
                            }}
                        />

                        {/* Error message (friendly, no raw JSON) */}
                        {errorText && (
                            <div
                                style={{
                                    color: '#b91c1c',
                                    fontSize: 12,
                                    marginTop: 4,
                                }}
                            >
                                {errorText}
                            </div>
                        )}

                        {/* Actions */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: 8,
                                marginTop: 14,
                            }}
                        >
                            <button
                                type="button"
                                className="btn"
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn primary"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
