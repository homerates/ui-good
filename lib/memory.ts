/**
 * Memory System for Scenario Engine
 * 
 * Provides context-aware scenario analysis by:
 * 1. Storing scenario results in memory_items
 * 2. Retrieving conversation history for follow-ups
 * 3. Building context for Claude
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type MemoryItem = {
    id: string;
    memory_thread_id: string;
    kind: string;
    content_text: string;
    content_json: any;
    tags: string[];
    created_at: string;
};

export type ScenarioMemory = {
    scenario_inputs?: {
        price?: number;
        down_payment_pct?: number;
        loan_amount?: number;
        rate_used_pct?: number;
        rent_monthly?: number;
        property_tax_pct?: number;
        insurance_pct?: number;
        maintenance_pct?: number;
        vacancy_pct?: number;
    };
    computed_financials?: {
        monthly_pi?: number;
        monthly_pitia?: number;
        dscr_gross?: number;
        monthly_cash_flow?: number;
    };
    plain_english_summary?: string;
    question?: string;
    timestamp?: string;
};

/**
 * Get recent scenario history for a memory thread
 * Returns up to N most recent scenarios to provide context for follow-ups
 */
export async function getRecentScenarioHistory(
    supabase: SupabaseClient,
    memoryThreadId: string,
    limit: number = 5
): Promise<ScenarioMemory[]> {
    try {
        const { data, error } = await supabase
            .from('memory_items')
            .select('content_json, content_text, created_at')
            .eq('memory_thread_id', memoryThreadId)
            .eq('kind', 'scenario_snapshot')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[Memory] Error fetching history:', error);
            return [];
        }

        if (!data || data.length === 0) {
            return [];
        }

        return data.map((item) => ({
            ...item.content_json,
            timestamp: item.created_at,
        }));
    } catch (err) {
        console.error('[Memory] Exception fetching history:', err);
        return [];
    }
}

/**
 * Build context string from scenario history for Claude
 * Formats previous scenarios in a way Claude can understand and reference
 */
export function buildMemoryContext(history: ScenarioMemory[]): string {
    if (!history || history.length === 0) {
        return '';
    }

    const contexts: string[] = [];

    history.forEach((mem, idx) => {
        const isRecent = idx === 0;
        const label = isRecent ? 'MOST RECENT SCENARIO' : `PREVIOUS SCENARIO (${idx + 1} queries ago)`;

        const parts: string[] = [`${label}:`];

        // Scenario inputs
        if (mem.scenario_inputs) {
            const si = mem.scenario_inputs;
            const details: string[] = [];

            if (si.price) details.push(`Price: $${si.price.toLocaleString()}`);
            if (si.down_payment_pct) details.push(`Down: ${si.down_payment_pct}%`);
            if (si.loan_amount) details.push(`Loan: $${si.loan_amount.toLocaleString()}`);
            if (si.rate_used_pct) details.push(`Rate: ${si.rate_used_pct}%`);
            if (si.rent_monthly) details.push(`Rent: $${si.rent_monthly}/mo`);
            if (si.property_tax_pct) details.push(`Tax: ${si.property_tax_pct}%`);

            if (details.length > 0) {
                parts.push(`Inputs: ${details.join(', ')}`);
            }
        }

        // Key results
        if (mem.computed_financials) {
            const cf = mem.computed_financials;
            const results: string[] = [];

            if (cf.monthly_pi) results.push(`P&I: $${Math.round(cf.monthly_pi)}/mo`);
            if (cf.dscr_gross) results.push(`DSCR: ${cf.dscr_gross.toFixed(2)}x`);
            if (cf.monthly_cash_flow !== undefined) {
                const sign = cf.monthly_cash_flow < 0 ? '-' : '+';
                results.push(`Cash Flow: ${sign}$${Math.abs(Math.round(cf.monthly_cash_flow))}/mo`);
            }

            if (results.length > 0) {
                parts.push(`Results: ${results.join(', ')}`);
            }
        }

        // Summary (truncated)
        if (mem.plain_english_summary) {
            const summary = mem.plain_english_summary.substring(0, 200);
            parts.push(`Summary: ${summary}${mem.plain_english_summary.length > 200 ? '...' : ''}`);
        }

        contexts.push(parts.join('\n'));
    });

    return contexts.join('\n\n');
}

/**
 * Store a scenario result in memory
 * Called after successful scenario calculation
 */
export async function storeScenarioMemory(
    supabase: SupabaseClient,
    memoryThreadId: string,
    result: any,
    question: string,
    metadata?: {
        buildTag?: string;
        requestId?: string;
        provider?: string;
        model?: string;
    }
): Promise<{ success: boolean; error?: any }> {
    try {
        const { error } = await supabase.from('memory_items').insert({
            memory_thread_id: memoryThreadId,
            kind: 'scenario_snapshot',
            content_text: result?.plain_english_summary || question || 'Scenario analysis',
            content_json: {
                scenario_inputs: result?.scenario_inputs ?? null,
                computed_financials: result?.computed_financials ?? null,
                dscr: result?.dscr ?? null,
                rate_context: result?.rate_context ?? null,
                monthly_payment: result?.monthly_payment ?? null,
                question: question,
                ...metadata,
            },
            tags: ['scenario', 'auto'],
        });

        if (error) {
            console.error('[Memory] Error storing scenario:', error);
            return { success: false, error };
        }

        return { success: true };
    } catch (err) {
        console.error('[Memory] Exception storing scenario:', err);
        return { success: false, error: err };
    }
}

/**
 * Get the most recent scenario only (for baseline continuation)
 * This is what the current code uses - kept for backwards compatibility
 */
export async function getLastScenarioSnapshot(
    supabase: SupabaseClient,
    memoryThreadId: string
): Promise<any | null> {
    try {
        const { data } = await supabase
            .from('memory_items')
            .select('content_json, created_at')
            .eq('memory_thread_id', memoryThreadId)
            .eq('kind', 'scenario_snapshot')
            .order('created_at', { ascending: false })
            .limit(1);

        if (data && data.length > 0) {
            return data[0].content_json;
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Detect if a question is a follow-up that should use memory context
 * Examples:
 * - "What if rates increase?" (needs previous scenario)
 * - "Compare that to 30% down" (needs previous scenario)
 * - "Show me the same thing at 7%" (needs previous scenario)
 */
export function isFollowUpQuestion(question: string): boolean {
    const followUpIndicators = [
        /\bwhat if\b/i,
        /\bcompare (?:that|this|it) to\b/i,
        /\bsame (?:thing|scenario|property)\b/i,
        /\b(?:instead|rather|versus|vs)\b/i,
        /\b(?:change|adjust|modify) (?:the|to)\b/i,
        /\b(?:higher|lower|different) (?:rate|down|payment)\b/i,
        /\bprevious (?:scenario|example|calculation)\b/i,
        /\bthat (?:property|deal|scenario)\b/i,
    ];

    return followUpIndicators.some((pattern) => pattern.test(question));
}

/**
 * Build enhanced system prompt with memory context
 * Adds conversation history when appropriate
 */
export function buildSystemPromptWithMemory(
    basePrompt: string,
    question: string,
    memoryHistory: ScenarioMemory[]
): string {
    // If no history or not a follow-up, return base prompt
    if (!memoryHistory || memoryHistory.length === 0 || !isFollowUpQuestion(question)) {
        return basePrompt;
    }

    const context = buildMemoryContext(memoryHistory);

    if (!context) {
        return basePrompt;
    }

    return `${basePrompt}

═══════════════════════════════════════════════════════════════
CONVERSATION MEMORY (for follow-up questions)
═══════════════════════════════════════════════════════════════

${context}

MEMORY USAGE RULES:
- If the user's question references "the previous scenario", "that property", "same thing", etc., use the MOST RECENT SCENARIO above as the baseline
- If they say "compare to X" or "what if Y", keep the other inputs the same and only change what they specify
- If they ask a completely new question unrelated to the above, ignore this memory and start fresh
- Always clarify which scenario you're building from if using memory (e.g., "Based on your previous $850k property with 25% down...")

═══════════════════════════════════════════════════════════════
`;
}