#!/usr/bin/env node
/**
 * Export: CA DRE pro_directory → Name + URN CSV for email merge
 *
 * Pulls every ca_dre record from pro_directory and writes:
 *   tools/dre-email-list.csv   →  name, urn
 *
 * The URN is the DRE license number (source_id), formatted as:
 *   ca_dre:{license_number}
 * Use this as the stable key when adding email addresses, then run:
 *   node --env-file=.env.local tools/import-dre-emails.mjs
 *
 * ── RUN ───────────────────────────────────────────────────────────────────────
 *   node --env-file=.env.local tools/export-dre-email-list.mjs
 *   node --env-file=.env.local tools/export-dre-email-list.mjs --missing-only
 *   (--missing-only: skip records that already have an email in the DB)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import { createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MISSING_ONLY = process.argv.includes('--missing-only');
const OUTPUT_CSV   = path.resolve(__dirname, 'dre-email-list.csv');
const PAGE_SIZE    = 1000;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Missing env vars. Run with: node --env-file=.env.local tools/export-dre-email-list.mjs');
  process.exit(1);
}

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const out = createWriteStream(OUTPUT_CSV, { encoding: 'utf8' });
out.write('name,urn\n');

let offset = 0;
let totalWritten = 0;

console.log(`\n📤  Exporting CA DRE directory → ${OUTPUT_CSV}`);
if (MISSING_ONLY) console.log('📌  --missing-only: skipping records with existing email');
console.log('');

while (true) {
  let query = sb
    .from('pro_directory')
    .select('name, source_id')
    .eq('source', 'ca_dre')
    .not('name', 'is', null)
    .order('name', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (MISSING_ONLY) {
    query = query.is('email', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`\n❌  Supabase error at offset ${offset}: ${error.message}`);
    process.exit(1);
  }

  if (!data || data.length === 0) break;

  for (const row of data) {
    const urn = `ca_dre:${row.source_id}`;
    out.write(`${escapeCsv(row.name)},${escapeCsv(urn)}\n`);
    totalWritten++;
  }

  process.stdout.write(`\r  ✓  ${totalWritten.toLocaleString()} exported...`);

  if (data.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

out.end();
console.log(`\n\n─────────────────────────────────────────`);
console.log(`Records exported:  ${totalWritten.toLocaleString()}`);
console.log(`Output file:       ${OUTPUT_CSV}`);
console.log(`─────────────────────────────────────────`);
console.log('✓  Done — add email column, then run: node --env-file=.env.local tools/import-dre-emails.mjs');
