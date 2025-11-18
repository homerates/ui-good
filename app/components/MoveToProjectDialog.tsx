// ==== REPLACE ENTIRE FILE: app/components/MoveToProjectDialog.tsx ====
'use client';

import * as React from "react";
import type { Project } from "../../lib/projectsClient";
import { fetchProjects } from "../../lib/projectsClient";

type MoveToProjectDialogProps = {
    open: boolean;
    /** The chat/thread id we are attaching to a project */
    threadId: string | null;
    /** Called when user cancels or after a successful move */
    onClose: () => void;
    /** Optional hook so the parent can refresh history/projects */
    onMoved?: (project: Project) => void;
};

/**
 * MoveToProjectDialog
 *
 * ChatGPT-style "Move to project" behavior:
 * - Lists existing projects
 * - Lets user create a new project by name
 * - Calls POST /api/projects with { threadId, projectName }
 */
export default function MoveToProjectDialog({
    open,
    threadId,
    onClose,
    onMoved,
}: MoveToProjectDialogProps) {
    const [projects, setProjects] = React.useState<Project[]>([]);
    const [loadingProjects, setLoadingProjects] = React.useState(false);
    const [projectName, setProjectName] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [status, setStatus] = React.useState<string | null>(null);

    // Load projects when dialog opens
    React.useEffect(() => {
        if (!open) return;
        setStatus(null);
        setError(null);
        setProjectName("");
        setProjects([]);
        setLoadingProjects(true);

        (async () => {
            try {
                const res = await fetchProjects();
                if (!res.ok) {
                    const msg =
                        res.message ||
                        res.error ||
                        res.reason ||
                        "Unable to load projects.";
                    setError(msg);
                    setProjects([]);
                } else {
                    setProjects(res.projects ?? []);
                }
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Unexpected error loading projects."
                );
                setProjects([]);
            } finally {
                setLoadingProjects(false);
            }
        })();
    }, [open]);

    if (!open) return null;

    const disabled = !threadId || saving;

    async function handleSave(targetName?: string) {
        if (!threadId) return;
        const finalName = (targetName ?? projectName).trim();
        if (!finalName) {
            setError("Please enter a project name.");
            return;
        }

        setSaving(true);
        setError(null);
        setStatus("Saving…");

        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    threadId,
                    projectName: finalName,
                }),
            });

            if (!res.ok) {
                let text: string | undefined;
                try {
                    text = await res.text();
                } catch {
                    // ignore
                }
                setError(
                    text ||
                    `Request failed with HTTP ${res.status}. Please try again.`
                );
                setStatus(null);
                return;
            }

            const json = (await res.json()) as {
                ok: boolean;
                project?: Project;
                reason?: string;
                message?: string;
                error?: string;
            };

            if (!json.ok || !json.project) {
                setError(
                    json.message ||
                    json.error ||
                    json.reason ||
                    "Unable to save project mapping."
                );
                setStatus(null);
                return;
            }

            setStatus("Saved");
            if (onMoved) onMoved(json.project);

            // Close after a short delay so user can see "Saved"
            setTimeout(() => {
                onClose();
            }, 400);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unexpected error saving project."
            );
            setStatus(null);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            // Simple overlay – we can refine styling later
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
            }}
        >
            <div
                style={{
                    width: 360,
                    maxWidth: "90vw",
                    background: "#fff",
                    color: "#111",
                    borderRadius: 12,
                    boxShadow:
                        "0 18px 45px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)",
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    fontSize: 13,
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 4,
                    }}
                >
                    <div style={{ fontWeight: 600 }}>Move chat to project</div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            border: "none",
                            background: "none",
                            cursor: saving ? "default" : "pointer",
                            fontSize: 18,
                            lineHeight: 1,
                        }}
                        aria-label="Close"
                        title="Close"
                    >
                        ×
                    </button>
                </div>

                {/* Existing projects list */}
                <div
                    style={{
                        maxHeight: 180,
                        overflowY: "auto",
                        paddingRight: 2,
                    }}
                >
                    {loadingProjects && (
                        <div style={{ opacity: 0.7 }}>Loading projects…</div>
                    )}

                    {!loadingProjects && projects && projects.length > 0 && (
                        <ul
                            style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                            }}
                        >
                            {projects.map((project) => (
                                <li key={project.id}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void handleSave(project.name)
                                        }
                                        disabled={disabled}
                                        style={{
                                            width: "100%",
                                            textAlign: "left",
                                            borderRadius: 8,
                                            border:
                                                "1px solid rgba(0,0,0,0.08)",
                                            padding: "6px 8px",
                                            background: "#fafafa",
                                            cursor: disabled
                                                ? "default"
                                                : "pointer",
                                            fontSize: 13,
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontWeight: 500,
                                                marginBottom: 2,
                                            }}
                                        >
                                            {project.name ||
                                                "(untitled project)"}
                                        </div>
                                        {project.project_threads &&
                                            project.project_threads.length >
                                            0 && (
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        opacity: 0.7,
                                                    }}
                                                >
                                                    {
                                                        project
                                                            .project_threads
                                                            .length
                                                    }{" "}
                                                    thread
                                                    {project
                                                        .project_threads
                                                        .length === 1
                                                        ? ""
                                                        : "s"}
                                                </div>
                                            )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {!loadingProjects &&
                        (!projects || projects.length === 0) && (
                            <div style={{ opacity: 0.7 }}>
                                No projects yet. Create one below.
                            </div>
                        )}
                </div>

                {/* New project name input */}
                <div
                    style={{
                        borderTop: "1px solid rgba(0,0,0,0.06)",
                        paddingTop: 8,
                        marginTop: 4,
                    }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            opacity: 0.75,
                            marginBottom: 4,
                        }}
                    >
                        Or create a new project
                    </div>
                    <input
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="New project name"
                        disabled={disabled}
                        style={{
                            width: "100%",
                            borderRadius: 8,
                            border: "1px solid rgba(0,0,0,0.12)",
                            padding: "6px 8px",
                            fontSize: 13,
                            boxSizing: "border-box",
                        }}
                    />
                </div>

                {/* Status + actions */}
                {error && (
                    <div
                        style={{
                            color: "#b00020",
                            fontSize: 11,
                            marginTop: 2,
                        }}
                    >
                        {error}
                    </div>
                )}
                {status && !error && (
                    <div
                        style={{
                            fontSize: 11,
                            opacity: 0.7,
                            marginTop: 2,
                        }}
                    >
                        {status}
                    </div>
                )}

                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 8,
                        marginTop: 8,
                    }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            borderRadius: 999,
                            border: "1px solid rgba(0,0,0,0.14)",
                            padding: "6px 12px",
                            background: "#fff",
                            cursor: saving ? "default" : "pointer",
                            fontSize: 13,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={disabled}
                        style={{
                            borderRadius: 999,
                            border: "none",
                            padding: "6px 14px",
                            background: "#111827",
                            color: "#fff",
                            cursor: disabled ? "default" : "pointer",
                            fontSize: 13,
                            opacity: disabled ? 0.6 : 1,
                        }}
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
