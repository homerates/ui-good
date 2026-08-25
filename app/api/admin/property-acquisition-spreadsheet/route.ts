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
  const missing = REQUIRED_COLUMNS.filter(c => !header.includes(c));
  if (missing.length > 0) return { rows: [], columnError: `Missing required column(s): ${missing.join(', ')}` };

  const rows: RowValidation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const raw: Record<string, string> = {};
    header.forEach((col, idx) => { raw[col] = cells[idx] ?? ''; });
    const rowNumber = i + 1; // 1-indexed, matching a spreadsheet's own row numbers (header = row 1)

    const address = raw.address?.trim();
    if (!address) { rows.push({ rowNumber, raw, valid: false, reason: 'Missing address.' }); continue; }

    const candidate: PropertyCandidate = {
      address,
      city: raw.city || null,
      state: raw.state || null,
      zip: raw.zip || null,
      observed_status: raw.observed_status || null,
      observed_price: raw.observed_price ? parseFloat(raw.observed_price.replace(/[^0-9.]/g, '')) || null : null,
      source_url: raw.source_url || null,
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
