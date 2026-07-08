'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import PropertyMap from '@/components/PropertyMap';

interface SavedItem {
  id: string;
  title: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
  data: {
    county?: string;
    state?: string;
    ami4Person?: number;
    amiForHouseholdSize?: number;
    incomeAsPctOfAmi?: number;
    householdSize?: number;
    annualIncome?: number;
    programs?: { homeReady: boolean; homePossible: boolean };
    dataSource?: 'FHFA' | 'HUD';
    fiscalYear?: number;
  };
}

function fmt(n: number) { return '$' + n.toLocaleString(); }

function eligibilityLine(item: SavedItem): string {
  const d = item.data;
  const pct = d.incomeAsPctOfAmi;
  const size = d.householdSize ?? 4;
  if (!pct) return '—';
  return `${pct}% of ${size}-person AMI${d.programs?.homeReady ? ' · HomeReady eligible' : ''}`;
}

export default function AmiSavedPage() {
  const { user, isLoaded } = useUser();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) { setLoading(false); return; }
    fetch('/api/ami-qualifier/save')
      .then(r => r.json())
      .then(j => { if (j.ok) setItems(j.items ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, isLoaded]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/ami-qualifier/save?id=${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
    setDeletingId(null);
  }

  return (
    <>
      <style>{`
        body:has(.aqsv-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.aqsv-root){height:auto!important;overflow:visible!important;}
        body:has(.aqsv-root) .app-footer{display:none!important;}

        .aqsv-root{min-height:100vh;width:100%;background:#080c12;color:#f0f4ff;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;}
        .aqsv-root *{box-sizing:border-box;}

        .aqsv-header{position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.92);backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);}
        .aqsv-header-inner{max-width:700px;margin:0 auto;padding:0 24px;height:56px;
          display:flex;align-items:center;gap:16px;}
        .aqsv-back{font-size:13px;color:#8fa3b8;text-decoration:none;display:flex;
          align-items:center;gap:5px;}
        .aqsv-back:hover{color:#f0f4ff;}
        .aqsv-head-title{font-size:14px;font-weight:700;color:#f0f4ff;}

        .aqsv-main{width:100%;max-width:700px;padding:28px 16px 60px;}
        .aqsv-eyebrow{font-size:11px;font-weight:700;color:#00e87a;letter-spacing:1px;
          text-transform:uppercase;margin-bottom:8px;}
        .aqsv-title{font-size:1.4rem;font-weight:800;color:#f0f4ff;margin:0 0 24px;letter-spacing:-0.3px;}

        .aqsv-empty{background:#0e1420;border:1px solid rgba(255,255,255,0.07);
          border-radius:14px;padding:40px 24px;text-align:center;}
        .aqsv-empty-icon{font-size:32px;margin-bottom:12px;}
        .aqsv-empty-text{font-size:14px;color:#8fa3b8;margin-bottom:16px;}
        .aqsv-empty-cta{display:inline-block;padding:10px 20px;background:#00e87a;color:#000;
          border-radius:8px;font-size:14px;font-weight:800;text-decoration:none;}

        .aqsv-list{display:flex;flex-direction:column;gap:12px;}

        .aqsv-row{background:#0e1420;border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;overflow:hidden;display:flex;align-items:stretch;min-height:80px;}
        .aqsv-row-map{width:88px;flex-shrink:0;position:relative;background:#0a1628;}
        .aqsv-row-body{flex:1;padding:14px 16px;min-width:0;}
        .aqsv-row-county{font-size:12px;color:#8fa3b8;margin-bottom:3px;}
        .aqsv-row-addr{font-size:13px;font-weight:700;color:#f0f4ff;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px;}
        .aqsv-row-result{font-size:12px;color:#8fa3b8;line-height:1.4;}
        .aqsv-row-result strong{color:#00e87a;}
        .aqsv-row-ami{font-size:12px;color:#8fa3b8;margin-top:2px;}
        .aqsv-row-date{font-size:10px;color:#8fa3b8;opacity:0.5;margin-top:4px;}
        .aqsv-row-actions{display:flex;align-items:center;padding:0 14px;gap:8px;flex-shrink:0;}
        .aqsv-btn-run{padding:7px 13px;background:#00e87a;color:#000;border:none;
          border-radius:7px;font-size:12px;font-weight:800;cursor:pointer;
          text-decoration:none;display:flex;align-items:center;white-space:nowrap;
          font-family:inherit;}
        .aqsv-btn-del{padding:7px 10px;border:1px solid rgba(255,95,95,0.2);
          border-radius:7px;font-size:12px;color:#ff5f5f;cursor:pointer;background:transparent;
          font-family:inherit;transition:background 0.15s;}
        .aqsv-btn-del:hover{background:rgba(255,95,95,0.08);}
        .aqsv-btn-del:disabled{opacity:0.4;cursor:not-allowed;}

        .aqsv-auth-wall{background:#0e1420;border:1px solid rgba(255,255,255,0.07);
          border-radius:14px;padding:48px 24px;text-align:center;}
        .aqsv-auth-text{font-size:14px;color:#8fa3b8;margin-bottom:16px;}

        @media(max-width:500px){
          .aqsv-row-map{width:64px;}
          .aqsv-row-actions{flex-direction:column;padding:10px 10px 10px 0;}
        }
      `}</style>

      <div className="aqsv-root">
        <div className="aqsv-header">
          <div className="aqsv-header-inner">
            <Link href="/ami-qualifier" className="aqsv-back">← AMI Qualifier</Link>
            <span className="aqsv-head-title">Saved Lookups</span>
          </div>
        </div>

        <main className="aqsv-main">
          <div className="aqsv-eyebrow">AMI Qualifier</div>
          <h1 className="aqsv-title">Your Saved Lookups</h1>

          {!isLoaded || loading ? (
            <div style={{ color: '#8fa3b8', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
              Loading…
            </div>
          ) : !user ? (
            <div className="aqsv-auth-wall">
              <div className="aqsv-empty-icon">🔐</div>
              <p className="aqsv-auth-text">Sign in to save and revisit AMI Qualifier results.</p>
              <Link href="/sign-in" className="aqsv-empty-cta">Sign In</Link>
            </div>
          ) : items.length === 0 ? (
            <div className="aqsv-empty">
              <div className="aqsv-empty-icon">📋</div>
              <p className="aqsv-empty-text">No saved lookups yet. Run a check and hit "Save" to bookmark it here.</p>
              <Link href="/ami-qualifier" className="aqsv-empty-cta">Run a Lookup</Link>
            </div>
          ) : (
            <div className="aqsv-list">
              {items.map(item => {
                const d = item.data;
                const pct = d.incomeAsPctOfAmi;
                const eligColor = pct == null ? '#8fa3b8' : pct <= 80 ? '#00e87a' : pct <= 120 ? '#f59e0b' : '#ff5f5f';
                const runUrl = item.address
                  ? `/ami-qualifier?location=${encodeURIComponent(item.address)}&income=${d.annualIncome ?? ''}&size=${d.householdSize ?? 4}`
                  : '/ami-qualifier';

                return (
                  <div key={item.id} className="aqsv-row">
                    {/* Part A — small right-side thumbnail */}
                    <div className="aqsv-row-map">
                      <PropertyMap
                        variant="thumbnail"
                        address={item.address ?? undefined}
                        height={80}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>

                    <div className="aqsv-row-body">
                      {d.county && d.state && (
                        <div className="aqsv-row-county">{d.county}, {d.state}</div>
                      )}
                      <div className="aqsv-row-addr">{item.address ?? item.title ?? '—'}</div>
                      <div className="aqsv-row-result">
                        <strong style={{ color: eligColor }}>
                          {pct != null ? `${pct}% of AMI` : '—'}
                        </strong>
                        {d.programs?.homeReady && (
                          <span style={{ marginLeft: 8, color: '#00e87a', fontSize: 11 }}>· HomeReady eligible</span>
                        )}
                        {d.programs && !d.programs.homeReady && (
                          <span style={{ marginLeft: 8, color: '#8fa3b8', fontSize: 11 }}>· Over HomeReady limit</span>
                        )}
                      </div>
                      {d.ami4Person && (
                        <div className="aqsv-row-ami">
                          Area AMI: {fmt(d.ami4Person)} · Income checked: {d.annualIncome ? fmt(d.annualIncome) : '—'}
                        </div>
                      )}
                      <div className="aqsv-row-date">
                        Saved {new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>

                    <div className="aqsv-row-actions">
                      <Link href={runUrl} className="aqsv-btn-run">Re-run →</Link>
                      <button
                        className="aqsv-btn-del"
                        disabled={deletingId === item.id}
                        onClick={() => handleDelete(item.id)}
                      >
                        {deletingId === item.id ? '…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
