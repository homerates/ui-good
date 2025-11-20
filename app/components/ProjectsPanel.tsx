// ==== REPLACE ENTIRE FILE: app/components/ProjectsPanel.tsx ====
'use client';

import * as React from "react";
import type { Project } from "../../lib/projectsClient";
import { fetchProjects } from "../../lib/projectsClient";

type ProjectsPanelProps = {
    /** Optional: externally selected project id */
    activeProjectId?: string | null;
    /** Called when the user clicks a project */
    onSelectProject?: (project: Project) => void;
    /** Optional: project-level actions (rename/delete) */
    onProjectAction?: (
        action: "rename" | "delete",
        project: Project
    ) => void;
    /** Extra class if you want to style from globals */
    className?: string;
};

/** Keep only first 2–3 words, then add an ellipsis if longer */
function truncateProjectName(raw: string): string {
    const name = (raw || "").trim();
    if (!name) return "(untitled project)";
    const words = name.split(/\s+/);
    if (words.length <= 3) return name;
    return words.slice(0, 3).join(" ") + "…";
}

/**
 * ProjectsPanel
 *
 * ChatGPT-style list of projects:
 * - compact
 * - no thread counts
 * - project names truncated to 2–3 words + …
 * - per-project "..." menu for Rename/Delete
 */
export default function ProjectsPanel({
    activeProjectId,
    onSelectProject,
    onProjectAction,
    className,
}: ProjectsPanelProps) {
    const [projects, setProjects] = React.useState<Project[] | null>(null);
    const [loading, setLoading] = React.useState<boolean>(true);
    const [error, setError] = React.useState<string | null>(null);
    const [refreshing, setRefreshing] = React.useState<boolean>(false);
    const [localSelectedId, setLocalSelectedId] = React.useState<string | null>(
        null
    );
    const [menuOpenId, setMenuOpenId] = React.useState<string | null>(null);

    // If parent passes activeProjectId, it wins; otherwise we fall back to local selection
    const effectiveActiveId = activeProjectId ?? localSelectedId ?? null;

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
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
            setLoading(false);
        }
    }, []);

    const refresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            await load();
        } finally {
            setRefreshing(false);
        }
    }, [load]);

    React.useEffect(() => {
        void load();
    }, [load]);

    const handleClickProject = (project: Project) => {
        setLocalSelectedId(project.id);
        if (onSelectProject) onSelectProject(project);
    };

    const handleProjectAction = (
        action: "rename" | "delete",
        project: Project
    ) => {
        setMenuOpenId(null);

        if (onProjectAction) {
            onProjectAction(action, project);
            return;
        }

        // Fallback: no UI alerts, just log so it doesn't feel "broken" to users
        console.log("[ProjectsPanel] project action (no handler wired):", {
            action,
            projectId: project.id,
            name: project.name,
        });
    };

    return (
        <div
            className={className}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 11, // smaller overall
                lineHeight: 1.35,
            }}
        >
            {/* Label row, light and small */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 2,
                }}
            >
                <div
                    style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        opacity: 0.7,
                    }}
                >
                    Projects
                </div>
                <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={loading || refreshing}
                    style={{
                        fontSize: 10,
                        padding: 0,
                        border: "none",
                        background: "none",
                        cursor: loading || refreshing ? "default" : "pointer",
                        opacity: loading || refreshing ? 0.4 : 0.75,
                        textDecoration: "underline",
                    }}
                >
                    {refreshing ? "Refreshing" : "Refresh"}
                </button>
            </div>

            {/* States */}
            {loading && (
                <div style={{ opacity: 0.6, fontSize: 11 }}>Loading…</div>
            )}

            {!loading && error && (
                <div
                    style={{
                        color: "#ff9b9b",
                        background: "rgba(255,0,0,0.03)",
                        borderRadius: 4,
                        padding: 4,
                        fontSize: 10,
                    }}
                >
                    {error}
                </div>
            )}

            {!loading && !error && projects && projects.length === 0 && (
                <div style={{ opacity: 0.6, fontSize: 11 }}>
                    No projects yet.
                </div>
            )}

            {/* Projects list */}
            {!loading && !error && projects && projects.length > 0 && (
                <ul
                    style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                    }}
                >
                    {projects.map((project) => {
                        const isActive = project.id === effectiveActiveId;
                        const displayName = truncateProjectName(
                            project.name || "(untitled project)"
                        );
                        const menuOpen = menuOpenId === project.id;

                        return (
                            <li key={project.id}>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        position: "relative",
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleClickProject(project)}
                                        style={{
                                            width: "100%",
                                            textAlign: "left",
                                            borderRadius: 6,
                                            border: "none",
                                            padding: "4px 0",
                                            background: isActive
                                                ? "rgba(0,0,0,0.04)"
                                                : "transparent",
                                            cursor: "pointer",
                                            fontSize: 11,
                                            display: "flex",
                                            flexDirection: "row",
                                            alignItems: "center",
                                        }}
                                        title={project.name}
                                    >
                                        <span
                                            style={{
                                                fontWeight: isActive ? 500 : 400,
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {displayName}
                                        </span>
                                    </button>

                                    {/* Simple "..." menu trigger */}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setMenuOpenId((prev) =>
                                                prev === project.id ? null : project.id
                                            )
                                        }
                                        aria-label="Project options"
                                        title="Project options"
                                        style={{
                                            border: "none",
                                            background: "transparent",
                                            cursor: "pointer",
                                            padding: 0,
                                            fontSize: 14,
                                            lineHeight: 1,
                                            opacity: 0.7,
                                            flex: "0 0 auto",
                                        }}
                                    >
                                        …
                                    </button>

                                    {/* Dropdown menu */}
                                    {menuOpen && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                right: 0,
                                                top: "100%",
                                                marginTop: 4,
                                                padding: 6,
                                                background: "#fff",
                                                borderRadius: 8,
                                                boxShadow:
                                                    "0 10px 25px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)",
                                                minWidth: 140,
                                                zIndex: 50,
                                                fontSize: 12,
                                            }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleProjectAction("rename", project)
                                                }
                                                style={{
                                                    width: "100%",
                                                    textAlign: "left",
                                                    border: "none",
                                                    background: "transparent",
                                                    padding: "4px 6px",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Rename project
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleProjectAction("delete", project)
                                                }
                                                style={{
                                                    width: "100%",
                                                    textAlign: "left",
                                                    border: "none",
                                                    background: "transparent",
                                                    padding: "4px 6px",
                                                    cursor: "pointer",
                                                    color: "#b00020",
                                                }}
                                            >
                                                Delete project
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
