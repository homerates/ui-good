#!/usr/bin/env node
// Preflight checks — run before every push. A non-zero exit blocks the push.

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

let failed = false;

function fail(msg) {
    console.error(`\n❌ PREFLIGHT FAIL: ${msg}`);
    failed = true;
}

// ── Rule: answerMarkdown must use buildAnswerMarkdown(), never raw literals ───
// Any new `**Answer**\n${` literal in the answers routes means the helper was
// bypassed and format drift will reoccur.
const ANSWER_FILES = [
    'app/api/answers/route.ts',
    'app/api/answers/scenario/route.ts',
];

for (const file of ANSWER_FILES) {
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    // Match backtick string literals containing **Answer**\n${ (the raw pattern)
    const rawPattern = /`\*\*Answer\*\*\\n\$\{/g;
    const matches = src.match(rawPattern);
    if (matches) {
        fail(
            `${file} has ${matches.length} raw \`**Answer**\\n\${...\` literal(s).\n` +
            `  Use buildAnswerMarkdown() from lib/answerFormat.ts instead.\n` +
            `  This rule prevents the "**Answer** + ## headings" format regression.`
        );
    }
}

if (failed) process.exit(1);
process.exit(0);
