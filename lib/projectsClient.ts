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
 * Create a new project for the current signed-in user.
 *
 * Expects a matching POST /api/projects implementation that:
 * - reads the Clerk user from auth
 * - inserts into public.projects
 * - returns { ok: true, project } on success
 */
export type CreateProjectResponse =
    | {
        ok: true;
        project: Project;
    }
    | {
        ok: false;
        reason?: string;
        stage?: string;
        message?: string;
        error?: string;
    };

export async function createProject(name: string): Promise<CreateProjectResponse> {
    const trimmed = name.trim();
    if (!trimmed) {
        return {
            ok: false,
            reason: "validation",
            stage: "createProject_client",
            message: "Project name is required.",
        };
    }

    const res = await fetch("/api/projects", {
        method: "POST",
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
