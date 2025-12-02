// app/api/projects/[id]/route.ts

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// Minimal server-side Supabase client.
// Uses service role if available, otherwise anon key as fallback.
function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !serviceKey) {
        throw new Error(
            'Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL + service/anon key).'
        );
    }

    return createClient(url, serviceKey);
}

type ProjectsMutationResponse =
    | {
        ok: true;
    }
    | {
        ok: false;
        reason?: string;
        stage?: string;
        message?: string;
        error?: unknown;
    };

/**
 * PATCH /api/projects/[id]
 * Rename a project owned by the current Clerk user.
 */
export async function PATCH(req: Request, ctx: any) {
    // NOTE: auth() is async in newer Clerk
    const { userId } = await auth();

    if (!userId) {
        const body: ProjectsMutationResponse = {
            ok: false,
            reason: 'unauthorized',
            stage: 'renameProject_auth',
            message: 'Sign in required.',
        };
        return NextResponse.json(body, { status: 401 });
    }

    const projectId: string | undefined = ctx?.params?.id;
    if (!projectId) {
        const body: ProjectsMutationResponse = {
            ok: false,
            reason: 'missing_id',
            stage: 'renameProject_params',
            message: 'Project id is required in the URL.',
        };
        return NextResponse.json(body, { status: 400 });
    }

    let name: string | undefined;

    try {
        const json = (await req.json()) as { name?: string; projectName?: string };
        name = (json.name ?? json.projectName ?? '').trim();
    } catch {
        // ignore parse errors – we’ll treat as missing name
    }

    if (!name) {
        const body: ProjectsMutationResponse = {
            ok: false,
            reason: 'missing_fields',
            stage: 'renameProject_body',
            message: 'New project name is required.',
        };
        return NextResponse.json(body, { status: 400 });
    }

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .from('projects')
            .update({ name })
            .eq('id', projectId)
            .eq('clerk_user_id', userId);

        if (error) {
            const body: ProjectsMutationResponse = {
                ok: false,
                reason: 'supabase_error',
                stage: 'renameProject_update',
                message: error.message,
                error,
            };
            return NextResponse.json(body, { status: 500 });
        }

        const body: ProjectsMutationResponse = { ok: true };
        return NextResponse.json(body, { status: 200 });
    } catch (err) {
        const body: ProjectsMutationResponse = {
            ok: false,
            reason: 'exception',
            stage: 'renameProject_http',
            message: err instanceof Error ? err.message : String(err),
            error: err,
        };
        return NextResponse.json(body, { status: 500 });
    }
}

/**
 * DELETE /api/projects/[id]
 * Delete a project + its chat_threads mappings for the current Clerk user.
 * Chats themselves remain; we only clear the project + mapping rows.
 */
export async function DELETE(_req: Request, ctx: any) {
    // NOTE: auth() is async in newer Clerk
    const { userId } = await auth();

    if (!userId) {
        const body: ProjectsMutationResponse = {
            ok: false,
            reason: 'unauthorized',
            stage: 'deleteProject_auth',
            message: 'Sign in required.',
        };
        return NextResponse.json(body, { status: 401 });
    }

    const projectId: string | undefined = ctx?.params?.id;
    if (!projectId) {
        const body: ProjectsMutationResponse = {
            ok: false,
            reason: 'missing_id',
            stage: 'deleteProject_params',
            message: 'Project id is required in the URL.',
        };
        return NextResponse.json(body, { status: 400 });
    }

    try {
        const supabase = getSupabase();

        // 1) Delete chat_threads mappings for this project
        const { error: mappingError } = await supabase
            .from('chat_threads')
            .delete()
            .eq('project_id', projectId)
            .eq('clerk_user_id', userId);

        if (mappingError) {
            const body: ProjectsMutationResponse = {
                ok: false,
                reason: 'supabase_error',
                stage: 'deleteProject_mappings',
                message: mappingError.message,
                error: mappingError,
            };
            return NextResponse.json(body, { status: 500 });
        }

        // 2) Delete the project itself
        const { error: projectError } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId)
            .eq('clerk_user_id', userId);

        if (projectError) {
            const body: ProjectsMutationResponse = {
                ok: false,
                reason: 'supabase_error',
                stage: 'deleteProject_delete',
                message: projectError.message,
                error: projectError,
            };
            return NextResponse.json(body, { status: 500 });
        }

        const body: ProjectsMutationResponse = { ok: true };
        return NextResponse.json(body, { status: 200 });
    } catch (err) {
        const body: ProjectsMutationResponse = {
            ok: false,
            reason: 'exception',
            stage: 'deleteProject_http',
            message: err instanceof Error ? err.message : String(err),
            error: err,
        };
        return NextResponse.json(body, { status: 500 });
    }
}
