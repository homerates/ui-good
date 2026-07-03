#!/usr/bin/env node
/**
 * tools/check-data-freshness.mjs
 *
 * Checks each dataset against its documented staleness threshold (DATA_INTEGRITY_STANDARDS.md).
 * Run before any lender demo, when sharing output externally, or after any ETL refresh.
 *
 * Usage:
 *   node --env-file=.env.local tools/check-data-freshness.mjs
 *
 * Exit codes:
 *   0 — all datasets fresh (or WARNING only)
 *   1 — at least one dataset is STALE
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const NOW = new Date();

function monthsAgo(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  return (NOW - d) / (1000 * 60 * 60 * 24 * 30.44);
}

function yearAge(year) {
  if (!year) return Infinity;
  // Stale if data_year is more than one full year behind current year
  return NOW.getFullYear() - year;
}

const FRESH   = '✓ FRESH  ';
const WARN    = '⚠ WARNING';
const STALE   = '✗ STALE  ';

function status(condition_fresh, condition_warn) {
  if (condition_fresh) return FRESH;
  if (condition_warn)  return WARN;
  return STALE;
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function checkHudAmi() {
  const { data } = await sb
    .from('hud_features')
    .select('fiscal_year, updated_at')
    .order('fiscal_year', { ascending: false })
    .limit(1)
    .maybeSingle();

  const age = monthsAgo(data?.updated_at);
  const s = status(age < 14, age < 20);
  const fy = data?.fiscal_year ?? 'unknown';
  const loaded = data?.updated_at?.slice(0, 10) ?? 'never';
  console.log(`${s}  HUD Area Median Income         FY${fy}, loaded ${loaded} (${Math.round(age)}mo ago) [threshold: 14mo]`);
  if (data?.fiscal_year < NOW.getFullYear() - 1) {
    console.log(`           ↳ NOTE: max fiscal_year ${fy} is ${NOW.getFullYear() - fy} year(s) behind current year — some counties may be on older data`);
  }
  return s !== STALE;
}

async function checkGseAmi() {
  const { data } = await sb
    .from('gse_ami')
    .select('fiscal_year, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const age = monthsAgo(data?.updated_at);
  const s = status(age < 14, age < 20);
  const fy = data?.fiscal_year ?? 'unknown';
  const loaded = data?.updated_at?.slice(0, 10) ?? 'never';
  console.log(`${s}  FHFA GSE AMI                   FY${fy}, loaded ${loaded} (${Math.round(age)}mo ago) [threshold: 14mo]`);
  return s !== STALE;
}

async function checkFfiecTracts() {
  const { data } = await sb
    .from('ffiec_census_tracts')
    .select('data_year, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const age = monthsAgo(data?.updated_at);
  const yr  = data?.data_year ?? 'unknown';
  const loaded = data?.updated_at?.slice(0, 10) ?? 'never';
  // Warn if data_year is more than 1yr behind; stale if more than 2yr
  const yrAge = yearAge(yr);
  const s = status(age < 14 && yrAge <= 1, age < 20 && yrAge <= 2);
  console.log(`${s}  FFIEC Tract Income Level        data_year=${yr}, loaded ${loaded} (${Math.round(age)}mo ago) [threshold: 14mo]`);

  // D&U is stored in the same table — just note the data_year
  const { count: duCount } = await sb
    .from('ffiec_census_tracts')
    .select('*', { count: 'exact', head: true })
    .eq('distressed_underserved', true);
  console.log(`${FRESH}  FFIEC D&U Designations         ${duCount ?? 0} tracts flagged in same table (data_year=${yr})`);
  return s !== STALE;
}

async function checkFfiecMfi() {
  const { data } = await sb
    .from('ffiec_mfi')
    .select('data_year')
    .order('data_year', { ascending: false })
    .limit(1)
    .maybeSingle();

  const yr = data?.data_year ?? 'unknown';
  const yrAge = yearAge(yr);
  const s = status(yrAge <= 1, yrAge <= 2);
  console.log(`${s}  FFIEC Estimated MFI             data_year=${yr} (${yrAge}yr behind current) [threshold: data_year ≤ current−1]`);
  if (yr !== 'unknown') {
    console.log(`           ↳ KNOWN ISSUE: nonmetro (msa_md=99999) MFI lookup lacks state_fips filter — see DATA_INTEGRITY_STANDARDS.md`);
  }
  return s !== STALE;
}

async function checkFema() {
  const { data } = await sb
    .from('fema_risk')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const age = monthsAgo(data?.updated_at);
  const loaded = data?.updated_at?.slice(0, 10) ?? 'never';
  const s = status(age < 30, age < 36);
  console.log(`${s}  FEMA National Risk Index        2024 NRI release, loaded ${loaded} (${Math.round(age)}mo ago) [threshold: 30mo]`);
  return s !== STALE;
}

async function checkDpa() {
  const { count } = await sb
    .from('dpa_programs')
    .select('*', { count: 'exact', head: true })
    .eq('active', true);

  const s = count > 0 ? FRESH : WARN;
  console.log(`${s}  DPA Programs                   ${count ?? 0} active programs (platform-managed, no external vintage)`);
  if (!count) {
    console.log(`           ↳ 0 active programs: dpaMatchCount will always be 0 until lenders onboard programs`);
  }
  // DPA never STALE — it's platform inventory, not an external dataset
  return true;
}

function checkLoanLimits() {
  // Static TS files — no DB check possible. Manual version inspection.
  const expectedYear = NOW.getFullYear();
  // Read the year from the filename / constant pattern
  const fileYear = 2026; // from lib/loanLimitsNational2026.ts filename
  const yrAge = expectedYear - fileYear;
  const s = status(yrAge <= 1, yrAge <= 2);
  console.log(`${s}  Conforming Loan Limits          CY${fileYear} (static TS files) [check manually each November]`);
  if (yrAge > 1) {
    console.log(`           ↳ lib/loanLimitsNational2026.ts + lib/loanLimits2026.ts need update for CY${expectedYear}`);
  }
  return s !== STALE;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nData Freshness Check — ${NOW.toISOString().slice(0, 10)}\n`);
console.log('─'.repeat(80));

const results = await Promise.all([
  checkHudAmi(),
  checkGseAmi(),
  checkFfiecTracts(),
  checkFfiecMfi(),
  checkFema(),
  checkDpa(),
]);
const loanLimitsOk = checkLoanLimits();

console.log('─'.repeat(80));

const allOk = results.every(Boolean) && loanLimitsOk;
if (allOk) {
  console.log('\nAll datasets within freshness thresholds.\n');
  process.exit(0);
} else {
  console.log('\nOne or more datasets are STALE. Refresh before sharing output externally.\n');
  process.exit(1);
}
