// lib/homerates-db.ts
// HomeRates.ai DB helpers for projects, threads, and user_answers
// This file does NOT create the Supabase client; it just uses one you pass in.

import type { SupabaseClient } from '@supabase/supabase-js';

// -----------------------------
// Types
// -----------------------------

export type ChatRole = 'user' | 'assistant' | 'system';

// Keep this flexible: we define the main tools, but allow any string for future tools.
export type ToolId =
    | 'mortgage-solutions'
    | 'ask-underwriting'
    | 'about-homerates'
    | 'refi-lab'
    | 'rate-oracle'
    | 'underwriting-oracle'
    | string;

// Mirrors the user_answers table we created:
// id, project_thread_id, loan_officer_id, borrower_id, role, tool_id, question, answer, metadata, created_at
export interface UserAnswerRow {
    id: string;
    project_thread_id: string | null;
    loan_officer_id: string | null;
    borrower_id: string | null;
    role: ChatRole;
    tool_id: string | null;
    question: string | null;
    answer: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

// Minimal view of project_threads; enough for our helper
export interface ProjectThreadRow {
    id: string;
    project_id: string | null;
    external_thread_id: string | null;
    title: string | null;
    created_by_role: string | null;
    created_at: string;
}

// -----------------------------
// Input types for helpers
// -----------------------------

export interface LogUserAnswerInput {
    // Required
    projectThreadId: string | null; // allow null for "global" chats if needed
    role: ChatRole;

    // Optional context
    loanOfficerId?: string | null;
    borrowerId?: string | null;
    toolId?: ToolId | null;

    // Question/answer payload
    question?: string | null;
    answer?: string | null;

    // JSON payload for calc inputs, guideline snippets, rate sheets, etc.
    metadata?: Record<string, unknown> | null;
}

export interface EnsureProjectThreadInput {
    projectId: string | null;
    externalThreadId?: string | null; // e.g. internal chat thread id
    title?: string | null;
    createdByRole?: 'borrower' | 'loan_officer' | 'system' | null;
}

// -----------------------------
// Core helper: logUserAnswer
// -----------------------------

/**
 * Inserts a single row into public.user_answers.
 *
 * You pass in an existing Supabase client and a LogUserAnswerInput.
 * Returns the inserted row (or throws on error).
 */
export async function logUserAnswer(
    supabase: SupabaseClient,
    input: LogUserAnswerInput,
): Promise<UserAnswerRow> {
    const {
        projectThreadId,
        role,
        loanOfficerId,
        borrowerId,
        toolId,
        question,
        answer,
        metadata,
    } = input;

    const { data, error } = await supabase
        .from('user_answers')
        .insert({
            project_thread_id: projectThreadId,
            loan_officer_id: loanOfficerId ?? null,
            borrower_id: borrowerId ?? null,
            role,
            tool_id: toolId ?? null,
            question: question ?? null,
            answer: answer ?? null,
            metadata: metadata ?? {},
        })
        .select('*')
        .single();

    if (error) {
        // You can replace this with your own error logger if you like
        throw new Error(
            `Failed to insert into user_answers: ${error.message} (code=${error.code ?? 'n/a'})`,
        );
    }

    // Type cast because Supabase client returns `any`
    return data as unknown as UserAnswerRow;
}

// -----------------------------
// Helper: ensureProjectThread
// -----------------------------

/**
 * Finds or creates a project_threads row for a given project + externalThreadId.
 *
 * - If externalThreadId is provided and we find an existing row, we return it.
 * - Otherwise, we create a new row.
 */
export async function ensureProjectThread(
    supabase: SupabaseClient,
    input: EnsureProjectThreadInput,
): Promise<ProjectThreadRow> {
    const { projectId, externalThreadId, title, createdByRole } = input;

    // 1) If we have an externalThreadId, try to find an existing thread
    if (externalThreadId) {
        const { data: existing, error: existingError } = await supabase
            .from('project_threads')
            .select('*')
            .eq('external_thread_id', externalThreadId)
            .limit(1)
            .maybeSingle();

        if (existingError) {
            throw new Error(
                `Failed to query project_threads: ${existingError.message} (code=${existingError.code ?? 'n/a'})`,
            );
        }

        if (existing) {
            return existing as unknown as ProjectThreadRow;
        }
    }

    // 2) Create a new thread
    const { data: created, error: insertError } = await supabase
        .from('project_threads')
        .insert({
            project_id: projectId,
            external_thread_id: externalThreadId ?? null,
            title: title ?? null,
            created_by_role: createdByRole ?? null,
        })
        .select('*')
        .single();

    if (insertError) {
        throw new Error(
            `Failed to insert project_threads: ${insertError.message} (code=${insertError.code ?? 'n/a'})`,
        );
    }

    return created as unknown as ProjectThreadRow;
}
