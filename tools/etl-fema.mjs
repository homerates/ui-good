/**
 * ETL: FEMA National Risk Index (NRI) — ArcGIS FeatureServer
 *
 * Source: FEMA NRI via ArcGIS REST API (no token required)
 * https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0
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

const ARCGIS_BASE = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query';

// Fields to fetch — composite + key hazards (confirmed from service schema)
const FIELDS = [
  'OBJECTID', 'STCOFIPS', 'COUNTY', 'STATEABBRV',
  'RISK_SCORE', 'RISK_RATNG',
  'HRCN_RISKS',  // Hurricane
  'WFIR_RISKS',  // Wildfire
  'IFLD_RISKS',  // Inland Flood (replaces RFLD)
  'CFLD_RISKS',  // Coastal Flood
  'ERQK_RISKS',  // Earthquake
  'TRND_RISKS',  // Tornado
  'HAIL_RISKS',  // Hail
  'WNTW_RISKS',  // Winter Weather
  'DRGT_RISKS',  // Drought
  'HWAV_RISKS',  // Heat Wave
].join(',');

const PAGE_SIZE = 500;

function deriveInsurancePressure(composite, dominantHazard) {
  const highImpact = ['hurricane', 'coastal_flood', 'wildfire', 'flood'];
  const isHighImpact = highImpact.includes(dominantHazard);

  if (composite >= 75 && isHighImpact) return 'very_high';
  if (composite >= 60 && isHighImpact) return 'high';
  if (composite >= 60) return 'elevated';
  if (composite >= 40 && isHighImpact) return 'elevated';
  if (composite >= 40) return 'moderate';
  return 'low';
}

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

function parseFeature(attrs) {
  const fips = String(attrs.STCOFIPS ?? '').padStart(5, '0');
  if (!fips || fips === '00000') return null;

  const scores = {
    hurricane:     attrs.HRCN_RISKS ?? null,
    wildfire:      attrs.WFIR_RISKS ?? null,
    flood:         attrs.IFLD_RISKS ?? attrs.CFLD_RISKS ?? null,
    coastal_flood: attrs.CFLD_RISKS ?? null,
    earthquake:    attrs.ERQK_RISKS ?? null,
    tornado:       attrs.TRND_RISKS ?? null,
    hail:          attrs.HAIL_RISKS ?? null,
    winter:        attrs.WNTW_RISKS ?? null,
    drought:       attrs.DRGT_RISKS ?? null,
    heat:          attrs.HWAV_RISKS ?? null,
  };

  // Dominant hazard
  let dominantHazard = null;
  let dominantScore = -1;
  for (const [name, score] of Object.entries(scores)) {
    if (score !== null && score > dominantScore) {
      dominantScore = score;
      dominantHazard = name;
    }
  }

  const composite = attrs.RISK_SCORE !== null && attrs.RISK_SCORE !== undefined
    ? Math.round(attrs.RISK_SCORE * 10) / 10
    : null;

  const pressure = composite !== null
    ? deriveInsurancePressure(composite, dominantHazard)
    : 'low';
  const delta = estimateInsuranceDelta(pressure);

  return {
    county_fips:       fips,
    county_name:       attrs.COUNTY ?? null,
    state_abbr:        attrs.STATEABBRV ?? null,
    composite_score:   composite,
    risk_label:        attrs.RISK_RATNG ?? null,
    hurricane_score:   scores.hurricane,
    wildfire_score:    scores.wildfire,
    flood_score:       scores.flood,
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

async function fetchPage(minObjectId) {
  const where = minObjectId ? `OBJECTID > ${minObjectId}` : '1=1';
  const params = new URLSearchParams({
    where,
    outFields: FIELDS,
    returnGeometry: 'false',
    orderByFields: 'OBJECTID ASC',
    f: 'json',
    resultRecordCount: String(PAGE_SIZE),
  });
  const url = `${ARCGIS_BASE}?${params}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`ArcGIS error: ${json.error.message}`);
  return json.features ?? [];
}

async function run() {
  console.log('\n🌪  FEMA NRI ETL (ArcGIS source)\n');

  let minObjectId = null;
  let totalFetched = 0;
  let totalUpserted = 0;
  let page = 1;

  while (true) {
    process.stdout.write(`  Page ${page} (OBJECTID > ${minObjectId ?? 0}) ...`);

    const features = await fetchPage(minObjectId);
    if (!features.length) { console.log(' done.'); break; }

    const rows = features.map(f => parseFeature(f.attributes)).filter(Boolean);
    totalFetched += features.length;

    // Track max OBJECTID for next page
    const maxOid = Math.max(...features.map(f => f.attributes.OBJECTID ?? 0));
    if (maxOid > 0) minObjectId = maxOid;

    if (rows.length) {
      const { error } = await sb.from('fema_risk').upsert(rows, { onConflict: 'county_fips' });
      if (error) throw new Error(error.message);
      totalUpserted += rows.length;
    }

    console.log(` ✓ ${rows.length} counties`);
    page++;
    if (features.length < PAGE_SIZE) break;

    await new Promise(r => setTimeout(r, 100));
  }

  // Distribution summary
  if (totalUpserted > 0) {
    const { data } = await sb.from('fema_risk').select('insurance_pressure');
    if (data) {
      const counts = data.reduce((acc, r) => {
        acc[r.insurance_pressure] = (acc[r.insurance_pressure] ?? 0) + 1;
        return acc;
      }, {});
      console.log('\n   Insurance pressure distribution:');
      for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        console.log(`     ${k.padEnd(12)} ${v} counties`);
      }
    }
  }

  console.log(`\n📊 Done — ${totalUpserted} counties upserted\n`);
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
