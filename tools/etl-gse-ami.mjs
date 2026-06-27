/**
 * ETL: FHFA 2026 Area Median Income — county level
 *
 * Source: Freddie Mac MFI raw file (same FHFA AMI Fannie Mae uses for HomeReady)
 * https://sf.freddiemac.com/docs/csv/2026-mfi-raw-file.csv
 *
 * The CSV is census-tract level; AMI is uniform within each county so we
 * deduplicate to one row per county FIPS and upsert into gse_ami.
 *
 * Run: node --env-file=.env.local tools/etl-gse-ami.mjs
 * Re-run annually when FHFA publishes new income limits (typically June).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase env vars'); process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const CSV_URL = 'https://sf.freddiemac.com/docs/csv/2026-mfi-raw-file.csv';
const FISCAL_YEAR = 2026;
const BATCH_SIZE = 500;

async function main() {
  console.log('\n🏦 GSE AMI ETL — FHFA FY2026 (Freddie Mac source)\n');

  process.stdout.write('  Downloading CSV from Freddie Mac...');
  const res = await fetch(CSV_URL, { headers: { 'Accept': 'text/csv' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${CSV_URL}`);
  const text = await res.text();
  console.log(' done');

  const lines = text.split('\n');
  const header = lines[0].split(',').map(h => h.trim());

  const stateIdx  = header.indexOf('STATE');
  const cntyIdx   = header.indexOf('CNTY');
  const mi2026Idx = header.indexOf('MI2026');

  if (stateIdx === -1 || cntyIdx === -1 || mi2026Idx === -1) {
    console.error('Could not find required columns in header:', header);
    process.exit(1);
  }

  console.log(`  Parsing ${lines.length.toLocaleString()} rows (census-tract level)...`);

  // Deduplicate to one AMI per county FIPS
  const countyMap = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',');
    const stateRaw = cols[stateIdx]?.trim();
    const cntyRaw  = cols[cntyIdx]?.trim();
    const amiRaw   = cols[mi2026Idx]?.trim();

    if (!stateRaw || !cntyRaw || !amiRaw) continue;

    const fips = stateRaw.padStart(2, '0') + cntyRaw.padStart(3, '0');
    const ami  = parseInt(amiRaw, 10);

    if (!countyMap.has(fips) && !isNaN(ami) && ami > 0) {
      countyMap.set(fips, ami);
    }
  }

  console.log(`  Unique counties found: ${countyMap.size.toLocaleString()}`);

  const rows = Array.from(countyMap.entries()).map(([county_fips, ami_fhfa]) => ({
    county_fips,
    ami_fhfa,
    fiscal_year: FISCAL_YEAR,
    updated_at: new Date().toISOString(),
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await sb
      .from('gse_ami')
      .upsert(batch, { onConflict: 'county_fips' });
    if (error) { console.error('\nUpsert error:', error); process.exit(1); }
    inserted += batch.length;
    process.stdout.write(`\r  Upserted ${inserted}/${rows.length} counties...`);
  }

  console.log(`\n\n✅ Done — ${rows.length} counties seeded into gse_ami (FHFA FY${FISCAL_YEAR})\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
