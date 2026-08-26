// app/api/admin/property-acquisition-spreadsheet/route.ts
//
// Option 2 -- spreadsheet (CSV) property candidate import. Admin-only,
// via this repo's existing lib/adminAuth.ts requireAdmin() pattern -- the
// same gate every other internal-only surface in this app uses. Not a
// public route.
//
// CSV only, not XLSX: no spreadsheet-parsing dependency exists in this
// repo today (checked package.json directly), and the accepted schema is
// simple enough that adding one (papaparse, exceljs, xlsx) to parse a
// handful of well-known columns would be more dependency than the problem
// justifies. If a real operator need for native .xlsx surfaces later,
// that's a deliberate follow-up decision, not a default assumed here.
//
// Feeds the exact same processAcquisitionCandidates() pipeline Option 1
// uses -- this file's only job is turning CSV rows into PropertyCandidate
// objects and validating them; the enrichment handoff is shared code.

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';
import { processAcquisitionCandidates, normalizeCandidateAddress, type PropertyCandidate } from '../../../../lib/propertyAcquisition';

const REQUIRED_COLUMNS = ['address'];
const OPTIONAL_COLUMNS = ['city', 'state', 'zip', 'observed_status', 'observed_price', 'source_url'];

// Column-name aliases -- accepts this app's own simple schema AND a real
// Redfin CSV export verbatim (confirmed against an actual export: SALE
// TYPE, SOLD DATE, PROPERTY TYPE, ADDRESS, CITY, STATE OR PROVINCE, ZIP OR
// POSTAL CODE, PRICE, BEDS, BATHS, LOCATION, SQUARE FEET, LOT SIZE, YEAR
// BUILT, DAYS ON MARKET, $/SQUARE FEET, HOA/MONTH, STATUS, NEXT OPEN HOUSE
// START TIME, NEXT OPEN HOUSE END TIME, URL (SEE ... FOR INFO ON PRICING),
// SOURCE, MLS#, FAVORITE, INTERESTED, LATITUDE, LONGITUDE) -- so an
// operator can hand this route Redfin's raw download with no reformatting.
// Matched case-insensitively; the URL column is matched by prefix since
// Redfin appends an explanatory parenthetical to that header.
const COLUMN_ALIASES: Record<string, string[]> = {
  address: ['address'],
  city: ['city'],
  state: ['state', 'state or province'],
  zip: ['zip', 'zip or postal code'],
  observed_status: ['observed_status', 'status'],
  observed_price: ['observed_price', 'price'],
  source_url: ['source_url', 'url'], // 'url' matched by prefix below, not exact
};

function resolveColumnIndex(header: string[], field: string): number {
  const aliases = COLUMN_ALIASES[field] ?? [field];
  for (const alias of aliases) {
    const exact = header.indexOf(alias);
    if (exact !== -1) return exact;
  }
  // Redfin's URL column header carries trailing explanatory text
  // ("url (see ... for info on pricing)") -- prefix match as a fallback.
  const prefixIdx = header.findIndex(h => aliases.some(a => h.startsWith(a)));
  return prefixIdx;
}

// Minimal CSV row splitter -- handles simple double-quoted fields (with
// escaped "" inside) since the accepted schema has no multiline fields and
// this repo has no CSV dependency to reach for instead.
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

interface RowValidation {
  rowNumber: number;
  raw: Record<string, string>;
  valid: boolean;
  reason?: string;
  candidate?: PropertyCandidate;
}

function parseAndValidateCsv(text: string): { rows: RowValidation[]; columnError?: string } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], columnError: 'Empty file.' };

  const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const colIdx: Record<string, number> = {};
  for (const field of ['address', 'city', 'state', 'zip', 'observed_status', 'observed_price', 'source_url']) {
    colIdx[field] = resolveColumnIndex(header, field);
  }
  if (colIdx.address === -1) {
    return { rows: [], columnError: `Missing required column: address (also accepts "ADDRESS"). Found columns: ${header.join(', ')}` };
  }

  const rows: RowValidation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const rowNumber = i + 1; // 1-indexed, matching a spreadsheet's own row numbers (header = row 1)
    const get = (field: string): string => (colIdx[field] !== -1 ? (cells[colIdx[field]] ?? '') : '');
    const raw: Record<string, string> = { address: get('address'), city: get('city'), state: get('state'), zip: get('zip') };

    const address = get('address').trim();
    // Rows that don't actually match this file's own column count (e.g. a
    // one-cell disclaimer line some exports prepend before the real data)
    // naturally fail here too, since `get('address')` reads an index that
    // such a row never populated -- no separate special-case skip needed.
    if (!address) { rows.push({ rowNumber, raw, valid: false, reason: 'Missing address.' }); continue; }

    const priceRaw = get('observed_price');
    const candidate: PropertyCandidate = {
      address,
      city: get('city') || null,
      state: get('state') || null,
      zip: get('zip') || null,
      observed_status: get('observed_status') || null,
      observed_price: priceRaw ? parseFloat(priceRaw.replace(/[^0-9.]/g, '')) || null : null,
      source_url: get('source_url') || null,
      source_type: 'spreadsheet',
      observed_at: new Date().toISOString(),
    };

    const normalized = normalizeCandidateAddress(candidate);
    if (!normalized) {
      rows.push({ rowNumber, raw, valid: false, reason: 'Address (plus city/state/zip if given separately) does not resolve to a valid "street, city, ST zip" shape. Not auto-repaired.' });
      continue;
    }
    rows.push({ rowNumber, raw, valid: true, candidate: { ...candidate, address: normalized } });
  }
  return { rows };
}

// A single lookup can take several seconds (real Redfin scrape + Tavily
// fallback). A 350-row file is a realistic real-world size for this route,
// and processing every new row in one request would run far past any
// reasonable serverless timeout. Bounded like every other cron in this
// workstream: process a page of the deduped candidate list per request,
// and report exactly how many remain so the caller (the admin UI below,
// or a script) can request the next page -- re-parsing the same CSV text
// each time is cheap; only the lookup step is capped.
const DEFAULT_BATCH_LIMIT = 20;

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const url = new URL(req.url);
  const previewOnly = url.searchParams.get('preview') === '1';
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
  const limit = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_BATCH_LIMIT), 10) || DEFAULT_BATCH_LIMIT;

  const text = await req.text();
  if (!text.trim()) return NextResponse.json({ error: 'Empty request body -- send raw CSV text.' }, { status: 400 });

  const { rows, columnError } = parseAndValidateCsv(text);
  if (columnError) return NextResponse.json({ error: columnError, expectedColumns: { required: REQUIRED_COLUMNS, optional: OPTIONAL_COLUMNS } }, { status: 400 });

  const validRows = rows.filter(r => r.valid);
  const invalidRows = rows.filter(r => !r.valid);

  // Dedup-within-file, by normalized address -- reported here even in
  // preview mode so an operator sees it before anything is processed.
  const seen = new Set<string>();
  const dedupedValidRows: RowValidation[] = [];
  const duplicateWithinFile: RowValidation[] = [];
  for (const r of validRows) {
    const key = r.candidate!.address.toLowerCase();
    if (seen.has(key)) duplicateWithinFile.push(r);
    else { seen.add(key); dedupedValidRows.push(r); }
  }

  const preview = {
    totalRows: rows.length,
    valid: validRows.length,
    invalid: invalidRows.length,
    duplicateWithinFile: duplicateWithinFile.length,
    newCandidates: dedupedValidRows.length,
    invalidRowDetails: invalidRows.map(r => ({ rowNumber: r.rowNumber, reason: r.reason })),
  };

  if (previewOnly) {
    return NextResponse.json({ ok: true, preview });
  }

  const page = dedupedValidRows.slice(offset, offset + limit);
  const processed = await processAcquisitionCandidates(page.map(r => r.candidate!), { origin: url.origin });

  return NextResponse.json({
    ok: true,
    preview,
    batch: { offset, limit, processedThisBatch: processed.length, remaining: Math.max(0, dedupedValidRows.length - (offset + processed.length)) },
    counts: {
      duplicateExisting: processed.filter(p => p.outcome === 'duplicate_existing').length,
      lookupSucceeded: processed.filter(p => p.outcome === 'lookup_succeeded').length,
      lookupFailed: processed.filter(p => p.outcome === 'lookup_failed').length,
    },
    processed,
  });
}
