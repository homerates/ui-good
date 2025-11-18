// ==== CREATE FILE: app/components/ProjectsPanel.tsx ====
'use client';

import * as React from "react";
import type { Project } from "../../lib/projectsClient";
import { fetchProjects } from "../../lib/projectsClient";

type ProjectsPanelProps = {
    activeProjectId?: string | null;
    onSelectProject?: (project: Project) => void;
    className?: string;
};

/**
 * ProjectsPanel
 *
 * Read-only list of projects for the signed-in user.
 * - Uses /api/projects under the hood via fetchProjects()
 * - Shows loading / error / empty states
 * - Optional onSelectProject callback for parent components
 */
export default function ProjectsPanel({
    activeProjectId,
    onSelectProject,
    className,
}: ProjectsPanelProps) {
    const [projects, setProjects] = React.useState<Project[] | null>(null);
    const [loading, setLoading] = React.useState<boolean>(true);
    const [error, setError] = React.useState<string | null>(null);
    const [refreshing, setRefreshing] = React.useState<boolean>(false);

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

    return (
        <div
            className={className}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 13,
                lineHeight: 1.4,
            }}
        >
            {/* Header row */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                }}
            >
                <div style={{ fontWeight: 600 }}>Projects</div>

                <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={loading || refreshing}
                    style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "transparent",
                        cursor: loading || refreshing ? "default" : "pointer",
                        opacity: loading || refreshing ? 0.5 : 1,
                    }}
                >
                    {refreshing ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {/* Status states */}
            {loading && (
                <div style={{ opacity: 0.7 }}>Loading projects…</div>
            )}

            {!loading && error && (
                <div
                    style={{
                        color: "#ff9b9b",
                        background: "rgba(255,0,0,0.05)",
                        borderRadius: 4,
                        padding: 6,
                    }}
                >
                    {error}
                </div>
            )}

            {!loading && !error && projects && projects.length === 0 && (
                <div style={{ opacity: 0.7 }}>No projects yet.</div>
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
                        gap: 4,
                    }}
                >
                    {projects.map((project) => {
                        const isActive = project.id === activeProjectId;

                        return (
                            <li key={project.id}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onSelectProject && onSelectProject(project)
                                    }
                                    style={{
                                        width: "100%",
                                        textAlign: "left",
                                        borderRadius: 6,
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        padding: "6px 8px",
                                        background: isActive
                                            ? "rgba(255,255,255,0.1)"
                                            : "transparent",
                                        cursor: onSelectProject ? "pointer" : "default",
                                        fontSize: 13,
                                    }}
                                >
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            marginBottom: 2,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {project.name || "(untitled project)"}
                                    </div>
                                    {project.project_threads &&
                                        project.project_threads.length > 0 && (
                                            <div
                                                style={{
                                                    fontSize: 11,
                                                    opacity: 0.7,
                                                }}
                                            >
                                                {project.project_threads.length} thread
                                                {project.project_threads.length === 1 ? "" : "s"}
                                            </div>
                                        )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
