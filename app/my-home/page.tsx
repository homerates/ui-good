'use client';

import { useEffect, useState } from 'react';
import { useUser, SignInButton, SignedIn, SignedOut } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';

interface HomeownerRecord {
  property_address: string | null;
  digest_enabled: boolean;
  updated_at: string;
  name: string | null;
  email: string | null;
}

export default function MyHomePage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [record, setRecord]       = useState<HomeownerRecord | null>(null);
  const [loading, setLoading]     = useState(true);
  const [address, setAddress]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [editing, setEditing]     = useState(false);
  const [digestOn, setDigestOn]   = useState(true);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch('/api/homeowner/save')
      .then(r => r.json())
      .then(({ homeowner }) => {
        setRecord(homeowner);
        if (homeowner) {
          setAddress(homeowner.property_address ?? '');
          setDigestOn(homeowner.digest_enabled ?? true);
        }
      })
      .finally(() => setLoading(false));
  }, [isLoaded, user]);

  async function saveAddress() {
    if (!address.trim()) return;
    setSaving(true);
    const res = await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim(), digest_enabled: digestOn }),
    });
    const { homeowner } = await res.json();
    setRecord(homeowner);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setSaving(false);
  }

  async function toggleDigest(val: boolean) {
    setDigestOn(val);
    await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digest_enabled: val }),
    });
  }

  function runAnalysis() {
    if (!record?.property_address) return;
    const q = `Run a complete homeowner analysis for ${record.property_address}: current estimated value, how much equity I likely have, whether today's rates make refinancing worth it, and my monthly payment if I cash-out refinanced.`;
    router.push(`/chat?sq=${encodeURIComponent(q)}`);
  }

  const inlineStyles = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html:has(.mh-root){height:auto!important;overflow:visible!important}
    body:has(.mh-root){display:block!important;height:auto!important;overflow:visible!important;background:#0a0a0f!important}
    .mh-root{min-height:100vh;background:#0a0a0f;color:#f0f0f0;font-family:'Inter',system-ui,sans-serif}

    /* NAV */
    .mh-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(10,10,15,0.95);border-bottom:1px solid rgba(255,255,255,0.07)}
    .mh-logo img{height:26px;display:block}

    /* SHELL */
    .mh-shell{max-width:760px;margin:0 auto;padding:3rem 1.5rem 5rem}

    /* SIGN IN STATE */
    .mh-signin-box{text-align:center;padding:5rem 2rem;border:1px solid rgba(255,255,255,0.08);border-radius:20px;background:rgba(255,255,255,0.02)}
    .mh-signin-box h2{font-size:1.6rem;font-weight:700;margin-bottom:0.75rem}
    .mh-signin-box p{color:rgba(255,255,255,0.55);margin-bottom:2rem;font-size:0.95rem}
    .mh-signin-cta{display:inline-block;padding:0.75rem 2rem;background:#22c55e;color:#000;font-weight:700;border-radius:10px;font-size:1rem;cursor:pointer;border:none;transition:background 0.2s}
    .mh-signin-cta:hover{background:#16a34a}

    /* LOADING */
    .mh-loading{text-align:center;padding:6rem 0;color:rgba(255,255,255,0.4);font-size:0.95rem}

    /* HEADER ROW */
    .mh-header{margin-bottom:2.5rem}
    .mh-header h1{font-size:2rem;font-weight:800;letter-spacing:-0.03em;margin-bottom:0.4rem}
    .mh-header p{color:rgba(255,255,255,0.5);font-size:0.95rem}

    /* CARDS */
    .mh-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:16px;padding:1.75rem 2rem;margin-bottom:1.25rem}
    .mh-card-label{font-size:0.7rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:0.75rem}

    /* ADDRESS CARD */
    .mh-address-display{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
    .mh-address-text{font-size:1.1rem;font-weight:600;color:#fff}
    .mh-edit-btn{font-size:0.8rem;color:rgba(255,255,255,0.45);background:rgba(255,255,255,0.06);border:none;border-radius:6px;padding:0.3rem 0.75rem;cursor:pointer;transition:all 0.2s}
    .mh-edit-btn:hover{color:#fff;background:rgba(255,255,255,0.1)}

    /* ADDRESS FORM */
    .mh-form{display:flex;flex-direction:column;gap:0.75rem}
    .mh-input{width:100%;padding:0.75rem 1rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#fff;font-size:0.95rem;outline:none;transition:border-color 0.2s}
    .mh-input:focus{border-color:#22c55e}
    .mh-input::placeholder{color:rgba(255,255,255,0.3)}
    .mh-form-row{display:flex;gap:0.75rem}
    .mh-save-btn{flex:1;padding:0.75rem;background:#22c55e;color:#000;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:0.95rem;transition:background 0.2s}
    .mh-save-btn:hover{background:#16a34a}
    .mh-save-btn:disabled{opacity:0.5;cursor:not-allowed}
    .mh-cancel-btn{padding:0.75rem 1.25rem;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);border:none;border-radius:10px;cursor:pointer;font-size:0.95rem;transition:all 0.2s}
    .mh-cancel-btn:hover{background:rgba(255,255,255,0.1);color:#fff}
    .mh-saved-msg{font-size:0.8rem;color:#22c55e;text-align:center}

    /* ANALYSIS BUTTON */
    .mh-analysis-btn{width:100%;padding:1rem;background:linear-gradient(135deg,#22c55e,#16a34a);color:#000;font-weight:800;font-size:1rem;border:none;border-radius:12px;cursor:pointer;transition:opacity 0.2s;margin-top:0.25rem}
    .mh-analysis-btn:hover{opacity:0.85}

    /* DIGEST TOGGLE */
    .mh-digest-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}
    .mh-digest-info h3{font-size:1rem;font-weight:600;margin-bottom:0.2rem}
    .mh-digest-info p{font-size:0.82rem;color:rgba(255,255,255,0.45);line-height:1.4}
    .mh-toggle{position:relative;width:48px;height:26px;flex-shrink:0}
    .mh-toggle input{opacity:0;width:0;height:0;position:absolute}
    .mh-toggle-track{position:absolute;inset:0;background:rgba(255,255,255,0.12);border-radius:13px;cursor:pointer;transition:background 0.25s}
    .mh-toggle input:checked+.mh-toggle-track{background:#22c55e}
    .mh-toggle-track::after{content:'';position:absolute;left:3px;top:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform 0.25s}
    .mh-toggle input:checked+.mh-toggle-track::after{transform:translateX(22px)}

    /* QUICK LINKS */
    .mh-quick-links{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.5rem}
    .mh-quick-link{display:flex;align-items:center;gap:0.6rem;padding:0.85rem 1rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;text-decoration:none;color:rgba(255,255,255,0.7);font-size:0.875rem;font-weight:500;transition:all 0.2s}
    .mh-quick-link:hover{background:rgba(255,255,255,0.08);color:#fff;border-color:rgba(255,255,255,0.15)}
    .mh-quick-link-icon{font-size:1.1rem}

    /* NO ADDRESS STATE */
    .mh-no-address h2{font-size:1.3rem;font-weight:700;margin-bottom:0.5rem}
    .mh-no-address p{color:rgba(255,255,255,0.5);font-size:0.9rem;margin-bottom:1.5rem;line-height:1.6}

    @media(max-width:600px){
      .mh-shell{padding:2rem 1rem 4rem}
      .mh-header h1{font-size:1.5rem}
      .mh-quick-links{grid-template-columns:1fr}
      .mh-address-display{flex-direction:column;align-items:flex-start}
    }
  `;

  const hasAddress = record && record.property_address;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: inlineStyles }} />
      <div className="mh-root">
        {/* NAV */}
        <nav className="mh-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href="/" className="mh-logo"><img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" /></Link>
          <AppNav drawerOnly />
        </nav>

        <div className="mh-shell">
          {/* UNAUTHENTICATED */}
          <SignedOut>
            <div className="mh-signin-box">
              <h2>Your Home, Analyzed for Free</h2>
              <p>Sign in to save your property, monitor equity, and get a monthly digest — no agent or lender required.</p>
              <SignInButton mode="modal">
                <button className="mh-signin-cta">Sign In — See My Home Value</button>
              </SignInButton>
            </div>
          </SignedOut>

          {/* AUTHENTICATED */}
          <SignedIn>
            {loading ? (
              <div className="mh-loading">Loading your home profile…</div>
            ) : (
              <>
                <div className="mh-header">
                  <h1>My Home</h1>
                  <p>
                    {user?.firstName ? `Welcome back, ${user.firstName}.` : 'Welcome back.'}{' '}
                    {hasAddress ? 'Your property analysis is below.' : 'Add your address to get started.'}
                  </p>
                </div>

                {/* ADDRESS CARD */}
                <div className="mh-card">
                  <div className="mh-card-label">Property Address</div>

                  {hasAddress && !editing ? (
                    <>
                      <div className="mh-address-display">
                        <span className="mh-address-text">{record.property_address}</span>
                        <button className="mh-edit-btn" onClick={() => setEditing(true)}>Edit</button>
                      </div>

                      <button className="mh-analysis-btn" style={{ marginTop: '1.25rem' }} onClick={runAnalysis}>
                        Run Full Home Analysis →
                      </button>
                    </>
                  ) : (
                    <div className={hasAddress ? '' : 'mh-no-address'}>
                      {!hasAddress && (
                        <>
                          <h2>Add Your Property</h2>
                          <p>Enter your home address to unlock equity tracking, rate alerts, and a monthly homeowner digest delivered to your inbox.</p>
                        </>
                      )}
                      <div className="mh-form">
                        <input
                          className="mh-input"
                          placeholder="e.g. 1234 Oak Street, Los Angeles, CA 90001"
                          value={address}
                          onChange={e => setAddress(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveAddress()}
                        />
                        <div className="mh-form-row">
                          <button className="mh-save-btn" onClick={saveAddress} disabled={saving || !address.trim()}>
                            {saving ? 'Saving…' : 'Save Address'}
                          </button>
                          {editing && (
                            <button className="mh-cancel-btn" onClick={() => { setEditing(false); setAddress(record?.property_address ?? ''); }}>
                              Cancel
                            </button>
                          )}
                        </div>
                        {saved && <div className="mh-saved-msg">Address saved!</div>}
                      </div>
                    </div>
                  )}
                </div>

                {/* DIGEST TOGGLE */}
                <div className="mh-card">
                  <div className="mh-card-label">Monthly Digest</div>
                  <div className="mh-digest-row">
                    <div className="mh-digest-info">
                      <h3>Home Digest Email</h3>
                      <p>Receive a monthly snapshot: estimated value, equity position, rate movement, and whether a refi makes sense — sent to {user?.emailAddresses?.[0]?.emailAddress ?? 'your email'}.</p>
                    </div>
                    <label className="mh-toggle">
                      <input
                        type="checkbox"
                        checked={digestOn}
                        onChange={e => toggleDigest(e.target.checked)}
                      />
                      <span className="mh-toggle-track" />
                    </label>
                  </div>
                </div>

                {/* QUICK LINKS */}
                <div className="mh-card">
                  <div className="mh-card-label">Explore</div>
                  <div className="mh-quick-links">
                    <Link href="/chat" className="mh-quick-link">
                      <span className="mh-quick-link-icon">💬</span> Ask a mortgage question
                    </Link>
                    <Link href="/knowledge-hub" className="mh-quick-link">
                      <span className="mh-quick-link-icon">📚</span> Knowledge Hub
                    </Link>
                    <Link href="/market-news" className="mh-quick-link">
                      <span className="mh-quick-link-icon">📈</span> Market News
                    </Link>
                    <Link href="/homeowner" className="mh-quick-link">
                      <span className="mh-quick-link-icon">🏡</span> Why HomeRates.ai
                    </Link>
                  </div>
                </div>
              </>
            )}
          </SignedIn>
        </div>
      </div>
    </>
  );
}
