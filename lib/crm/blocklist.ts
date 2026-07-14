// lib/crm/blocklist.ts
// Decision 7: shared fair-lending blocklist — used by POST /api/crm/touchpoints
// and POST /api/crm/notes. See COMPLIANCE_DECISIONS.md Decision 7.
//
// Pattern maintenance: add entries here when blocked saves reveal gaps. Each entry
// carries a human-readable label (logged to crm_compliance_events) and a category
// (for aggregated review). Err toward word-boundary precision (\b) to reduce false positives.

import type { CrmKeyFact } from './types';

export const CRM_FAIR_LENDING_BLOCKLIST: Array<{ pattern: RegExp; label: string; category: string }> = [
    // Race / ethnicity
    { pattern: /\bracial\b/i,               label: 'racial',            category: 'race' },
    { pattern: /\bethnicit(y|ies)\b/i,      label: 'ethnicity',         category: 'race' },
    { pattern: /\bHispanic\b/i,             label: 'Hispanic',          category: 'race_national_origin' },
    { pattern: /\bLatino\b/i,               label: 'Latino',            category: 'race_national_origin' },
    { pattern: /\bLatina\b/i,               label: 'Latina',            category: 'race_national_origin' },
    { pattern: /\bAfrican[\s-]American\b/i, label: 'African American',  category: 'race' },
    { pattern: /\bNative[\s-]American\b/i,  label: 'Native American',   category: 'race_national_origin' },
    { pattern: /\bindigenous\b/i,           label: 'indigenous',        category: 'race' },
    // Religion
    { pattern: /\breligion\b/i,             label: 'religion',          category: 'religion' },
    { pattern: /\breligious\b/i,            label: 'religious',         category: 'religion' },
    { pattern: /\bMuslim\b/i,               label: 'Muslim',            category: 'religion' },
    { pattern: /\bIslam(ic)?\b/i,           label: 'Islam/Islamic',     category: 'religion' },
    { pattern: /\bJewish\b/i,               label: 'Jewish',            category: 'religion' },
    { pattern: /\bJudaism\b/i,              label: 'Judaism',           category: 'religion' },
    { pattern: /\bCatholic\b/i,             label: 'Catholic',          category: 'religion' },
    { pattern: /\bHindu(ism)?\b/i,          label: 'Hindu/Hinduism',    category: 'religion' },
    { pattern: /\bBuddhis[mt]\b/i,          label: 'Buddhist/Buddhism', category: 'religion' },
    { pattern: /\bMormon\b/i,               label: 'Mormon',            category: 'religion' },
    { pattern: /\bSikh\b/i,                 label: 'Sikh',              category: 'religion' },
    { pattern: /\bsynagogue\b/i,            label: 'synagogue',         category: 'religion' },
    { pattern: /\bmosque\b/i,               label: 'mosque',            category: 'religion' },
    // National origin / immigration
    { pattern: /\bimmigrant\b/i,            label: 'immigrant',         category: 'national_origin' },
    { pattern: /\bundocumented\b/i,         label: 'undocumented',      category: 'national_origin' },
    { pattern: /\bcitizenship\b/i,          label: 'citizenship',       category: 'national_origin' },
    { pattern: /\bgreen[\s-]card\b/i,       label: 'green card',        category: 'national_origin' },
    { pattern: /\bnational[\s-]origin\b/i,  label: 'national origin',   category: 'national_origin' },
    // Marital status
    { pattern: /\bmarital\b/i,              label: 'marital',           category: 'marital_status' },
    { pattern: /\bdivorced?\b/i,            label: 'divorce/divorced',  category: 'marital_status' },
    { pattern: /\bwidow(er|ed)?\b/i,        label: 'widow/widowed',     category: 'marital_status' },
    // Familial status (ECOA / FHA)
    { pattern: /\bpregnant\b/i,             label: 'pregnant',          category: 'familial_status' },
    { pattern: /\bpregnancy\b/i,            label: 'pregnancy',         category: 'familial_status' },
    { pattern: /\bexpecting[\s\w]{0,10}baby\b/i, label: 'expecting baby', category: 'familial_status' },
    { pattern: /\bfamilial\b/i,             label: 'familial',          category: 'familial_status' },
    { pattern: /\bfamily[\s-]size\b/i,      label: 'family size',       category: 'familial_status' },
    // Disability
    { pattern: /\bdisabilit(y|ies)\b/i,     label: 'disability',        category: 'disability' },
    { pattern: /\bdisabled\b/i,             label: 'disabled',          category: 'disability' },
    { pattern: /\bhandicap(ped)?\b/i,       label: 'handicap',          category: 'disability' },
    { pattern: /\bwheelchair\b/i,           label: 'wheelchair',        category: 'disability' },
    // Sex / gender
    { pattern: /\bgender\b/i,               label: 'gender',            category: 'sex' },
    { pattern: /\bLGBTQ\+?\b/i,             label: 'LGBTQ',             category: 'sex' },
    { pattern: /\btransgender\b/i,          label: 'transgender',       category: 'sex' },
    // Age as qualification basis
    { pattern: /\bage[\s-](discrimination|discriminatory|based|qualify|limit|issue)\b/i, label: 'age-as-qualifier',     category: 'age' },
    { pattern: /\btoo\s+(old|young)\s+to\s+(qualify|buy|borrow|afford)\b/i,             label: 'too old/young to qualify', category: 'age' },
];

export interface BlocklistHit {
    blocked:        true;
    field:          string;
    label:          string;
    category:       string;
    truncatedValue: string;
}

export type BlocklistResult = BlocklistHit | { blocked: false };

/** Scan freeform fields for protected-characteristic terms.
 *  property_of_interest.address and competitor_mentioned.competitor intentionally excluded:
 *  addresses and business names carry no protected-characteristic risk. */
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

export function checkFairLendingBlocklist(fields: Array<{ field: string; value: string }>): BlocklistResult {
    for (const { field, value } of fields) {
        for (const entry of CRM_FAIR_LENDING_BLOCKLIST) {
            if (entry.pattern.test(value)) {
                return {
                    blocked:        true,
                    field,
                    label:          entry.label,
                    category:       entry.category,
                    truncatedValue: value.slice(0, 120),
                };
            }
        }
    }
    return { blocked: false };
}
