'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, SignOutButton } from '@clerk/nextjs';

interface ProfileData {
  role: string;
  full_name: string;
  email: string;
  digest_enabled?: boolean;
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [digest, setDigest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(d => {
        setProfile(d);
        setDigest(d.digest_enabled ?? false);
      })
      .catch(() => {});
  }, []);

  async function toggleDigest() {
    setSaving(true);
    const next = !digest;
    setDigest(next);
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digest_enabled: next }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setDigest(!next);
    } finally {
      setSaving(false);
    }
  }

  const roleLabel = (r: string) =>
    r === 'lo' ? 'Loan Officer' : r === 'agent' ? 'Real Estate Agent' : 'Borrower';

  return (
    <>
      <style>{`
        body:has(.st-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.st-root){height:auto!important;overflow:visible!important;}
        body:has(.st-root) .app-footer{display:none!important;}
        .st-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:var(--font-dm-sans,'DM Sans',system-ui,sans-serif);}
        .st-container{max-width:600px;margin:0 auto;padding:2.5rem 1.5rem 6rem;}
        .st-heading{font-size:1.5rem;font-weight:800;color:#f0f4ff;margin:0 0 2rem;letter-spacing:-0.02em;}
        .st-section{background:#0e1420;border:1px solid rgba(255,255,255,0.07);border-radius:14px;margin-bottom:1.25rem;overflow:hidden;}
        .st-section-label{font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8fa3b8;padding:1.1rem 1.25rem 0.5rem;}
        .st-row{display:flex;align-items:center;justify-content:space-between;padding:0.85rem 1.25rem;border-top:1px solid rgba(255,255,255,0.05);}
        .st-row:first-of-type{border-top:none;}
        .st-row-label{font-size:0.9rem;color:#f0f4ff;}
        .st-row-value{font-size:0.85rem;color:#8fa3b8;}
        .st-link{font-size:0.85rem;color:#00e87a;text-decoration:none;}
        .st-link:hover{text-decoration:underline;}
        .st-toggle{position:relative;width:44px;height:24px;cursor:pointer;flex-shrink:0;}
        .st-toggle input{opacity:0;width:0;height:0;position:absolute;}
        .st-toggle-track{position:absolute;inset:0;background:rgba(255,255,255,0.1);border-radius:12px;transition:background 0.2s;}
        .st-toggle input:checked + .st-toggle-track{background:#00e87a;}
        .st-toggle-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:transform 0.2s;}
        .st-toggle input:checked ~ .st-toggle-thumb{transform:translateX(20px);}
        .st-saved{font-size:0.75rem;color:#00e87a;margin-left:8px;}
        .st-signout button{background:none;border:none;color:#ff5f5f;font-size:0.9rem;font-family:inherit;cursor:pointer;padding:0;}
        .st-signout button:hover{text-decoration:underline;}
      `}</style>
      <div className="st-root">
        <div className="st-container">
          <h1 className="st-heading">Settings</h1>

          {/* Account */}
          <div className="st-section">
            <div className="st-section-label">Account</div>
            <div className="st-row">
              <span className="st-row-label">Name</span>
              <span className="st-row-value">
                {isLoaded ? (user?.fullName ?? '—') : '…'}
              </span>
            </div>
            <div className="st-row">
              <span className="st-row-label">Email</span>
              <span className="st-row-value">
                {profile?.email ?? (isLoaded ? user?.primaryEmailAddress?.emailAddress : '…') ?? '—'}
              </span>
            </div>
            <div className="st-row">
              <span className="st-row-label">Account type</span>
              <span className="st-row-value">{profile ? roleLabel(profile.role) : '…'}</span>
            </div>
            <div className="st-row">
              <span className="st-row-label">Profile &amp; credentials</span>
              <Link href="/profile" className="st-link">Edit profile →</Link>
            </div>
          </div>

          {/* Notifications */}
          <div className="st-section">
            <div className="st-section-label">Notifications</div>
            <div className="st-row">
              <span className="st-row-label">
                Weekly property digest
                {saved && <span className="st-saved">Saved</span>}
              </span>
              <label className="st-toggle" aria-label="Toggle weekly digest">
                <input
                  type="checkbox"
                  checked={digest}
                  onChange={toggleDigest}
                  disabled={saving}
                />
                <span className="st-toggle-track" />
                <span className="st-toggle-thumb" />
              </label>
            </div>
          </div>

          {/* Sign out */}
          <div className="st-section">
            <div className="st-row">
              <span className="st-row-label">Sign out of HomeRates.ai</span>
              <span className="st-signout">
                <SignOutButton redirectUrl="/">
                  <button>Sign out</button>
                </SignOutButton>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
