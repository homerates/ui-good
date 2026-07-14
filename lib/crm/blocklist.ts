// lib/crm/blocklist.ts
// Decision 7: Fair-lending compliance classifier.
//
// Uses Grok AI classification rather than a hardcoded pattern list.
// The prompt encodes ECOA/FHA/FCRA protected-category logic; the model handles
// misspellings, slang, indirect language, and any terminology variant.
//
// Pattern maintenance is now prompt maintenance — if coverage needs to expand,
// update CLASSIFICATION_PROMPT, not a pattern array.

import type { CrmKeyFact } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlocklistHit {
    blocked:        true;
    field:          string;
    label:          string;
    category:       string;
    truncatedValue: string;
}

export type BlocklistResult = BlocklistHit | { blocked: false };

// ── Prompt ────────────────────────────────────────────────────────────────────

const CLASSIFICATION_PROMPT = `You are a fair-lending compliance classifier for a mortgage origination platform. Your only job is to detect whether the provided text references a protected characteristic under ECOA (Equal Credit Opportunity Act), FHA (Fair Housing Act), or FCRA.

Protected categories under these laws:
- race or color: any specific race, racial descriptor, or racial slur
- national_origin: country of origin, immigration/citizenship status, language spoken at home, visa status
- religion: any specific religion, religious practice, place of worship, or religious affiliation
- sex: sex, gender identity, sexual orientation (including LGBTQ+ references)
- familial_status: pregnancy (any spelling or slang), having children, family composition, planning a family, parental leave
- disability: physical or mental health condition, mobility limitation, chronic illness, medical diagnosis
- age: when referenced as a lending qualifier (e.g. "too old to qualify", "too young to buy")
- marital_status: married, divorced, separated, widowed, single — when used as a personal descriptor about the borrower
- public_assistance: receiving government benefits or assistance programs as income

Classify as BLOCKED if the text names or describes any of the above categories about a specific borrower — including misspellings, slang, abbreviations, or indirect language that clearly references a protected category.

Classify as NOT BLOCKED if the text:
- Discusses mortgage scenarios, purchase price, down payment, rates, or loan types
- References property details, neighborhoods, market conditions, or transaction timelines
- Mentions neutral life events (job change, relocation, promotion, retirement, new job)
- Uses mortgage industry terms (PITI, LTV, DTI, pre-approval, escrow, closing costs, etc.)
- Asks about products, programs, or eligibility criteria in general terms

Return ONLY valid JSON with no explanation:
{ "blocked": boolean, "category": string | null, "reason": string | null }

category must be one of: "race", "national_origin", "religion", "sex", "familial_status", "disability", "age", "marital_status", "public_assistance" — or null if not blocked.
reason is a short phrase describing the trigger (e.g. "references pregnancy") — or null if not blocked.`;

// ── AI classification ─────────────────────────────────────────────────────────

interface ClassificationResult {
    blocked:  boolean;
    category: string | null;
    reason:   string | null;
}

/** Thrown when the classifier API is unreachable after retries.
 *  Callers must catch this and return a 503 — never treat it as a pass. */
export class ClassifierUnavailableError extends Error {
    constructor() { super('compliance classifier unavailable'); this.name = 'ClassifierUnavailableError'; }
}

async function classifyText(text: string): Promise<ClassificationResult> {
    // Two attempts — one immediate retry on any failure before failing closed.
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const response = await fetch('https://api.x.ai/v1/chat/completions', {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model:           'grok-4-1-fast-non-reasoning',
                    temperature:     0,
                    max_tokens:      80,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: CLASSIFICATION_PROMPT },
                        { role: 'user',   content: text.slice(0, 4000) },
                    ],
                }),
                signal: AbortSignal.timeout(8_000),
            });

            if (!response.ok) throw new Error(`xAI ${response.status}`);

            const json   = await response.json();
            const raw    = (json.choices?.[0]?.message?.content ?? '{}') as string;
            const parsed = JSON.parse(raw) as Partial<ClassificationResult>;

            return {
                blocked:  parsed.blocked === true,
                category: typeof parsed.category === 'string' ? parsed.category : null,
                reason:   typeof parsed.reason   === 'string' ? parsed.reason   : null,
            };
        } catch (err) {
            lastErr = err;
            console.warn(`[D7 classifier] attempt ${attempt} failed:`, (err as any)?.message ?? err);
        }
    }

    // Both attempts failed — fail CLOSED. Do not pass the message through.
    // Callers receive ClassifierUnavailableError and must return 503.
    console.error('[D7 classifier] unavailable after 2 attempts:', (lastErr as any)?.message ?? lastErr);
    throw new ClassifierUnavailableError();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Extracts freeform text fields from a CrmKeyFact array for classification.
 *  Excludes property addresses and competitor names — not protected-characteristic risk. */
export function extractFreeformFields(subject: string, facts: CrmKeyFact[]): Array<{ field: string; value: string }> {
    const out: Array<{ field: string; value: string }> = [];
    if (subject.trim()) out.push({ field: 'subject', value: subject });
    for (const f of facts) {
        switch (f.key) {
            case 'life_event':           out.push({ field: 'life_event.event',               value: f.event });       break;
            case 'preference_expressed': out.push({ field: 'preference_expressed.preference', value: f.preference }); break;
            case 'concern_raised':       out.push({ field: 'concern_raised.concern',          value: f.concern });     break;
            case 'concern_resolved':     out.push({ field: 'concern_resolved.concern',        value: f.concern });     break;
            case 'note':                 out.push({ field: 'note.text',                       value: f.text });        break;
        }
    }
    return out;
}

/** AI-based fair-lending classifier. Async — await at all call sites.
 *  Concatenates all field values and classifies as a single context block. */
export async function checkFairLendingBlocklist(
    fields: Array<{ field: string; value: string }>,
): Promise<BlocklistResult> {
    if (fields.length === 0) return { blocked: false };

    const combinedText = fields.map(f => f.value).join('\n').trim();
    if (!combinedText) return { blocked: false };

    const result = await classifyText(combinedText);
    if (!result.blocked) return { blocked: false };

    // Attribute to the first field if only one; otherwise "content"
    const field = fields.length === 1 ? fields[0].field : 'content';

    return {
        blocked:        true,
        field,
        label:          result.reason ?? result.category ?? 'protected characteristic',
        category:       result.category ?? 'unknown',
        truncatedValue: combinedText.slice(0, 120),
    };
}
