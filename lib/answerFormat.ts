// lib/answerFormat.ts
// Single source of truth for answerMarkdown wrapping.
//
// FORMAT RULE (do not break without updating tests below):
//   • If the content already contains ## headings → return as-is
//     (AI-authored structured responses manage their own sections)
//   • Otherwise → prepend "**Answer**\n" so the GrokCard bold-section
//     renderer can parse it into sections
//
// WHY THIS EXISTS: scattered inline `\`**Answer**\n${text}\`` patterns
// caused repeated regressions when AI content with ## headings got wrapped
// in the **Answer** prefix, producing a mixed/broken format.

export function buildAnswerMarkdown(text: string): string {
    if (!text) return text;
    // If content has any ## heading, it self-organises — don't wrap
    if (/^##\s/m.test(text)) return text;
    return `**Answer**\n${text}`;
}

// ── Self-tests (run at cold-start via answers/route.ts) ───────────────────────

interface FormatTestResult { passed: boolean; failures: string[] }

export function runFormatTests(): FormatTestResult {
    const failures: string[] = [];

    function assert(label: string, actual: string, check: (s: string) => boolean) {
        if (!check(actual)) failures.push(`${label}: got ${JSON.stringify(actual.slice(0, 80))}`);
    }

    // 1. Plain text gets wrapped
    assert('plain text wrapped', buildAnswerMarkdown('Hello world'),
        s => s.startsWith('**Answer**\n'));

    // 2. Text with ## heading NOT wrapped (no **Answer** prefix)
    assert('## heading not wrapped', buildAnswerMarkdown('## My Section\nsome text'),
        s => !s.startsWith('**Answer**'));

    // 3. Text with ## heading mid-content NOT wrapped
    assert('mid-content ## not wrapped',
        buildAnswerMarkdown('Some intro\n\n## Section\nDetails'),
        s => !s.startsWith('**Answer**'));

    // 4. Empty string passes through unchanged
    assert('empty string passthrough', buildAnswerMarkdown(''),
        s => s === '');

    // 5. Text with # (h1) still gets wrapped (only ## triggers)
    assert('h1 still gets wrapped', buildAnswerMarkdown('# Title\nsome text'),
        s => s.startsWith('**Answer**\n'));

    return { passed: failures.length === 0, failures };
}
