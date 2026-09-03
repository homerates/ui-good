#!/usr/bin/env node
// scripts/check-gateway-import-boundary.mjs
//
// Additional defense against future architectural drift for the HomeRates
// Intelligence Gateway (see docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_ARCHITECTURE.md
// section 13, LOCKED). This is NOT the runtime security boundary -- the
// corpus-only wrapper's narrow implementation is that, by construction. This
// script exists to catch a *future* change (a new live-provider import
// creeping into lib/gateway/) before it ships, by failing the build.
//
// Scans every lib/gateway/*.ts file EXCEPT corpusOnlyIntelligence.ts itself
// (which is allowed, and required, to import lib/propertyIntelligence.ts)
// for any of the forbidden import paths below.

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gatewayDir = join(__dirname, '..', 'lib', 'gateway');

const ALLOWED_TO_IMPORT_PROPERTY_INTELLIGENCE = new Set(['corpusOnlyIntelligence.ts']);

const FORBIDDEN_PATTERNS = [
  { pattern: /from\s+['"].*\/propertyIntelligence['"]/, label: 'lib/propertyIntelligence.ts (direct import outside corpusOnlyIntelligence.ts)' },
  { pattern: /from\s+['"].*\/api\/property\/lookup['"]/, label: 'app/api/property/lookup' },
  { pattern: /from\s+['"].*\/api\/beta\/grok-property['"]/, label: 'app/api/beta/grok-property' },
  { pattern: /from\s+['"].*tavily.*['"]/i, label: 'Tavily client' },
  { pattern: /from\s+['"]@tavily\/core['"]/, label: '@tavily/core' },
  { pattern: /\bfetch\(\s*['"`]https?:\/\/(?!.*chat\.homerates\.ai)/, label: 'a direct external fetch() call' },
];

let violations = [];

for (const file of readdirSync(gatewayDir)) {
  if (!file.endsWith('.ts')) continue;
  const fullPath = join(gatewayDir, file);
  const content = readFileSync(fullPath, 'utf-8');

  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (label.startsWith('lib/propertyIntelligence.ts') && ALLOWED_TO_IMPORT_PROPERTY_INTELLIGENCE.has(file)) {
      continue; // the one sanctioned exception
    }
    if (pattern.test(content)) {
      violations.push(`${file}: forbidden reference to ${label}`);
    }
  }
}

if (violations.length > 0) {
  console.error('[gateway import boundary] FAILED:');
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
} else {
  console.log('[gateway import boundary] OK — no forbidden imports found in lib/gateway/*.ts');
  process.exit(0);
}
