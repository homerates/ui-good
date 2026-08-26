'use client';

// app/admin/property-acquisition/page.tsx
//
// Admin UI for Option 2 (spreadsheet/CSV property acquisition). The file
// picker reads the CSV directly from wherever it already is on disk (e.g.
// Downloads) via the browser's File API -- nothing needs to be moved into
// the repo or uploaded anywhere first. This page just posts the file's
// text content to the existing /api/admin/property-acquisition-spreadsheet
// route, which is gated by requireAdmin() the same way every other admin
// surface in this app is.
//
// Processing is batched client-side (default 20 new candidates per
// request) because each new address triggers a real lookup call that can
// take several seconds -- a 300+ row file would otherwise mean one request
// running for tens of minutes. This page loops batches automatically and
// shows running totals, with a Stop button to pause between batches.

import { useState, useRef, useEffect } from 'react';
import AppNav from '../../components/AppNav';

interface Preview {
  totalRows: number;
  valid: number;
  invalid: number;
  duplicateWithinFile: number;
  newCandidates: number;
  invalidRowDetails: { rowNumber: number; reason?: string }[];
}

interface ProcessedRow {
  candidate: { address: string; source_url?: string | null };
  normalizedAddress: string | null;
  outcome: string;
  reason?: string;
  propertyId?: string;
}

// Matches the route's own DEFAULT_BATCH_LIMIT (sized against its 150s
// maxDuration and processAcquisitionCandidates' sequential processing --
// reduced from an earlier concurrent design after a live regression, see
// that function's own comment).
const BATCH_LIMIT = 5;
// Client-side backstop, slightly above the route's own maxDuration: if the
// server hasn't responded by then, something is genuinely stuck (a hung
// external call, a dropped connection) rather than just slow, and the UI
// should say so instead of sitting on "Processing..." forever with no way
// to tell the difference between working and frozen.
const FETCH_TIMEOUT_MS = 160_000;

const cardStyle: React.CSSProperties = {
  background: '#0e1420', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: 16,
};
function btnStyle(color = '#00e87a'): React.CSSProperties {
  return {
    background: color, color: color === '#00e87a' ? '#07100f' : '#fff',
    border: 'none', borderRadius: 8, padding: '9px 18px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  };
}

export default function PropertyAcquisitionAdminPage() {
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [offset, setOffset] = useState(0);
  const [log, setLog] = useState<ProcessedRow[]>([]);
  const [totals, setTotals] = useState({ duplicateExisting: 0, lookupSucceeded: 0, lookupFailed: 0 });
  const [error, setError] = useState('');
  const [batchNumber, setBatchNumber] = useState(0);
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const stopRef = useRef(false);

  // Live elapsed-time ticker while a batch is in flight -- the concrete
  // reason this exists: a frozen-looking "Processing…" button with no
  // moving number is indistinguishable from a genuinely hung request. A
  // visibly ticking elapsed-seconds count at least confirms the page
  // itself is alive and a request really is outstanding, not stuck.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsvText(await file.text());
    setPreview(null);
    setLog([]);
    setOffset(0);
    setTotals({ duplicateExisting: 0, lookupSucceeded: 0, lookupFailed: 0 });
    setError('');
  }

  async function runPreview() {
    setPreviewing(true);
    setError('');
    try {
      const res = await fetch('/api/admin/property-acquisition-spreadsheet?preview=1', {
        method: 'POST',
        body: csvText,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      setPreview(data.preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setPreviewing(false);
  }

  async function runBatches() {
    setRunning(true);
    stopRef.current = false;
    setError('');
    let currentOffset = offset;
    let batchNum = batchNumber;
    while (!stopRef.current) {
      batchNum++;
      setBatchNumber(batchNum);
      setBatchStartedAt(Date.now());
      try {
        const res = await fetchWithTimeout(`/api/admin/property-acquisition-spreadsheet?offset=${currentOffset}&limit=${BATCH_LIMIT}`, {
          method: 'POST',
          body: csvText,
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); break; }
        setLog(prev => [...prev, ...data.processed]);
        setTotals(prev => ({
          duplicateExisting: prev.duplicateExisting + data.counts.duplicateExisting,
          lookupSucceeded: prev.lookupSucceeded + data.counts.lookupSucceeded,
          lookupFailed: prev.lookupFailed + data.counts.lookupFailed,
        }));
        currentOffset += data.batch.processedThisBatch;
        setOffset(currentOffset);
        if (data.batch.remaining === 0 || data.batch.processedThisBatch === 0) break;
      } catch (e) {
        const timedOut = e instanceof Error && e.name === 'AbortError';
        setError(timedOut
          ? `Batch ${batchNum} did not respond within ${FETCH_TIMEOUT_MS / 1000}s — likely one slow address stalling the whole request. Click "Process next batch" to retry from where it left off (offset ${currentOffset}).`
          : e instanceof Error ? e.message : String(e));
        break;
      }
    }
    setRunning(false);
  }

  const remaining = preview ? Math.max(0, preview.newCandidates - offset) : null;

  return (
    <div className="page-standalone" style={{
      minHeight: '100vh', width: '100%', background: '#080c12', color: '#f0f4ff',
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflowY: 'auto',
    }}>
      <AppNav />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px', boxSizing: 'border-box' }}>
        <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: '#00e87a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin</p>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Property Acquisition — Spreadsheet Import</h1>
        <p style={{ margin: '4px 0 24px', fontSize: 13, color: '#8b949e' }}>
          Import a CSV of candidate addresses (e.g. a Redfin export). Required column: <code>address</code>.
          Optional: <code>city, state, zip, observed_status, observed_price, source_url</code>. Feeds the same
          canonical property pipeline as any other lookup — no acquisition metadata reaches the public page.
        </p>

        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ color: '#e6edf3', fontSize: 13 }} />
          {fileName && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#8b949e' }}>Loaded: {fileName} ({csvText.split(/\r?\n/).filter(l => l.trim()).length - 1} data row(s))</p>}
        </div>

        {csvText && (
          <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={runPreview} disabled={previewing} style={btnStyle('#161b22')}>
              {previewing ? 'Checking…' : '1. Preview (no processing)'}
            </button>
            {preview && (
              <button onClick={runBatches} disabled={running || remaining === 0} style={btnStyle()}>
                {running
                  ? `Batch ${batchNumber} running — ${batchStartedAt ? Math.round((nowTick - batchStartedAt) / 1000) : 0}s elapsed (${offset}/${preview.newCandidates} done)`
                  : remaining === 0 ? 'Done' : `2. Process next batch (${BATCH_LIMIT} at a time)`}
              </button>
            )}
            {running && (
              <button onClick={() => { stopRef.current = true; }} style={btnStyle('#ff5f5f')}>Stop after current batch</button>
            )}
          </div>
        )}

        {error && (
          <div style={{ ...cardStyle, marginBottom: 20, borderColor: '#ff5f5f44', color: '#ff5f5f' }}>{error}</div>
        )}

        {preview && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={cardStyle}><div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase' }}>Total Rows</div><div style={{ fontSize: 26, fontWeight: 800 }}>{preview.totalRows}</div></div>
            <div style={cardStyle}><div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase' }}>Valid</div><div style={{ fontSize: 26, fontWeight: 800, color: '#00e87a' }}>{preview.valid}</div></div>
            <div style={cardStyle}><div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase' }}>Invalid</div><div style={{ fontSize: 26, fontWeight: 800, color: '#ff5f5f' }}>{preview.invalid}</div></div>
            <div style={cardStyle}><div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase' }}>Dup in File</div><div style={{ fontSize: 26, fontWeight: 800, color: '#f0a202' }}>{preview.duplicateWithinFile}</div></div>
            <div style={cardStyle}><div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase' }}>New Candidates</div><div style={{ fontSize: 26, fontWeight: 800 }}>{preview.newCandidates}</div></div>
          </div>
        )}

        {preview && preview.invalidRowDetails.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Invalid rows</p>
            {preview.invalidRowDetails.slice(0, 20).map((r, i) => (
              <div key={i} style={{ fontSize: 12, color: '#8b949e', padding: '3px 0' }}>Row {r.rowNumber}: {r.reason}</div>
            ))}
            {preview.invalidRowDetails.length > 20 && <div style={{ fontSize: 12, color: '#8b949e' }}>…and {preview.invalidRowDetails.length - 20} more</div>}
          </div>
        )}

        {(log.length > 0) && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div style={cardStyle}><div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase' }}>Already Existed</div><div style={{ fontSize: 26, fontWeight: 800 }}>{totals.duplicateExisting}</div></div>
              <div style={cardStyle}><div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase' }}>Resolved (New)</div><div style={{ fontSize: 26, fontWeight: 800, color: '#00e87a' }}>{totals.lookupSucceeded}</div></div>
              <div style={cardStyle}><div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase' }}>Lookup Failed</div><div style={{ fontSize: 26, fontWeight: 800, color: '#ff5f5f' }}>{totals.lookupFailed}</div></div>
            </div>
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#0e1420' }}>
                      {['Address', 'Outcome', 'Detail'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#8b949e', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '8px 12px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.candidate.address}</td>
                        <td style={{ padding: '8px 12px', color: r.outcome === 'lookup_succeeded' ? '#00e87a' : r.outcome === 'lookup_failed' ? '#ff5f5f' : r.outcome === 'duplicate_existing' ? '#8b949e' : '#f0a202' }}>{r.outcome}</td>
                        <td style={{ padding: '8px 12px', color: '#8b949e', fontSize: 12 }}>{r.reason ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
