'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';

export default function HomeownerPage() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    const q = address.trim();
    if (!q) return;
    const question = `Run a complete homeowner analysis for ${q}: current estimated value, how much equity I likely have, whether today's rates make refinancing worth it, and my monthly payment if I cash-out refinanced.`;
    router.push('/chat?sq=' + encodeURIComponent(question));
  }

  // Typewriter placeholder
  useEffect(() => {
    const examples = [
      '123 Main St, San Jose CA 95110',
      '4521 Oak Avenue, Los Angeles CA 90036',
      '789 Maple Drive, San Diego CA 92101',
      '2200 Broadway, Sacramento CA 95818',
    ];
    let i = 0; let c = 0; let del = false;
    let t: ReturnType<typeof setTimeout>;
    const el = inputRef.current;
    function loop() {
      if (!el || el === document.activeElement) { t = setTimeout(loop, 400); return; }
      const cur = examples[i];
      if (!del) {
        el.placeholder = cur.substring(0, c + 1);
        c++;
        if (c === cur.length) { del = true; t = setTimeout(loop, 2400); return; }
      } else {
        el.placeholder = cur.substring(0, c - 1);
        c--;
        if (c === 0) { del = false; i = (i + 1) % examples.length; }
      }
      t = setTimeout(loop, del ? 22 : 48);
    }
    t = setTimeout(loop, 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        body:has(.ho-root) {
          display: block !important;
          height: auto !important;
          overflow: visible !important;
        }
        html:has(.ho-root) {
          height: auto !important;
          overflow: visible !important;
        }
        .ho-root {
          --bg: #080c12;
          --surface: #0e1420;
          --surface2: #141b28;
          --border: rgba(255,255,255,0.07);
          --border-bright: rgba(255,255,255,0.15);
          --text: #f0f4ff;
          --text-muted: #6b7a99;
          --text-dim: #3a4560;
          --green: #00e87a;
          --green-dim: rgba(0,232,122,0.10);
          --blue: #3d8bff;
          --purple: #a78bfa;
          --orange: #ff8c42;
          font-family: 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          width: 100%;
          overflow-x: hidden;
        }
        .ho-root * { box-sizing: border-box; }
        body:has(.ho-root) .app-footer { display: none !important; }

        /* NAV */
        .ho-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 40px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
          position: sticky; top: 0; z-index: 20;
        }
        .ho-nav-logo { display: flex; align-items: center; text-decoration: none; }
        .ho-nav-logo img { height: 34px; width: auto; }
        .ho-nav-links { display: flex; gap: 28px; list-style: none; margin: 0; padding: 0; }
        .ho-nav-links a { font-size: 13px; color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
        .ho-nav-links a:hover { color: var(--text); }
        .ho-nav-cta { display: flex; align-items: center; gap: 10px; }
        .ho-btn-ghost { font-size: 13px; color: var(--text-muted); background: none; border: none; cursor: pointer; padding: 8px 14px; text-decoration: none; display: inline-block; font-family: inherit; transition: color 0.2s; }
        .ho-btn-ghost:hover { color: var(--text); }
        .ho-btn-primary { font-size: 13px; font-weight: 600; color: #000; background: var(--green); border: none; cursor: pointer; padding: 9px 20px; border-radius: 6px; text-decoration: none; display: inline-block; font-family: inherit; transition: opacity 0.2s; }
        .ho-btn-primary:hover { opacity: 0.88; }

        /* HERO */
        .ho-hero {
          max-width: 860px;
          margin: 0 auto;
          padding: 80px 40px 64px;
          text-align: center;
          position: relative;
        }
        .ho-hero::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 600px; height: 400px;
          background: radial-gradient(ellipse, rgba(0,232,122,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .ho-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'DM Mono', monospace;
          font-size: 11px; color: var(--green);
          letter-spacing: 0.12em; text-transform: uppercase;
          margin-bottom: 24px;
        }
        .ho-eyebrow::before { content: ''; width: 6px; height: 6px; background: var(--green); border-radius: 50%; animation: ho-pulse 2s infinite; }
        .ho-h1 {
          font-family: 'Syne', sans-serif;
          font-size: 58px; font-weight: 800;
          line-height: 1.08; margin: 0 0 20px;
          letter-spacing: -0.02em;
        }
        .ho-h1 span { color: var(--green); }
        .ho-sub {
          font-size: 18px; color: var(--text-muted);
          line-height: 1.7; margin: 0 auto 40px;
          max-width: 580px;
        }

        /* ADDRESS BAR */
        .ho-addr-wrap { max-width: 620px; margin: 0 auto 16px; }
        .ho-addr-bar {
          display: flex; align-items: center;
          background: var(--surface);
          border: 1px solid var(--border-bright);
          border-radius: 12px;
          padding: 6px 6px 6px 18px;
          gap: 10px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .ho-addr-bar:focus-within {
          border-color: var(--green);
          box-shadow: 0 0 0 3px rgba(0,232,122,0.12);
        }
        .ho-addr-icon { color: var(--text-dim); flex-shrink: 0; }
        .ho-addr-input {
          flex: 1; background: none; border: none; outline: none;
          font-size: 15px; color: var(--text); font-family: inherit;
          min-width: 0;
        }
        .ho-addr-input::placeholder { color: var(--text-dim); }
        .ho-addr-btn {
          flex-shrink: 0;
          background: var(--green); color: #000;
          font-size: 13px; font-weight: 700;
          border: none; cursor: pointer;
          padding: 10px 22px; border-radius: 8px;
          font-family: inherit;
          transition: opacity 0.2s, transform 0.15s;
          white-space: nowrap;
        }
        .ho-addr-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .ho-addr-hint {
          font-size: 12px; color: var(--text-dim);
          text-align: center;
        }
        .ho-addr-hint a { color: var(--green); text-decoration: none; }
        .ho-addr-hint a:hover { text-decoration: underline; }

        /* STAT STRIP */
        .ho-stats {
          display: flex; justify-content: center; gap: 48px;
          padding: 48px 40px;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          margin-bottom: 80px;
        }
        .ho-stat { text-align: center; }
        .ho-stat-num { font-family: 'Syne', sans-serif; font-size: 34px; font-weight: 800; color: var(--green); margin-bottom: 4px; }
        .ho-stat-label { font-size: 13px; color: var(--text-muted); }

        /* VALUE PROPS */
        .ho-props {
          max-width: 1060px;
          margin: 0 auto;
          padding: 0 40px 80px;
        }
        .ho-props-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          color: var(--text-dim); letter-spacing: 0.12em;
          text-transform: uppercase; text-align: center;
          margin-bottom: 40px;
        }
        .ho-props-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .ho-prop-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 32px 28px;
        }
        .ho-prop-icon {
          width: 44px; height: 44px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
          margin-bottom: 20px;
        }
        .ho-prop-card h3 {
          font-family: 'Syne', sans-serif;
          font-size: 18px; font-weight: 700;
          margin: 0 0 10px;
        }
        .ho-prop-card p {
          font-size: 14px; color: var(--text-muted);
          line-height: 1.7; margin: 0;
        }

        /* HOW IT WORKS */
        .ho-how {
          max-width: 760px;
          margin: 0 auto;
          padding: 0 40px 80px;
          text-align: center;
        }
        .ho-how h2 {
          font-family: 'Syne', sans-serif;
          font-size: 34px; font-weight: 800;
          margin: 0 0 48px;
        }
        .ho-steps { display: flex; flex-direction: column; gap: 24px; text-align: left; }
        .ho-step {
          display: flex; gap: 20px; align-items: flex-start;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
        }
        .ho-step-num {
          flex-shrink: 0;
          width: 36px; height: 36px;
          border-radius: 50%;
          background: var(--green-dim);
          border: 1px solid rgba(0,232,122,0.3);
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Mono', monospace;
          font-size: 13px; font-weight: 700;
          color: var(--green);
        }
        .ho-step-body h4 {
          font-size: 15px; font-weight: 700;
          margin: 0 0 6px; color: var(--text);
        }
        .ho-step-body p {
          font-size: 13px; color: var(--text-muted);
          line-height: 1.6; margin: 0;
        }

        /* BOTTOM CTA */
        .ho-cta {
          background: var(--surface);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 72px 40px;
          text-align: center;
          margin-bottom: 0;
        }
        .ho-cta h2 {
          font-family: 'Syne', sans-serif;
          font-size: 36px; font-weight: 800;
          margin: 0 0 14px;
        }
        .ho-cta p {
          font-size: 16px; color: var(--text-muted);
          margin: 0 auto 32px; max-width: 480px; line-height: 1.7;
        }
        .ho-cta-btns { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; }
        .ho-cta-addr {
          background: var(--green); color: #000;
          font-size: 15px; font-weight: 700;
          border: none; cursor: pointer;
          padding: 14px 32px; border-radius: 8px;
          text-decoration: none; display: inline-block;
          font-family: inherit;
          transition: opacity 0.2s;
        }
        .ho-cta-addr:hover { opacity: 0.88; }
        .ho-cta-chat {
          background: none;
          border: 1px solid var(--border-bright);
          color: var(--text-muted);
          font-size: 15px; font-weight: 500;
          padding: 14px 32px; border-radius: 8px;
          text-decoration: none; display: inline-block;
          font-family: inherit;
          transition: color 0.2s, border-color 0.2s;
        }
        .ho-cta-chat:hover { color: var(--text); border-color: rgba(255,255,255,0.25); }

        /* FOOTER */
        .ho-footer {
          max-width: 1060px; margin: 0 auto;
          padding: 32px 40px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .ho-footer-left { font-size: 12px; color: var(--text-dim); }
        .ho-footer-links { display: flex; gap: 20px; }
        .ho-footer-links a { font-size: 12px; color: var(--text-dim); text-decoration: none; transition: color 0.2s; }
        .ho-footer-links a:hover { color: var(--text-muted); }

        @keyframes ho-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        @media (max-width: 900px) {
          .ho-nav { padding: 14px 20px; }
          .ho-nav-links { display: none; }
          .ho-hero { padding: 48px 20px 40px; }
          .ho-h1 { font-size: 38px; }
          .ho-sub { font-size: 16px; }
          .ho-stats { gap: 28px; flex-wrap: wrap; padding: 36px 20px; }
          .ho-props { padding: 0 20px 60px; }
          .ho-props-grid { grid-template-columns: 1fr; }
          .ho-how { padding: 0 20px 60px; }
          .ho-cta { padding: 48px 20px; }
          .ho-footer { flex-direction: column; gap: 16px; padding: 28px 20px; }
        }
      `}</style>

      <div className="ho-root">
        {/* NAV */}
        <nav className="ho-nav">
          <Link href="/" className="ho-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <ul className="ho-nav-links">
            <li><Link href="/chat">Mortgage Calculator</Link></li>
            <li><Link href="/knowledge-hub">Knowledge Hub</Link></li>
            <li><Link href="/market-news">Market News</Link></li>
          </ul>
          <div className="ho-nav-cta">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="ho-btn-ghost">Sign in</button>
              </SignInButton>
              <Link href="/my-home" className="ho-btn-primary">My Home Value</Link>
            </SignedOut>
            <SignedIn>
              <Link href="/my-home" className="ho-btn-primary">My Home</Link>
              <UserButton afterSignOutUrl="/homeowner" />
            </SignedIn>
          </div>
        </nav>

        {/* HERO */}
        <section className="ho-hero">
          <div className="ho-eyebrow">For Homeowners</div>
          <h1 className="ho-h1">
            Your home.<br />
            <span>Real numbers.</span><br />
            Right now.
          </h1>
          <p className="ho-sub">
            What's your home worth today? How much equity do you have? Should you refinance?
            Get live answers — no agent required, no forms, no callbacks.
          </p>

          <div className="ho-addr-wrap">
            <form onSubmit={handleAnalyze}>
              <div className="ho-addr-bar">
                <span className="ho-addr-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </span>
                <input
                  ref={inputRef}
                  className="ho-addr-input"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Enter your home address..."
                  autoComplete="off"
                />
                <button type="submit" className="ho-addr-btn">
                  Analyze →
                </button>
              </div>
            </form>
          </div>
          <p className="ho-addr-hint">
            Instant analysis, no sign-up required.&nbsp;
            <Link href="/my-home">Create a free account</Link> to get monthly updates.
          </p>
        </section>

        {/* STATS */}
        <div className="ho-stats">
          <div className="ho-stat">
            <div className="ho-stat-num">~2s</div>
            <div className="ho-stat-label">To see your home value</div>
          </div>
          <div className="ho-stat">
            <div className="ho-stat-num">$0</div>
            <div className="ho-stat-label">To get started</div>
          </div>
          <div className="ho-stat">
            <div className="ho-stat-num">Monthly</div>
            <div className="ho-stat-label">Free home value digest</div>
          </div>
          <div className="ho-stat">
            <div className="ho-stat-num">Live</div>
            <div className="ho-stat-label">Rates from FRED data</div>
          </div>
        </div>

        {/* VALUE PROPS */}
        <div className="ho-props">
          <div className="ho-props-label">What you get</div>
          <div className="ho-props-grid">
            <div className="ho-prop-card">
              <div className="ho-prop-icon" style={{ background: 'rgba(0,232,122,0.1)' }}>🏠</div>
              <h3>Live Home Value</h3>
              <p>See your home's current estimated value from Rentcast's AVM — updated with every analysis. Know where you stand before you make any move.</p>
            </div>
            <div className="ho-prop-card">
              <div className="ho-prop-icon" style={{ background: 'rgba(61,139,255,0.1)' }}>📈</div>
              <h3>Equity Snapshot</h3>
              <p>Based on your last sale price and today's value, we estimate your current equity — and show how it's changed month over month.</p>
            </div>
            <div className="ho-prop-card">
              <div className="ho-prop-icon" style={{ background: 'rgba(167,139,250,0.1)' }}>⚡</div>
              <h3>Refi Readiness</h3>
              <p>Live 30-year rates vs your estimated purchase rate. Break-even analysis, monthly savings, and whether it actually makes sense for you right now.</p>
            </div>
            <div className="ho-prop-card">
              <div className="ho-prop-icon" style={{ background: 'rgba(255,140,66,0.1)' }}>📬</div>
              <h3>Monthly Digest</h3>
              <p>Save your home address and get a free monthly email: value update, equity change, rate movement, and your refi window — every first of the month.</p>
            </div>
            <div className="ho-prop-card">
              <div className="ho-prop-icon" style={{ background: 'rgba(0,232,122,0.1)' }}>💬</div>
              <h3>Ask Anything</h3>
              <p>"What if I cash out $80k?" "What would I qualify for on my next home?" Ask any scenario and get real math — not a sales pitch.</p>
            </div>
            <div className="ho-prop-card">
              <div className="ho-prop-icon" style={{ background: 'rgba(61,139,255,0.1)' }}>🔒</div>
              <h3>No Agent Required</h3>
              <p>This is your data. No one will call you. No forms to fill out. No lead passed to a sales team. Your numbers, your decision.</p>
            </div>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div className="ho-how">
          <h2>How it works</h2>
          <div className="ho-steps">
            <div className="ho-step">
              <div className="ho-step-num">1</div>
              <div className="ho-step-body">
                <h4>Enter your address</h4>
                <p>Type your home address in the bar above. No sign-up needed to get your first analysis.</p>
              </div>
            </div>
            <div className="ho-step">
              <div className="ho-step-num">2</div>
              <div className="ho-step-body">
                <h4>Get your instant homeowner report</h4>
                <p>Estimated value, equity, live rates, and refi readiness — calculated in real time using Rentcast AVM and FRED mortgage rate data.</p>
              </div>
            </div>
            <div className="ho-step">
              <div className="ho-step-num">3</div>
              <div className="ho-step-body">
                <h4>Save your home for monthly updates</h4>
                <p>Create a free account to save your address. Every first of the month, we'll send you a fresh update: value, equity, rate movement, and whether your refi window has opened.</p>
              </div>
            </div>
            <div className="ho-step">
              <div className="ho-step-num">4</div>
              <div className="ho-step-body">
                <h4>Ask any follow-up question</h4>
                <p>"What if I wait 6 months?" "How much equity do I need to move up?" "Should I do a cash-out refi or HELOC?" The AI answers in seconds with your actual numbers.</p>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM CTA */}
        <div className="ho-cta">
          <h2>Start with your address</h2>
          <p>Free, instant, no sign-up required to try it. Create an account to get monthly updates.</p>
          <div className="ho-cta-btns">
            <Link href="/my-home" className="ho-cta-addr">My Home Value — Free</Link>
            <Link href="/chat" className="ho-cta-chat">Ask a mortgage question</Link>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="ho-footer">
          <div className="ho-footer-left">HomeRates.ai · Educational tool only · Not a lender · Not financial advice</div>
          <div className="ho-footer-links">
            <Link href="/knowledge-hub">Knowledge Hub</Link>
            <Link href="/market-news">Market News</Link>
            <Link href="/disclosures">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
