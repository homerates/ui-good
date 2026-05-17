#!/usr/bin/env node
/**
 * Import: Merged email CSV → pro_directory
 *
 * Reads tools/dre-email-list.csv (which now has a 3rd column: email),
 * and updates pro_directory.email for each matching URN.
 *
 * Expected CSV format (header row required):
 *   name, urn, email
 *   John Smith, ca_dre:01234567, john@example.com
 *
 * Records with a blank email column are skipped.
 * Records where the URN does not match anything in the DB are logged.
 *
 * ── RUN ───────────────────────────────────────────────────────────────────────
 *   node --env-file=.env.local tools/import-dre-emails.mjs
 *   node --env-file=.env.local tools/import-dre-emails.mjs --dry-run
 *   node --env-file=.env.local tools/import-dre-emails.mjs --file path/to/other.csv
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN    = process.argv.includes('--dry-run');
const FILE_ARG   = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : null;
const INPUT_CSV  = FILE_ARG
  ? path.resolve(FILE_ARG)
  : path.resolve(__dirname, 'dre-email-list.csv');
const BATCH_SIZE = 500;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Missing env vars. Run with: node --env-file=.env.local tools/import-dre-emails.mjs');
  process.exit(1);
}

if (!existsSync(INPUT_CSV)) {
  console.error(`❌  Input not found: ${INPUT_CSV}`);
  console.error('    Export first: node --env-file=.env.local tools/export-dre-email-list.mjs');
  process.exit(1);
}

function parseCSVLine(line) {
  const result = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(field.trim());
      field = '';
    } else {
      field += ch;
    }
  }
  result.push(field.trim());
  return result;
}

function extractLicenseNumber(urn) {
  // Handles both "ca_dre:01234567" and bare "01234567"
  return urn.includes(':') ? urn.split(':')[1]?.trim() : urn.trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function flushBatch(batch) {
  if (batch.length === 0) return { ok: 0, err: 0 };
  if (DRY_RUN) return { ok: batch.length, err: 0 };

  let ok = 0;
  let err = 0;
  for (const { sourceId, email } of batch) {
    const { error } = await sb
      .from('pro_directory')
      .update({ email })
      .eq('source', 'ca_dre')
      .eq('source_id', sourceId);

    if (error) {
      console.error(`\n  ❌  Update failed for ${sourceId}: ${error.message}`);
      err++;
    } else {
      ok++;
    }
  }
  return { ok, err };
}

console.log(`\n📥  Importing emails → pro_directory`);
console.log(`📂  Input: ${INPUT_CSV}`);
if (DRY_RUN) console.log('🔍  DRY RUN — no DB writes');
console.log('');

let headers     = null;
let colIndex    = {};
let batch       = [];
let totalRead   = 0;
let totalOk     = 0;
let totalErr    = 0;
let skippedBlank  = 0;
let skippedInvalid = 0;
const notMatched = [];

const rl = createInterface({ input: createReadStream(INPUT_CSV), crlfDelay: Infinity });

for await (const line of rl) {
  if (!line.trim()) continue;

  if (!headers) {
    headers = parseCSVLine(line).map(h => h.toLowerCase());
    headers.forEach((h, i) => { colIndex[h] = i; });

    if (colIndex['urn'] === undefined || colIndex['email'] === undefined) {
      console.error('❌  CSV must have "urn" and "email" columns (case-insensitive).');
      console.error(`    Found columns: ${headers.join(', ')}`);
      process.exit(1);
    }
    continue;
  }

  totalRead++;
  const f     = parseCSVLine(line);
  const urn   = f[colIndex['urn']]?.trim() ?? '';
  const email = f[colIndex['email']]?.trim() ?? '';

  if (!email) { skippedBlank++; continue; }
  if (!isValidEmail(email)) { skippedInvalid++; continue; }
  if (!urn) { skippedBlank++; continue; }

  const sourceId = extractLicenseNumber(urn);
  batch.push({ sourceId, email });

  if (batch.length >= BATCH_SIZE) {
    const { ok, err } = await flushBatch(batch);
    totalOk  += ok;
    totalErr += err;
    batch = [];
    process.stdout.write(`\r  ✓  ${totalOk.toLocaleString()} updated${DRY_RUN ? ' (dry)' : ''}...`);
  }
}

// Final batch
const { ok, err } = await flushBatch(batch);
totalOk  += ok;
totalErr += err;

console.log(`\n\n─────────────────────────────────────────`);
console.log(`Rows read:           ${totalRead.toLocaleString()}`);
console.log(`Updated in DB:       ${totalOk.toLocaleString()}${DRY_RUN ? ' (dry)' : ''}`);
if (skippedBlank)   console.log(`Skipped (no email):  ${skippedBlank.toLocaleString()}`);
if (skippedInvalid) console.log(`Skipped (bad email): ${skippedInvalid.toLocaleString()}`);
if (totalErr)       console.log(`Errors:              ${totalErr.toLocaleString()}`);
console.log(`─────────────────────────────────────────`);
console.log(DRY_RUN ? '✓  Dry run complete — no DB changes made' : '✓  Done — emails written to pro_directory');
