#!/usr/bin/env node
// tools/filter-dre-csv.mjs
//
// Filters the raw CA DRE bulk download to only the records we want
// for the professional directory: Licensed Brokers and Corporations only.
//
// Usage (run in VS Code terminal):
//   node tools/filter-dre-csv.mjs <input.csv> [output.csv]
//
// Example:
//   node tools/filter-dre-csv.mjs ~/Downloads/RESL_Public_Full.csv tools/dre-brokers.csv
//
// If no output path is given, writes to tools/dre-brokers.csv

import fs from 'fs';
import path from 'path';
import readline from 'readline';

// ── Config ────────────────────────────────────────────────────────────────────
const KEEP_TYPES   = new Set(['Broker', 'Corporation']);
const KEEP_STATUS  = new Set(['Licensed']);
// Only keep CA records (should all be CA DRE, but just in case)
const KEEP_STATE   = 'CA';

// Columns we actually need for pro_directory — drop the rest
const KEEP_COLS = [
  'lic_number',
  'lastname_primary',
  'firstname_secondary',
  'name_suffix',
  'lic_type',
  'lic_status',
  'lic_effective_date',
  'lic_expiration_date',
  'address_1',
  'address_2',
  'city',
  'state',
  'zip_code',
  'county_name',
  // Related officer info (useful for Corp → officer name)
  'related_lic_number',
  'related_lastname_primary',
  'related_firstname_secondary',
  'related_name_suffix',
  'related_lic_type',
];

// ── Args ──────────────────────────────────────────────────────────────────────
const [,, inputArg, outputArg] = process.argv;
if (!inputArg) {
  console.error('Usage: node tools/filter-dre-csv.mjs <input.csv> [output.csv]');
  process.exit(1);
}

const inputPath  = path.resolve(inputArg);
const outputPath = path.resolve(outputArg ?? 'tools/dre-brokers.csv');

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

console.log(`Input:  ${inputPath}`);
console.log(`Output: ${outputPath}`);
console.log(`Filters: lic_type in [${[...KEEP_TYPES].join(', ')}] AND lic_status in [${[...KEEP_STATUS].join(', ')}]`);
console.log('Scanning...\n');

// ── CSV parse helpers ─────────────────────────────────────────────────────────
// Handles basic quoted CSV (no embedded newlines in fields, which DRE doesn't use)
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

function escapeCSVField(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Stream processing ─────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: fs.createReadStream(inputPath), crlfDelay: Infinity });
const out = fs.createWriteStream(outputPath);

let headers = null;
let keepIndices = null;
let colIndex = {}; // header name → index in original

let totalRead   = 0;
let totalKept   = 0;
let skippedType = 0;
let skippedStat = 0;

const STATS = { Broker: 0, Corporation: 0 };

rl.on('line', (line) => {
  if (!line.trim()) return;

  if (!headers) {
    // First line = header row
    headers = parseCSVLine(line);
    headers.forEach((h, i) => { colIndex[h] = i; });

    // Validate required columns exist
    const required = ['lic_type', 'lic_status', 'lic_number', 'city', 'state'];
    for (const col of required) {
      if (colIndex[col] === undefined) {
        console.error(`Missing required column: "${col}". Check that the file uses the expected DRE format.`);
        console.error('Found columns:', headers.slice(0, 8).join(', '), '...');
        process.exit(1);
      }
    }

    // Determine which output columns exist (silently skip missing ones)
    keepIndices = KEEP_COLS.map(col => ({ col, idx: colIndex[col] ?? -1 }));
    const missing = keepIndices.filter(c => c.idx === -1).map(c => c.col);
    if (missing.length) console.warn(`Note: columns not found in file (will be empty): ${missing.join(', ')}`);

    // Write output header
    out.write(KEEP_COLS.join(',') + '\n');
    return;
  }

  totalRead++;
  const fields = parseCSVLine(line);

  const licType   = fields[colIndex['lic_type']]   ?? '';
  const licStatus = fields[colIndex['lic_status']]  ?? '';
  const state     = fields[colIndex['state']]        ?? '';

  if (!KEEP_TYPES.has(licType))   { skippedType++; return; }
  if (!KEEP_STATUS.has(licStatus)) { skippedStat++; return; }
  // Optional: skip non-CA (uncomment if needed)
  // if (state !== KEEP_STATE)        { return; }

  STATS[licType] = (STATS[licType] ?? 0) + 1;
  totalKept++;

  const row = keepIndices.map(({ idx }) => escapeCSVField(idx >= 0 ? fields[idx] : ''));
  out.write(row.join(',') + '\n');
});

rl.on('close', () => {
  out.end();
  const pct = totalRead > 0 ? ((totalKept / totalRead) * 100).toFixed(1) : '0';

  console.log('─────────────────────────────────');
  console.log(`Total rows read:    ${totalRead.toLocaleString()}`);
  console.log(`Kept (output):      ${totalKept.toLocaleString()} (${pct}%)`);
  console.log(`  Brokers:          ${(STATS.Broker ?? 0).toLocaleString()}`);
  console.log(`  Corporations:     ${(STATS.Corporation ?? 0).toLocaleString()}`);
  console.log(`Skipped (type):     ${skippedType.toLocaleString()}`);
  console.log(`Skipped (status):   ${skippedStat.toLocaleString()}`);
  console.log('─────────────────────────────────');
  console.log(`Output written to:  ${outputPath}`);

  // Estimate output file size
  try {
    const bytes = fs.statSync(outputPath).size;
    const kb = (bytes / 1024).toFixed(0);
    console.log(`Output file size:   ${kb} KB`);
  } catch {}
});
