// ==== REPLACE ENTIRE FILE: lib/projectsClient.ts ====
// Client-side helper for talking to /api/projects

export type ProjectThread = {
    id: string;
    thread_id: string;
    created_at: string;
};

export type Project = {
    id: string;
    name: string;
    created_at: string;
    project_threads: ProjectThread[];
};

export type ProjectsApiResponse =
    | {
        ok: true;
        projects: Project[];
    }
    | {
        ok: false;
        reason?: string;
        stage?: string;
        message?: string;
        error?: string;
    };

/**
 * Fetch all projects for the current signed-in user.
 *
 * Throws on network / non-OK HTTP errors,
 * but preserves the backend's { ok, reason, ... } shape.
 */
export async function fetchProjects(): Promise<ProjectsApiResponse> {
    const res = await fetch("/api/projects", {
        method: "GET",
        headers: {
            Accept: "application/json",
        },
        cache: "no-store",
    });

    if (!res.ok) {
        let text: string | undefined;
        try {
            text = await res.text();
        } catch {
            // ignore
        }

        return {
            ok: false,
            reason: "http_error",
            stage: "fetchProjects_http",
            message: `HTTP ${res.status}`,
            error: text,
        };
    }

    try {
        const json = (await res.json()) as ProjectsApiResponse;
        return json;
    } catch (err) {
        return {
            ok: false,
            reason: "invalid_json",
            stage: "fetchProjects_parse",
            message: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Create a new project *for an existing thread*.
 *
 * This matches the server route, which expects:
 *   { threadId: string, projectName: string }
 *
 * and returns { ok: true, ... } on success, or
 * { ok: false, reason, stage, message, error } on failure.
 */
export type CreateProjectResponse =
    | {
        ok: true;
        // server may include more fields; we don't depend on them here
        [key: string]: any;
    }
    | {
        ok: false;
        reason?: string;
        stage?: string;
        message?: string;
        error?: string;
    };

export async function createProject(
    threadId: string,
    projectName: string
): Promise<CreateProjectResponse> {
    const trimmedName = projectName.trim();

    if (!threadId || !trimmedName) {
        return {
            ok: false,
            reason: "validation",
            stage: "createProject_client",
            message: "threadId and projectName are required.",
        };
    }

    const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            threadId,
            projectName: trimmedName,
        }),
    });

    if (!res.ok) {
        let text: string | undefined;
        try {
            text = await res.text();
        } catch {
            // ignore
        }

        return {
            ok: false,
            reason: "http_error",
            stage: "createProject_http",
            message: `HTTP ${res.status}`,
            error: text,
        };
    }

    try {
        const json = (await res.json()) as CreateProjectResponse;
        return json;
    } catch (err) {
        return {
            ok: false,
            reason: "invalid_json",
            stage: "createProject_parse",
            message: err instanceof Error ? err.message : String(err),
        };
    }
}

/** Generic shape for rename/delete responses */
export type ProjectActionResponse =
    | {
        ok: true;
        [key: string]: any;
    }
    | {
        ok: false;
        reason?: string;
        stage?: string;
        message?: string;
        error?: string;
    };

/**
 * Rename an existing project by id.
 *
 * Expects a REST-style route:
 *   PATCH /api/projects/:id  with  { name: string }
 */
export async function renameProject(
    projectId: string,
    newName: string
): Promise<ProjectActionResponse> {
    const trimmed = newName.trim();
    if (!projectId || !trimmed) {
        return {
            ok: false,
            reason: "validation",
            stage: "renameProject_client",
            message: "projectId and name are required.",
        };
    }

    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmed }),
    });

    if (!res.ok) {
        let text: string | undefined;
        try {
            text = await res.text();
        } catch {
            // ignore
        }

        return {
            ok: false,
            reason: "http_error",
            stage: "renameProject_http",
            message: `HTTP ${res.status}`,
            error: text,
        };
    }

    try {
        const json = (await res.json()) as ProjectActionResponse;
        return json;
    } catch (err) {
        return {
            ok: false,
            reason: "invalid_json",
            stage: "renameProject_parse",
            message: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Delete an existing project by id.
 *
 * Expects a REST-style route:
 *   DELETE /api/projects/:id
 */
export async function deleteProject(
    projectId: string
): Promise<ProjectActionResponse> {
    if (!projectId) {
        return {
            ok: false,
            reason: "validation",
            stage: "deleteProject_client",
            message: "projectId is required.",
        };
    }

    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
        headers: {
            Accept: "application/json",
        },
    });

    if (!res.ok) {
        let text: string | undefined;
        try {
            text = await res.text();
        } catch {
            // ignore
        }

        return {
            ok: false,
            reason: "http_error",
            stage: "deleteProject_http",
            message: `HTTP ${res.status}`,
            error: text,
        };
    }

    try {
        const json = (await res.json()) as ProjectActionResponse;
        return json;
    } catch (err) {
        return {
            ok: false,
            reason: "invalid_json",
            stage: "deleteProject_parse",
            message: err instanceof Error ? err.message : String(err),
        };
    }
}
