'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import PropertyMap from '@/components/PropertyMap';
import PropertyPhoto from '@/components/PropertyPhoto';
import { ShareAnswerButton } from '@/components/ShareAnswerButton';
import { EDUCATIONAL_DISCLAIMER } from '@/disclosures';
import { useAdminStatus } from '../../hooks/useAdminStatus';

interface ConformingLimits {
  units1: number; units2: number; units3: number; units4: number;
  isHighBalance: boolean;
}

interface AmiResult {
  resolvedFrom: 'zip' | 'address' | 'county';
  county: string;
  state: string;
  zip?: string;
  countyFips?: string;
  ami4Person: number;
  amiForHouseholdSize: number;
  ami80pct: number;
  ami50pct: number;
  ami120pct: number;
  annualIncome: number;
  householdSize: number;
  incomeAsPctOfAmi: number;
  programs: { homeReady: boolean; homePossible: boolean; dpa: boolean };
  fiscalYear: number;
  dataSource: 'FHFA' | 'HUD';
  dpaMatchCount: number;
  conformingLimits?: ConformingLimits;
}

interface FfiecResult {
  method: 'geocoded' | 'county_fallback' | 'unresolved';
  census_tract_geoid: string | null;
  tract_income_level: string | null;
  distressed_underserved: boolean;
  tract_eligible: boolean;
  ffiec_mfi_estimate: number | null;
  ffiec_adjusted_limit: number | null;
  income_eligible: boolean;
  any_eligible: boolean;
  geocode_vintage_used: string | null;
}

function fmt(n: number) {
  return '$' + n.toLocaleString();
}

function meterColor(pct: number) {
  if (pct <= 80)  return '#00e87a';
  if (pct <= 120) return '#f59e0b';
  return '#ff5f5f';
}

function meterWidth(pct: number) {
  return Math.min(Math.round((pct / 150) * 100), 100) + '%';
}

interface SavedAmiItem {
  id: string;
  title: string | null;
  address: string | null;
  updated_at: string;
  data: {
    county?: string;
    state?: string;
    incomeAsPctOfAmi?: number;
    programs?: { homeReady: boolean; homePossible: boolean };
    annualIncome?: number;
    householdSize?: number;
    ami4Person?: number;
  };
}

/* Saved-lookups rail — rendered in right column of desktop layout */
function AmiSavedRail({
  user,
  userLoaded,
  items,
  loaded,
  onRerun,
}: {
  user: { id: string } | null | undefined;
  userLoaded: boolean;
  items: SavedAmiItem[];
  loaded: boolean;
  onRerun: (addr: string, income?: number, size?: number) => void;
}) {
  if (!userLoaded || !loaded) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: '#8fa3b8', fontSize: 12 }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="aqr-empty">
        <div className="aqr-empty-icon">🔖</div>
        <p className="aqr-empty-text">
          <Link href="/sign-in" style={{ color: '#3d8bff', textDecoration: 'none' }}>Sign in</Link>
          {' '}to save AMI lookups and see them here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="aqr-title">
        <span>Saved Lookups</span>
        {items.length > 0 && (
          <Link href="/ami-qualifier/saved">View All →</Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="aqr-empty">
          <div className="aqr-empty-icon">📋</div>
          <p className="aqr-empty-text">
            No saved lookups yet. Run a check and hit <strong style={{ color: '#f0f4ff' }}>Save</strong> to see it here.
          </p>
        </div>
      ) : (
        <div className="aqr-list">
          {items.slice(0, 12).map(item => {
            const d = item.data;
            const pct = d.incomeAsPctOfAmi;
            const eligColor = pct == null ? '#8fa3b8' : pct <= 80 ? '#00e87a' : pct <= 120 ? '#f59e0b' : '#ff5f5f';
            return (
              <div
                key={item.id}
                className="aqr-card"
                onClick={() => onRerun(item.address ?? '', d.annualIncome, d.householdSize)}
                title={`Re-run: ${item.address ?? item.title}`}
              >
                <div className="aqr-thumb">
                  <PropertyPhoto
                    address={item.address ?? undefined}
                    width={136}
                    height={136}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
                <div className="aqr-body">
                  {d.county && d.state && (
                    <div className="aqr-county">{d.county}, {d.state}</div>
                  )}
                  <div className="aqr-addr">
                    {item.address?.split(',')[0] ?? item.title ?? '—'}
                  </div>
                  <div className="aqr-result">
                    {pct != null
                      ? <strong style={{ color: eligColor }}>{pct}% of AMI</strong>
                      : <span>—</span>}
                    {d.programs?.homeReady
                      ? <span style={{ color: '#00e87a' }}> · HomeReady</span>
                      : d.programs && <span> · Over limit</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* Debug panel — visible only to admin + exact email rayaanarif57@gmail.com */
function AmiDebugPanel({ raw }: { raw: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      marginTop: 8, borderRadius: 8, border: '1px solid #2a2a3a',
      background: '#0d0d14', fontFamily: 'monospace', fontSize: 11, color: '#a0a8c0', overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
          borderBottom: open ? '1px solid #2a2a3a' : 'none',
          cursor: 'pointer', userSelect: 'none', background: '#13131f',
        }}
      >
        <span style={{ fontSize: 13 }}>🐛</span>
        <span style={{ color: '#5060a0', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>DEBUG</span>
        <span style={{ color: '#94a3b8', fontSize: 10 }}>/api/ami-qualifier · full response</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <span
              onClick={copy}
              style={{
                padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10,
                color: copied ? '#40c080' : '#606080', border: '1px solid transparent',
              }}
            >
              {copied ? '✓ copied' : '⎘ copy'}
            </span>
          </div>
          <pre style={{
            margin: 0, padding: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 500, overflowY: 'auto', color: '#8090b0', fontSize: 10,
          }}>
            {JSON.stringify(raw, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AmiQualifierPage() {
  const { isAdmin } = useAdminStatus();
  const { user, isLoaded: userLoaded } = useUser();
  const isDebugUser = isAdmin && user?.primaryEmailAddress?.emailAddress === 'rayaanarif57@gmail.com';

  const [location,      setLocation]      = useState('');
  const [incomeDraft,   setIncomeDraft]   = useState('');
  const [incomeValue,   setIncomeValue]   = useState<number | null>(null);
  const [householdSize, setHouseholdSize] = useState(4);
  const [result,        setResult]        = useState<AmiResult | null>(null);
  const [ffiec,         setFfiec]         = useState<FfiecResult | null>(null);
  const [rawResponse,   setRawResponse]   = useState<Record<string, unknown> | null>(null);
  const [error,         setError]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [savedId,       setSavedId]       = useState<string | null>(null);
  const [detailOpen,    setDetailOpen]    = useState(false);
  const [railItems,     setRailItems]     = useState<SavedAmiItem[]>([]);
  const [railLoaded,    setRailLoaded]    = useState(false);

  // Fetch rail items once auth state is known
  useEffect(() => {
    if (!userLoaded) return;
    if (!user) { setRailLoaded(true); return; }
    fetch('/api/ami-qualifier/save')
      .then(r => r.json())
      .then(j => { if (j.ok) setRailItems(j.items ?? []); })
      .catch(() => {})
      .finally(() => setRailLoaded(true));
  }, [userLoaded, user]);

  function handleIncomeChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '');
    const n = digits ? Number(digits) : null;
    setIncomeValue(n);
    setIncomeDraft(n ? '$' + n.toLocaleString() : '');
  }

  async function runCheck(loc: string, income: number, size: number) {
    setLoading(true);
    setError('');
    setResult(null);
    setFfiec(null);
    setRawResponse(null);
    setSavedId(null);
    try {
      const res = await fetch('/api/ami-qualifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc, annualIncome: income, householdSize: size }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult(json.result);
        setFfiec(json.ffiec ?? null);
        setRawResponse(json);
      } else {
        setError(json.error ?? 'Could not resolve location.');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!location.trim() || !incomeValue) return;
    await runCheck(location, incomeValue, householdSize);
  }

  function handleRerun(addr: string, income?: number, size?: number) {
    const inc = income ?? incomeValue ?? 0;
    const sz  = size ?? householdSize;
    setLocation(addr);
    if (income)  { setIncomeValue(income); setIncomeDraft('$' + income.toLocaleString()); }
    if (size)    setHouseholdSize(sz);
    if (addr && inc) runCheck(addr, inc, sz);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave() {
    if (!result || !location.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/ami-qualifier/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, result }),
      });
      const json = await res.json();
      if (json.ok) {
        setSavedId(json.item?.id ?? 'saved');
        if (json.item) {
          setRailItems(prev => [json.item, ...prev.filter(i => i.id !== json.item.id)]);
        }
      }
    } catch { /* non-fatal */ }
    setSaving(false);
  }

  const pct   = result?.incomeAsPctOfAmi ?? 0;
  const color = meterColor(pct);

  const locationLabel = result
    ? result.zip
      ? `${result.county}, ${result.state} — ZIP ${result.zip}`
      : `${result.county}, ${result.state}`
    : '';

  return (
    <>
      <style>{`
        body:has(.aq-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.aq-root){height:auto!important;overflow:visible!important;}
        body:has(.aq-root) .app-footer{display:none!important;}

        .aq-root{min-height:100vh;width:100%;background:#080c12;color:#f0f4ff;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;}
        .aq-root *{box-sizing:border-box;}

        .aq-header{position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.92);backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);}
        .aq-header-inner{max-width:700px;margin:0 auto;padding:0 24px;height:56px;
          display:flex;align-items:center;justify-content:space-between;}
        .aq-logo-link{display:flex;align-items:center;text-decoration:none;}
        .aq-logo{height:24px;width:auto;}
        .aq-header-badge{font-size:11px;color:#8fa3b8;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;}

        .aq-hero{padding:36px 0 28px;text-align:center;
          border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:20px;}
        .aq-eyebrow{font-size:11px;font-weight:700;color:#00e87a;letter-spacing:1px;
          text-transform:uppercase;margin-bottom:10px;}
        .aq-h1{font-size:clamp(1.6rem,3.5vw,2.1rem);font-weight:800;color:#f0f4ff;
          letter-spacing:-0.5px;margin:0 0 10px;line-height:1.2;}
        .aq-sub{font-size:15px;color:#8fa3b8;max-width:480px;margin:0 auto;line-height:1.55;}

        .aq-main{width:100%;max-width:700px;padding:24px 16px 60px;}

        /* ── Input card ── */
        .aq-card{background:#0e1420;border:1px solid rgba(255,255,255,0.07);
          border-radius:14px;padding:24px;margin-bottom:14px;}
        .aq-card-label{font-size:11px;font-weight:700;color:#8fa3b8;
          letter-spacing:0.8px;text-transform:uppercase;margin-bottom:18px;}

        .aq-field{margin-bottom:14px;}
        .aq-field label{display:block;font-size:12px;font-weight:600;color:#8fa3b8;margin-bottom:6px;}
        .aq-field input,.aq-field select{width:100%;padding:11px 14px;
          background:#141b28;border:1.5px solid rgba(255,255,255,0.13);border-radius:9px;
          font-size:15px;color:#f0f4ff;outline:none;transition:border-color 0.15s;
          font-family:inherit;}
        .aq-field input:focus,.aq-field select:focus{border-color:#00e87a;}
        .aq-field input::placeholder{color:#8fa3b8;}
        .aq-field .aq-hint{font-size:11px;color:#8fa3b8;margin-top:5px;opacity:0.7;}
        .aq-field select{appearance:none;cursor:pointer;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238fa3b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right 12px center;padding-right:32px;}
        .aq-field select option{background:#141b28;}

        .aq-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        @media(max-width:480px){.aq-row{grid-template-columns:1fr;}}

        .aq-btn{width:100%;padding:13px;background:#00e87a;color:#000;border:none;
          border-radius:9px;font-size:15px;font-weight:800;cursor:pointer;
          font-family:inherit;transition:opacity 0.15s;margin-top:4px;}
        .aq-btn:hover{opacity:0.9;}
        .aq-btn:disabled{opacity:0.5;cursor:not-allowed;}

        /* ── Error ── */
        .aq-error{background:rgba(255,95,95,0.1);border:1px solid rgba(255,95,95,0.25);
          border-radius:10px;padding:14px 16px;font-size:13px;color:#ff5f5f;
          margin-bottom:14px;}

        /* ── Result card ── */
        .aq-result{background:#0e1420;border:1px solid rgba(255,255,255,0.07);
          border-radius:14px;overflow:hidden;margin-bottom:14px;}

        .aq-result-header{padding:20px 24px 16px;border-bottom:1px solid rgba(255,255,255,0.06);}
        .aq-result-area{font-size:12px;color:#8fa3b8;margin-bottom:6px;font-weight:500;}
        .aq-ami-row{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
        .aq-ami-val{font-size:30px;font-weight:800;color:#f0f4ff;letter-spacing:-1px;}
        .aq-ami-lbl{font-size:13px;color:#8fa3b8;}

        /* Meter */
        .aq-meter-wrap{padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.06);}
        .aq-meter-top{display:flex;justify-content:space-between;align-items:baseline;
          margin-bottom:14px;flex-wrap:wrap;gap:6px;}
        .aq-meter-income{font-size:13px;color:#8fa3b8;}
        .aq-meter-income strong{color:#f0f4ff;font-weight:700;}
        .aq-meter-pct{font-size:22px;font-weight:800;letter-spacing:-0.5px;}
        .aq-track{height:8px;background:#141b28;border-radius:99px;position:relative;
          margin-bottom:10px;overflow:visible;}
        .aq-fill{height:100%;border-radius:99px;position:relative;transition:width 0.5s ease;}
        .aq-cursor{position:absolute;right:-6px;top:50%;transform:translateY(-50%);
          width:14px;height:14px;border-radius:50%;}
        .aq-ticks{display:flex;justify-content:space-between;}
        .aq-tick{font-size:10px;color:#8fa3b8;font-weight:600;opacity:0.6;}

        /* Programs */
        .aq-programs{padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.06);}
        .aq-section-lbl{font-size:11px;font-weight:700;color:#8fa3b8;
          letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;}
        .aq-prog-list{display:flex;flex-direction:column;gap:8px;}
        .aq-prog-row{display:flex;align-items:center;justify-content:space-between;
          padding:14px 16px;border-radius:10px;border:1px solid rgba(0,232,122,0.18);
          background:rgba(0,232,122,0.07);}
        .aq-prog-row.fail{background:#141b28;border-color:rgba(255,255,255,0.07);}
        .aq-prog-left{display:flex;flex-direction:column;gap:3px;}
        .aq-prog-name{font-size:14px;font-weight:700;color:#f0f4ff;}
        .aq-prog-desc{font-size:12px;color:#8fa3b8;}
        .aq-prog-badge{display:flex;align-items:center;gap:6px;font-size:13px;
          font-weight:700;white-space:nowrap;flex-shrink:0;margin-left:12px;}
        .aq-prog-badge.pass{color:#00e87a;}
        .aq-prog-badge.fail{color:#8fa3b8;}
        .aq-dot{width:7px;height:7px;border-radius:50%;}
        .aq-dot.pass{background:#00e87a;}
        .aq-dot.fail{background:#8fa3b8;opacity:0.4;}
        .aq-prog-row.neutral{background:rgba(245,158,11,0.06);border-color:rgba(245,158,11,0.18);}
        .aq-prog-badge.neutral{color:#f59e0b;}
        .aq-dot.neutral{background:#f59e0b;opacity:1;}

        /* Limits table */
        .aq-limits{padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.06);}
        .aq-table{width:100%;border-collapse:collapse;}
        .aq-table th{text-align:left;font-size:11px;font-weight:600;color:#8fa3b8;
          padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06);opacity:0.7;}
        .aq-table th:last-child{text-align:right;}
        .aq-table td{padding:10px 0;font-size:13px;color:#8fa3b8;
          border-bottom:1px solid rgba(255,255,255,0.05);vertical-align:middle;}
        .aq-table tr:last-child td{border-bottom:none;}
        .aq-table td:last-child{text-align:right;font-weight:700;color:#f0f4ff;}
        .aq-your-row td{color:#f0f4ff!important;font-weight:600;}
        .aq-your-row td:last-child{color:#00e87a!important;font-weight:800;}
        .aq-pill{display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;
          border-radius:99px;text-transform:uppercase;letter-spacing:0.5px;margin-left:6px;
          vertical-align:middle;}
        .pill-blue{background:rgba(61,139,255,0.15);color:#3d8bff;}
        .pill-green{background:rgba(0,232,122,0.12);color:#00e87a;}
        .pill-amber{background:rgba(245,158,11,0.12);color:#f59e0b;}

        /* Actions */
        .aq-actions{padding:18px 24px;display:flex;gap:10px;}
        .aq-btn-sec{flex:1;padding:11px;border:1px solid rgba(255,255,255,0.13);
          border-radius:8px;background:transparent;font-size:13px;font-weight:600;
          color:#f0f4ff;cursor:pointer;text-align:center;font-family:inherit;
          text-decoration:none;display:flex;align-items:center;justify-content:center;
          transition:border-color 0.15s;}
        .aq-btn-sec:hover{border-color:#00e87a;}
        .aq-btn-pri{flex:2;padding:11px;border:none;border-radius:8px;background:#00e87a;
          font-size:14px;font-weight:800;color:#000;cursor:pointer;text-align:center;
          font-family:inherit;text-decoration:none;display:flex;align-items:center;
          justify-content:center;transition:opacity 0.15s;}
        .aq-btn-pri:hover{opacity:0.9;}

        /* Data note + disclosure */
        .aq-note{background:#141b28;border:1px solid rgba(255,255,255,0.06);
          border-radius:10px;padding:14px 16px;margin-top:14px;}
        .aq-note-lbl{font-size:10px;font-weight:700;color:#8fa3b8;text-transform:uppercase;
          letter-spacing:0.8px;margin-bottom:6px;}
        .aq-note p{font-size:12px;color:#8fa3b8;line-height:1.55;opacity:0.8;}
        .aq-disclosure{font-size:11px;color:#8fa3b8;text-align:center;margin-top:20px;
          line-height:1.6;opacity:0.45;padding:0 8px;}

        /* ── FFIEC tract designation card ── */
        .aq-tier-chip{display:inline-block;font-size:13px;font-weight:700;padding:4px 12px;
          border-radius:99px;letter-spacing:0.3px;margin-right:6px;vertical-align:middle;}
        .tier-lo-mod{background:rgba(61,139,255,0.13);color:#3d8bff;}
        .tier-mid-up{background:rgba(143,163,184,0.1);color:#8fa3b8;}
        .aq-ffiec-county-note{font-size:12px;color:#f59e0b;background:rgba(245,158,11,0.06);
          border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:10px 14px;
          margin-bottom:14px;line-height:1.55;}
        .aq-ffiec-disclaimer{padding:14px 24px;border-top:1px solid rgba(255,255,255,0.06);}
        .aq-ffiec-disclaimer p{font-size:11px;color:#8fa3b8;opacity:0.7;margin:0;line-height:1.55;}

        /* ── Two-column desktop layout ── */
        .aq-layout{width:100%;display:flex;align-items:flex-start;}
        .aq-main-wrap{flex:1;display:flex;justify-content:center;min-width:0;}
        .aq-saved-rail{flex:0 0 268px;width:268px;padding:20px 14px 60px;
          border-left:1px solid rgba(255,255,255,0.06);
          position:sticky;top:0;max-height:100vh;overflow-y:auto;}
        @media(max-width:1099px){
          .aq-layout{display:block;}
          .aq-saved-rail{display:none;}
        }

        /* ── Saved rail cards ── */
        .aqr-title{font-size:10px;font-weight:700;color:#8fa3b8;letter-spacing:1px;
          text-transform:uppercase;margin-bottom:12px;display:flex;
          justify-content:space-between;align-items:center;}
        .aqr-title a{font-size:10px;color:#3d8bff;font-weight:600;text-decoration:none;
          text-transform:none;letter-spacing:0;}
        .aqr-title a:hover{text-decoration:underline;}
        .aqr-list{display:flex;flex-direction:column;gap:8px;}
        .aqr-empty{background:#0e1420;border:1px solid rgba(255,255,255,0.06);
          border-radius:10px;padding:20px 14px;text-align:center;}
        .aqr-empty-icon{font-size:24px;margin-bottom:8px;}
        .aqr-empty-text{font-size:12px;color:#8fa3b8;line-height:1.6;margin:0;}
        .aqr-card{display:flex;border:1px solid rgba(255,255,255,0.07);border-radius:10px;
          overflow:hidden;cursor:pointer;transition:border-color 0.15s;background:#0e1420;
          min-height:68px;}
        .aqr-card:hover{border-color:rgba(0,232,122,0.2);}
        .aqr-thumb{width:68px;flex-shrink:0;background:#0a1628;}
        .aqr-body{flex:1;padding:9px 10px;min-width:0;}
        .aqr-county{font-size:10px;color:#8fa3b8;margin-bottom:2px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .aqr-addr{font-size:12px;font-weight:700;color:#f0f4ff;margin-bottom:4px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .aqr-result{font-size:11px;color:#8fa3b8;line-height:1.4;}
      `}</style>

      <div className="aq-root">
        {/* Two-column layout — hero lives inside the main column so both center on the same axis */}
        <div className="aq-layout">
          <div className="aq-main-wrap">
        <main className="aq-main">
          {/* Hero */}
          <div className="aq-hero">
            <div className="aq-eyebrow">AMI Income Qualifier · Preliminary Screen</div>
            <h1 className="aq-h1">Area Median Income Qualifier</h1>
            <p className="aq-sub">
              Check HomeReady, Home Possible, and DPA eligibility by ZIP code,
              county, or property address — instantly.
            </p>
          </div>
          {/* Input card */}
          <div className="aq-card">
            <div className="aq-card-label">Enter Details</div>
            <form onSubmit={handleSubmit}>
              <div className="aq-field">
                <label>Location</label>
                <AddressAutocomplete
                  value={location}
                  onChange={setLocation}
                  onSelect={setLocation}
                  placeholder="ZIP code, county (Orange County, CA), or full address..."
                  style={{
                    width: '100%', padding: '11px 14px',
                    background: '#141b28', border: '1.5px solid rgba(255,255,255,0.13)',
                    borderRadius: 9, fontSize: 15, color: '#f0f4ff', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <div className="aq-hint">Enter a ZIP code or full property address. County and AMI source are confirmed after checking eligibility.</div>
              </div>

              <div className="aq-row">
                <div className="aq-field">
                  <label>Annual Household Income</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="$0"
                    value={incomeDraft}
                    onChange={e => handleIncomeChange(e.target.value)}
                  />
                </div>
                <div className="aq-field">
                  <label>Household Size</label>
                  <select
                    value={householdSize}
                    onChange={e => setHouseholdSize(Number(e.target.value))}
                  >
                    {[1,2,3,4,5,6,7,8].map(n => (
                      <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="aq-btn"
                disabled={loading || !location.trim() || !incomeValue}
              >
                {loading ? 'Checking…' : 'Check Eligibility'}
              </button>
            </form>
          </div>

          {/* Error */}
          {error && <div className="aq-error">{error}</div>}

          {/* Screening disclaimer — prominent, near results */}
          {result && (
            <div style={{
              background: 'rgba(143,163,184,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 14,
              fontSize: 12, color: '#8fa3b8', lineHeight: 1.6,
            }}>
              <strong style={{ color: '#f0f4ff' }}>Preliminary educational screening only.</strong>{' '}
              This tool does not determine loan approval, preapproval, creditworthiness,
              program eligibility, or the availability of down payment assistance.
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="aq-result">
              {/* Location map thumbnail */}
              <PropertyMap
                variant="thumbnail"
                address={location}
                height={180}
                overlay={
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(to top, rgba(6,10,16,0.85) 0%, transparent 100%)',
                    padding: '28px 20px 14px',
                    pointerEvents: 'none',
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(240,244,255,0.9)', lineHeight: 1.3 }}>
                      {locationLabel}
                    </div>
                  </div>
                }
              />

              {/* Area + AMI headline */}
              <div className="aq-result-header">
                <div className="aq-result-area">{locationLabel}</div>
                <div className="aq-ami-row">
                  <div className="aq-ami-val">{fmt(result.ami4Person)}</div>
                  <div className="aq-ami-lbl">
                    {result.dataSource === 'FHFA' ? (
                      <>Fannie Mae / Freddie Mac AMI · {result.fiscalYear} · 4-person</>
                    ) : (
                      <>
                        HUD {result.fiscalYear} Area Median Income · 4-person
                        <span style={{ display: 'block', fontSize: 11, color: '#f59e0b', marginTop: 3 }}>
                          ⚠ GSE AMI data not yet loaded for this county — HUD approximation shown
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Income meter */}
              <div className="aq-meter-wrap">
                <div className="aq-meter-top">
                  <div className="aq-meter-income">
                    Your income: <strong>{fmt(result.annualIncome)}</strong>
                    {' '}· {result.householdSize}-person household
                    {result.householdSize !== 4 && (
                      <span style={{ color: '#8fa3b8', fontSize: 12 }}>
                        {' '}(HUD {result.householdSize}-person AMI: {fmt(result.amiForHouseholdSize)})
                      </span>
                    )}
                  </div>
                  <div className="aq-meter-pct" style={{ color }}>
                    {result.incomeAsPctOfAmi}% of {result.householdSize}-person AMI
                    {!result.programs.homeReady && result.annualIncome > result.ami80pct && (
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#f59e0b', marginTop: 2 }}>
                        ${(result.annualIncome - result.ami80pct).toLocaleString()} above HomeReady / Home Possible limit
                      </div>
                    )}
                  </div>
                </div>
                <div className="aq-track">
                  <div
                    className="aq-fill"
                    style={{
                      width: meterWidth(pct),
                      background: `linear-gradient(90deg, ${color}55, ${color})`,
                    }}
                  >
                    <div
                      className="aq-cursor"
                      style={{ background: color, boxShadow: `0 0 8px ${color}88` }}
                    />
                  </div>
                </div>
                <div className="aq-ticks">
                  {['0%','50%','80%','100%','120%','150%'].map(t => (
                    <span key={t} className="aq-tick">{t}</span>
                  ))}
                </div>
              </div>

              {/* Program rows */}
              <div className="aq-programs">
                <div className="aq-section-lbl">AMI Threshold Screen · Preliminary Only</div>
                <div className="aq-prog-list">
                  {[
                    {
                      key: 'homeReady',
                      name: 'Fannie Mae HomeReady',
                      desc: `≤80% of applicable GSE AMI · ${fmt(result.ami80pct)} income limit · 3% down · reduced MI · verify final limit at Fannie AMI Lookup`,
                      pass: result.programs.homeReady,
                      passLabel: 'Under limit',
                      failLabel: 'Over limit',
                    },
                    {
                      key: 'homePossible',
                      name: 'Freddie Mac Home Possible',
                      desc: `≤80% of applicable GSE AMI · ${fmt(result.ami80pct)} income limit · 3% down · verify final limit at Freddie AMI Tool`,
                      pass: result.programs.homePossible,
                      passLabel: 'Under limit',
                      failLabel: 'Over limit',
                    },
                    {
                      key: 'dpa',
                      name: 'Down Payment Assistance / CRA',
                      desc: `HUD household-size-adjusted reference: ${fmt(result.ami120pct)} · Not derived from FHFA/GSE AMI · Actual program limits vary by lender, property, household, and funding source`,
                      pass: result.programs.dpa,
                      passLabel: result.dpaMatchCount > 0
                        ? `${result.dpaMatchCount} lender${result.dpaMatchCount !== 1 ? 's' : ''} on HomeRates`
                        : 'Threshold met',
                      failLabel: 'Over threshold',
                    },
                  ].map(p => {
                    const dpaNeutral = p.key === 'dpa' && p.pass && result.dpaMatchCount === 0;
                    const badgeState = dpaNeutral ? 'neutral' : p.pass ? 'pass' : 'fail';
                    const badgeLabel = dpaNeutral ? 'Worth reviewing' : p.pass ? p.passLabel : p.failLabel;
                    return (
                      <div key={p.key} className={`aq-prog-row${dpaNeutral ? ' neutral' : p.pass ? '' : ' fail'}`}>
                        <div className="aq-prog-left">
                          <div className="aq-prog-name">{p.name}</div>
                          <div className="aq-prog-desc">{p.desc}</div>
                          {p.key === 'dpa' && p.pass && result.dpaMatchCount > 0 && (
                            <Link href="/chat" style={{ fontSize: 11, color: '#00e87a', marginTop: 6, display: 'inline-block', fontWeight: 600 }}>
                              Connect to see available programs →
                            </Link>
                          )}
                          {dpaNeutral && (
                            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 5 }}>
                              Potential programs may be available — no active DPA programs are currently listed in the HomeRates marketplace for this area. Verify directly with your lender.
                            </div>
                          )}
                        </div>
                        <div className={`aq-prog-badge ${badgeState}`}>
                          <div className={`aq-dot ${badgeState}`} />
                          {badgeLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Limits table */}
              <div className="aq-limits">
                <div className="aq-section-lbl">
                  Income Limit Breakdown · {result.county}, {result.state}
                </div>
                <table className="aq-table">
                  <thead>
                    <tr>
                      <th>AMI Threshold</th>
                      <th>Programs</th>
                      <th>Income Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 50% AMI / VLI row intentionally omitted:
                        Real HUD Very Low Income limits are household-size-adjusted (il50_p1–p8).
                        A flat ami4×0.50 approximation has no backing program rule and would
                        recreate the same unsourced-benchmark problem as the DPA 120% row.
                        Restore this row once HUD VLI data is ingested (Priority 3 architectural). */}
                    <tr>
                      <td>
                        80% AMI{' '}
                        {result.dataSource === 'FHFA' ? (
                          <span className="aq-pill pill-green">FHFA 2026</span>
                        ) : (
                          <span className="aq-pill pill-amber">HUD approx.</span>
                        )}
                        <div style={{ fontSize: 10, color: '#8fa3b8', marginTop: 2, fontWeight: 400 }}>
                          4-person area AMI · no household adjustment · FHFA / Fannie & Freddie source
                          {result.dataSource !== 'FHFA' && ' · GSE figure may differ'}
                        </div>
                        <div style={{ fontSize: 10, color: '#8fa3b8', marginTop: 1, fontWeight: 400, opacity: 0.75 }}>
                          HUD and FHFA use different median estimates by program — both the 80% and DPA rows are correct for their respective purposes
                        </div>
                      </td>
                      <td>HomeReady · Home Possible</td>
                      <td>{fmt(result.ami80pct)}</td>
                    </tr>
                    <tr>
                      <td>100% AMI</td>
                      <td>Area median benchmark</td>
                      <td>{fmt(result.ami4Person)}</td>
                    </tr>
                    <tr>
                      <td>
                        HUD-Based DPA / CRA Reference
                        <div style={{ fontSize: 10, color: '#8fa3b8', marginTop: 2, fontWeight: 400 }}>
                          Household-size-adjusted screening threshold · not derived from FHFA/GSE AMI above
                        </div>
                      </td>
                      <td>DPA · bank CRA programs</td>
                      <td>{fmt(result.ami120pct)}</td>
                    </tr>
                    <tr className="aq-your-row">
                      <td>Your income</td>
                      <td>—</td>
                      <td>{fmt(result.annualIncome)} · {result.incomeAsPctOfAmi}% of {result.householdSize}-person AMI</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* CTAs */}
              <div className="aq-actions">
                <ShareAnswerButton
                  url={typeof window !== 'undefined' ? `${window.location.origin}/ami-qualifier` : 'https://chat.homerates.ai/ami-qualifier'}
                  question="AMI Income Qualifier"
                  answer={`${result.county}, ${result.state} — ${fmt(result.annualIncome)} is ${result.incomeAsPctOfAmi}% of AMI. HomeReady: ${result.programs.homeReady ? 'Eligible' : 'Over limit'}. Home Possible: ${result.programs.homePossible ? 'Eligible' : 'Over limit'}. DPA: ${result.programs.dpa ? 'Eligible' : 'Over limit'}.`}
                  label="Share"
                  className="aq-btn-sec"
                />
                {user ? (
                  <button
                    onClick={handleSave}
                    disabled={saving || !!savedId}
                    className="aq-btn-sec"
                    style={{ cursor: saving || savedId ? 'default' : 'pointer', color: savedId ? '#00e87a' : undefined, borderColor: savedId ? 'rgba(0,232,122,0.3)' : undefined }}
                  >
                    {saving ? 'Saving…' : savedId ? '✓ Saved' : '🔖 Save'}
                  </button>
                ) : (
                  <Link href="/sign-in" className="aq-btn-sec" style={{ fontSize: 12 }}>
                    Sign in to save
                  </Link>
                )}
                <Link
                  href={(() => {
                    const income = `$${result.annualIncome.toLocaleString()}`;
                    const area = result.resolvedFrom === 'address'
                      ? location
                      : `${result.county}, ${result.state}`;
                    const sq = result.resolvedFrom === 'address'
                      ? `I make ${income} a year — run my scenario for ${area}`
                      : `I make ${income} a year — how much home can I afford in ${area}?`;
                    return `/chat?${new URLSearchParams({ sq }).toString()}`;
                  })()}
                  className="aq-btn-pri"
                >
                  Run My Numbers →
                </Link>
              </div>

              {/* Fannie Mae cross-check detail view */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => setDetailOpen(o => !o)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 24px', background: 'transparent', border: 'none', cursor: 'pointer',
                    color: '#8fa3b8', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  }}
                >
                  <span>Detailed View — Fannie Mae Cross-Check Format</span>
                  <span style={{ fontSize: 10 }}>{detailOpen ? '▲' : '▼'}</span>
                </button>

                {detailOpen && (
                  <div style={{ padding: '0 24px 20px' }}>
                    {/* County + FIPS header */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff', marginBottom: 2 }}>
                        {result.county} County, {result.state}
                      </div>
                      {result.countyFips && (
                        <div style={{ fontSize: 11, color: '#8fa3b8' }}>
                          County FIPS: {result.countyFips}
                          {result.conformingLimits?.isHighBalance && (
                            <span style={{ marginLeft: 8, background: 'rgba(61,139,255,0.13)', color: '#3d8bff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, letterSpacing: 0.3 }}>
                              HIGH COST AREA
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* AMI tiers — mirrors Fannie Mae tool format */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#8fa3b8', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                        Area Median Income · {result.fiscalYear}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', fontSize: 10, color: '#8fa3b8', paddingBottom: 8, opacity: 0.7, fontWeight: 600 }}>Threshold</th>
                            <th style={{ textAlign: 'left', fontSize: 10, color: '#8fa3b8', paddingBottom: 8, opacity: 0.7, fontWeight: 600 }}>Program</th>
                            <th style={{ textAlign: 'right', fontSize: 10, color: '#8fa3b8', paddingBottom: 8, opacity: 0.7, fontWeight: 600 }}>Income Limit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: '120% AMI', program: 'DPA / Bank CRA Reference', val: result.ami120pct, note: 'HUD household-adjusted' },
                            { label: '100% AMI', program: 'Area Median', val: result.ami4Person },
                            { label: '80% AMI',  program: 'HomeReady · Home Possible', val: result.ami80pct, highlight: true },
                            { label: '50% AMI',  program: 'VLI Reference (flat)', val: result.ami50pct, note: 'Approximate — see HUD for exact VLI' },
                          ].map(row => (
                            <tr key={row.label}>
                              <td style={{ padding: '9px 0', fontSize: 13, color: '#8fa3b8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{row.label}</td>
                              <td style={{ padding: '9px 0', fontSize: 12, color: '#8fa3b8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                {row.program}
                                {row.note && <div style={{ fontSize: 10, opacity: 0.6, marginTop: 1 }}>{row.note}</div>}
                              </td>
                              <td style={{ padding: '9px 0', fontSize: 13, fontWeight: row.highlight ? 800 : 700, color: row.highlight ? '#00e87a' : '#f0f4ff', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                {fmt(row.val)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Conforming loan limits */}
                    {result.conformingLimits && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#8fa3b8', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                          Conforming Loan Limits · {result.county} County · 2026
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              {['1-Unit','2-Unit','3-Unit','4-Unit'].map(u => (
                                <th key={u} style={{ textAlign: u === '1-Unit' ? 'left' : 'right', fontSize: 10, color: '#8fa3b8', paddingBottom: 8, opacity: 0.7, fontWeight: 600 }}>{u}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {[result.conformingLimits.units1, result.conformingLimits.units2, result.conformingLimits.units3, result.conformingLimits.units4].map((val, i) => (
                                <td key={i} style={{ padding: '9px 0', fontSize: 13, fontWeight: 700, color: '#f0f4ff', textAlign: i === 0 ? 'left' : 'right' }}>
                                  {fmt(val)}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                        <div style={{ fontSize: 10, color: '#8fa3b8', marginTop: 6, opacity: 0.6 }}>
                          Source: FHFA CY2026 · Fannie Mae / Freddie Mac conforming limits
                          {result.conformingLimits.isHighBalance ? ' · High-balance county' : ' · Standard conforming'}
                        </div>
                      </div>
                    )}

                    {/* Flags not in our data */}
                    <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(143,163,184,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#8fa3b8', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>Special Designations</div>
                      <div style={{ fontSize: 11, color: '#8fa3b8', lineHeight: 1.6, opacity: 0.8 }}>
                        Designated Disaster Area and High Opportunity Area flags (shown in the Fannie Mae tool) are not in HomeRates&apos; current dataset. Verify at{' '}
                        <a href="https://ami-lookup-tool.fanniemae.com" target="_blank" rel="noopener noreferrer" style={{ color: '#3d8bff' }}>ami-lookup-tool.fanniemae.com</a>.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FFIEC federal tract designation card */}
          {ffiec && ffiec.method !== 'unresolved' && result && (
            <div className="aq-result" style={{ marginBottom: 14 }}>

              {/* Header */}
              <div className="aq-result-header">
                <div className="aq-result-area">
                  {ffiec.method === 'geocoded'
                    ? `Federal Area Designation · Census Tract ${ffiec.census_tract_geoid}`
                    : `Federal Area Estimate · ${result.county}, ${result.state} · County Level`}
                </div>

                {ffiec.method === 'geocoded' && ffiec.tract_income_level && (
                  <div className="aq-ami-row" style={{ marginTop: 10 }}>
                    <div>
                      <span className={`aq-tier-chip ${
                        ffiec.tract_income_level === 'Low' || ffiec.tract_income_level === 'Moderate'
                          ? 'tier-lo-mod' : 'tier-mid-up'
                      }`}>
                        {ffiec.tract_income_level}
                      </span>
                      <span className="aq-ami-lbl">income area under federal guidelines</span>
                    </div>
                  </div>
                )}

                {ffiec.method === 'county_fallback' && (
                  <div className="aq-ami-row" style={{ marginTop: 8 }}>
                    <span className="aq-ami-lbl">Exact census tract not confirmed — county-level area estimate</span>
                  </div>
                )}
              </div>

              {/* Designation details — geocoded path only */}
              {ffiec.method === 'geocoded' && (ffiec.distressed_underserved || ffiec.tract_eligible) && (
                <div className="aq-programs">
                  <div className="aq-section-lbl">Area Characteristics</div>
                  <div className="aq-prog-list">
                    {ffiec.distressed_underserved && (
                      <div className="aq-prog-row">
                        <div className="aq-prog-left">
                          <div className="aq-prog-name">Distressed or Underserved</div>
                          <div className="aq-prog-desc">
                            This area carries a federal distressed or underserved designation
                            under FFIEC Community Reinvestment Act guidelines.
                          </div>
                        </div>
                        <div className="aq-prog-badge pass">
                          <div className="aq-dot pass" />
                          Designated
                        </div>
                      </div>
                    )}
                    {ffiec.tract_eligible && (
                      <div className="aq-prog-row">
                        <div className="aq-prog-left">
                          <div className="aq-prog-name">Program Relevance</div>
                          <div className="aq-prog-desc">
                            This tract designation may be relevant for certain lender programs.
                            Contact your loan officer for details specific to this property.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CRA / Census-Tract context note — no income-limit math per audit guidance */}
              <div className="aq-limits">
                <div className="aq-section-lbl">
                  CRA / Census-Tract Context
                  {ffiec.method === 'county_fallback' && ' · County Estimate'}
                </div>
                <div style={{ fontSize: 11, color: '#8fa3b8', marginBottom: 12, lineHeight: 1.5 }}>
                  CRA and census-tract reference point only — not a loan-program income limit or DPA approval.
                  FFIEC does not publish household-adjusted borrower income limits.
                </div>
                {ffiec.method === 'county_fallback' && (
                  <div className="aq-ffiec-county-note">
                    Exact property location wasn't confirmed — county-level area estimate only,
                    not a specific census tract.
                  </div>
                )}
                {ffiec.geocode_vintage_used && ffiec.geocode_vintage_used !== 'Current_Current' && (
                  <div style={{
                    fontSize: 11, color: '#8fa3b8', marginTop: 8,
                    padding: '8px 12px', background: 'rgba(143,163,184,0.06)',
                    border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, lineHeight: 1.5,
                  }}>
                    Census tract matched using {ffiec.geocode_vintage_used.replace('_Current', '')} reference data —
                    the most recent Census release did not include this address.
                  </div>
                )}
              </div>

              {/* Disclaimer */}
              <div className="aq-ffiec-disclaimer">
                <p>
                  Estimates only, based on published federal data (FFIEC 2025 Census Flat File) — not a loan
                  determination. Tract classifications reflect CRA community development
                  designations and are separate from the FHFA / GSE AMI figures shown above.
                </p>
              </div>
            </div>
          )}

          {/* Data note */}
          {result && (
            <div className="aq-note">
              <div className="aq-note-lbl">Data Source &amp; Limitations</div>
              {result.dataSource === 'FHFA' ? (
                <p>
                  <strong style={{ color: '#00e87a', fontWeight: 700 }}>GSE AMI source active.</strong>{' '}
                  HomeReady / Home Possible limits use the Fannie Mae / Freddie Mac Area Median Income
                  (sourced from Freddie Mac&apos;s published MFI file, effective 2026). For final determination,
                  run the subject property address through DU or LPA, or verify at{' '}
                  <a href="https://ami-lookup-tool.fanniemae.com" target="_blank" rel="noopener noreferrer"
                    style={{ color: '#00e87a' }}>Fannie Mae AMI Lookup</a>
                  {' '}·{' '}
                  <a href="https://sf.freddiemac.com/working-with-us/affordable-lending/area-median-income-and-property-eligibility-tool"
                    target="_blank" rel="noopener noreferrer" style={{ color: '#00e87a' }}>Freddie Mac AMI Tool</a>.
                  DPA / 120% limits use HUD household-size adjusted figures.
                </p>
              ) : (
                <p>
                  <strong style={{ color: '#f59e0b', fontWeight: 700 }}>HUD approximation.</strong>{' '}
                  FHFA/GSE AMI data is not yet loaded for this county. Figures are from HUD
                  FY2026 Income Limits and may differ from the Fannie Mae / Freddie Mac AMI
                  used in DU/LPA. Verify at{' '}
                  <a href="https://ami-lookup-tool.fanniemae.com" target="_blank" rel="noopener noreferrer"
                    style={{ color: '#00e87a' }}>Fannie Mae AMI Lookup</a>
                  {' '}·{' '}
                  <a href="https://sf.freddiemac.com/working-with-us/affordable-lending/area-median-income-and-property-eligibility-tool"
                    target="_blank" rel="noopener noreferrer" style={{ color: '#00e87a' }}>Freddie Mac AMI Tool</a>.
                </p>
              )}
            </div>
          )}

          {/* Admin debug panel — admin role AND exact email gate */}
          {isDebugUser && rawResponse && (
            <AmiDebugPanel raw={rawResponse} />
          )}

          <div className="aq-disclosure">{EDUCATIONAL_DISCLAIMER}</div>
        </main>
          </div>{/* end aq-main-wrap */}

          {/* Right rail — saved lookups */}
          <aside className="aq-saved-rail">
            <AmiSavedRail
              user={user}
              userLoaded={userLoaded}
              items={railItems}
              loaded={railLoaded}
              onRerun={handleRerun}
            />
          </aside>
        </div>{/* end aq-layout */}
      </div>
    </>
  );
}
