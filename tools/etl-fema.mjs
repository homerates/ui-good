/**
 * ETL: FEMA National Risk Index (NRI)
 *
 * Source: https://hazards.fema.gov/nri/Content/StaticDocFiles/NRI_Table_Counties.zip
 * FEMA OpenFEMA API: https://www.fema.gov/api/open/v1/nriCounties
 *
 * The NRI county dataset is a static CSV download — FEMA updates it ~annually.
 * This ETL fetches via the OpenFEMA API (no token required) and normalizes
 * composite + per-hazard scores into our fema_risk table.
 *
 * Run: node tools/etl-fema.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// OpenFEMA NRI county endpoint — paginates at 1000 records
// Full dataset ~3,234 counties
const FEMA_BASE = 'https://www.fema.gov/api/open/v1/nriCounties';
const PAGE_SIZE = 1000;

// FEMA NRI field mappings
// Composite risk index field: RISK_SCORE (0–100 normalized)
// Individual hazard risk score fields follow pattern: {HAZARD}_RISKS
const HAZARD_FIELDS = {
  hurricane:    'HRCN_RISKS',
  wildfire:     'WFIR_RISKS',
  flood:        'RFLD_RISKS',   // riverine flood
  coastal_flood:'CFLD_RISKS',
  earthquake:   'ERQK_RISKS',
  tornado:      'TRND_RISKS',
  hail:         'HAIL_RISKS',
  winter:       'WNTW_RISKS',
  drought:      'DRGT_RISKS',
  heat:         'HWAV_RISKS',   // heat wave
};

// Risk label from FEMA's RISK_RATNG field
function normalizeLabel(ratng) {
  if (!ratng) return 'Unknown';
  const map = {
    'Very Low': 'Very Low',
    'Relatively Low': 'Relatively Low',
    'Relatively Moderate': 'Relatively Moderate',
    'Relatively High': 'Relatively High',
    'Very High': 'Very High',
  };
  return map[ratng] ?? ratng;
}

// Derive insurance pressure tier from composite score + dominant hazard
function deriveInsurancePressure(composite, dominantHazard, scores) {
  // High-impact hazards for insurance
  const highImpact = ['hurricane', 'coastal_flood', 'wildfire', 'flood'];
  const isHighImpactDominant = highImpact.includes(dominantHazard);

  if (composite >= 75 && isHighImpactDominant) return 'very_high';
  if (composite >= 60 && isHighImpactDominant) return 'high';
  if (composite >= 60) return 'elevated';
  if (composite >= 40 && isHighImpactDominant) return 'elevated';
  if (composite >= 40) return 'moderate';
  return 'low';
}

// Estimate monthly insurance premium delta vs national average
// National avg homeowner insurance ~$150/mo. These are DELTAS on top.
function estimateInsuranceDelta(pressure) {
  const map = {
    low:       { low: 0,   high: 50  },
    moderate:  { low: 50,  high: 150 },
    elevated:  { low: 150, high: 350 },
    high:      { low: 350, high: 650 },
    very_high: { low: 500, high: 1200 },
  };
  return map[pressure] ?? map['low'];
}

async function fetchPage(skip) {
  const url = `${FEMA_BASE}?$skip=${skip}&$top=${PAGE_SIZE}&$select=STCOFIPS,COUNTY,STATE,RISK_SCORE,RISK_RATNG,HRCN_RISKS,WFIR_RISKS,RFLD_RISKS,CFLD_RISKS,ERQK_RISKS,TRND_RISKS,HAIL_RISKS,WNTW_RISKS,DRGT_RISKS,HWAV_RISKS`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`FEMA API error ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  const json = await res.json();
  return json.NriCounties ?? json.nriCounties ?? [];
}

function parseRow(row) {
  const fips = String(row.STCOFIPS ?? '').padStart(5, '0');
  if (!fips || fips === '00000') return null;

  // Build per-hazard score map
  const scores = {};
  for (const [name, field] of Object.entries(HAZARD_FIELDS)) {
    const v = parseFloat(row[field]);
    scores[name] = isNaN(v) ? null : Math.round(v * 10) / 10;
  }

  // Composite
  const composite = parseFloat(row.RISK_SCORE);
  const compositeNorm = isNaN(composite) ? null : Math.round(composite * 10) / 10;

  // Find dominant hazard (highest non-null score)
  let dominantHazard = null;
  let dominantScore = -1;
  for (const [name, score] of Object.entries(scores)) {
    if (score !== null && score > dominantScore) {
      dominantScore = score;
      dominantHazard = name;
    }
  }

  const pressure = compositeNorm !== null
    ? deriveInsurancePressure(compositeNorm, dominantHazard, scores)
    : 'low';
  const delta = estimateInsuranceDelta(pressure);

  return {
    county_fips:       fips,
    county_name:       row.COUNTY ?? null,
    state_abbr:        row.STATE ?? null,
    composite_score:   compositeNorm,
    risk_label:        normalizeLabel(row.RISK_RATNG),
    hurricane_score:   scores.hurricane,
    wildfire_score:    scores.wildfire,
    flood_score:       scores.flood ?? scores.coastal_flood,
    earthquake_score:  scores.earthquake,
    tornado_score:     scores.tornado,
    hail_score:        scores.hail,
    winter_score:      scores.winter,
    drought_score:     scores.drought,
    heat_score:        scores.heat,
    dominant_hazard:   dominantHazard,
    insurance_pressure: pressure,
    insurance_est_low:  delta.low,
    insurance_est_high: delta.high,
    updated_at:        new Date().toISOString(),
  };
}

async function run() {
  console.log('\n🌪  FEMA NRI ETL\n');

  let skip = 0;
  let totalFetched = 0;
  let totalUpserted = 0;
  let errors = 0;

  while (true) {
    process.stdout.write(`  Fetching records ${skip}–${skip + PAGE_SIZE - 1} ...`);
    try {
      const rows = await fetchPage(skip);
      if (!rows.length) {
        console.log(' done (no more records)');
        break;
      }

      const parsed = rows.map(parseRow).filter(Boolean);
      totalFetched += rows.length;

      if (parsed.length) {
        const { error } = await sb
          .from('fema_risk')
          .upsert(parsed, { onConflict: 'county_fips' });
        if (error) throw new Error(error.message);
        totalUpserted += parsed.length;
      }

      console.log(` ✓ ${parsed.length} counties upserted`);
      skip += PAGE_SIZE;

      if (rows.length < PAGE_SIZE) break; // last page
    } catch (err) {
      errors++;
      console.log(` ✗ ${err.message.slice(0, 120)}`);
      break;
    }

    // Brief pause between pages
    await new Promise(r => setTimeout(r, 200));
  }

  // Summary stats
  if (totalUpserted > 0) {
    const { data: stats } = await sb
      .from('fema_risk')
      .select('insurance_pressure, county_fips')
      .not('insurance_pressure', 'is', null);

    if (stats) {
      const counts = stats.reduce((acc, r) => {
        acc[r.insurance_pressure] = (acc[r.insurance_pressure] ?? 0) + 1;
        return acc;
      }, {});
      console.log('\n   Insurance pressure distribution:');
      for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        console.log(`     ${k.padEnd(12)} ${v} counties`);
      }
    }
  }

  console.log(`\n📊 Done`);
  console.log(`   Records fetched:  ${totalFetched}`);
  console.log(`   Counties upserted: ${totalUpserted}`);
  console.log(`   Errors: ${errors}\n`);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
