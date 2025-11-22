// ==== CREATE FILE: lib/projectsClient.ts ====
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
