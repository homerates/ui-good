// app/for-pros/page.tsx
// Public landing page for loan officers and agents
// Explains the scenario board value prop and drives sign-up / sign-in

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For Loan Officers & Agents — Earn Introductions, Not Leads | HomeRates.ai",
  description:
    "Stop buying leads from Zillow and Redfin. HomeRates.ai borrowers post anonymous scenarios and choose who earns their contact. Respond to real, intent-verified buyers — free.",
};

export default function ForProsPage() {
  return (
    <>
      <div className="fp-root">

        {/* ── NAV ── */}
        <nav className="fp-nav">
          <Link href="/" className="fp-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <div className="fp-nav-links">
            <Link href="/connect" className="fp-nav-link">For Borrowers</Link>
            <Link href="/sign-in" className="fp-nav-signin">Sign in</Link>
            <Link href="/sign-up" className="fp-nav-cta">Join free →</Link>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section className="fp-hero">
          <div className="fp-eyebrow">For Loan Officers & Agents</div>
          <h1 className="fp-h1">
            Stop buying leads.<br />
            <span className="fp-h1-green">Start earning introductions.</span>
          </h1>
          <p className="fp-lead">
            HomeRates.ai borrowers have already run their numbers with our AI before they post a scenario.
            They know the market rate. They know the right questions to ask.
            When they choose you — it's because your response earned it.
          </p>
          <div className="fp-hero-ctas">
            <Link href="/sign-up" className="fp-btn-primary">Join free — no card required</Link>
            <Link href="/lo/scenarios" className="fp-btn-ghost">See live scenarios →</Link>
          </div>
          <div className="fp-trust-bar">
            <span>✓ No monthly lead fee</span>
            <span>✓ Borrower-initiated contact only</span>
            <span>✓ Pre-educated, intent-verified buyers</span>
            <span>✓ No Zillow auction</span>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="fp-section">
          <div className="fp-section-inner">
            <h2 className="fp-section-title">How it works for you</h2>
            <div className="fp-steps">
              {[
                {
                  n: "1",
                  title: "Browse anonymous scenarios",
                  body: "Borrowers post their loan details — price range, credit tier, timeline, state — without any personal info. You see real buying intent, not tire-kickers.",
                },
                {
                  n: "2",
                  title: "Respond with your rate and approach",
                  body: "Submit your rate estimate and explain your value. The borrower compares your answer directly against what HomeRates.ai already calculated for them — so accuracy matters.",
                },
                {
                  n: "3",
                  title: "Earn the introduction",
                  body: "If the borrower chooses you, both of you get each other's contact info by email. No middleman, no CRM handoff, no 72-hour delay. Just a warm, mutual intro.",
                },
              ].map(s => (
                <div key={s.n} className="fp-step">
                  <div className="fp-step-num">{s.n}</div>
                  <div>
                    <div className="fp-step-title">{s.title}</div>
                    <p className="fp-step-body">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── COMPARISON ── */}
        <section className="fp-section fp-section-alt">
          <div className="fp-section-inner">
            <h2 className="fp-section-title">The old model is broken</h2>
            <div className="fp-compare">
              <div className="fp-compare-col fp-compare-old">
                <div className="fp-compare-header">Zillow / Redfin leads</div>
                {[
                  "Pay $300–$1,000+ per lead",
                  "Same lead sold to 3–5 competitors",
                  "Borrower didn't choose you",
                  "Cold contact — they're already annoyed",
                  "No context on their situation",
                  "Race to the bottom on rate",
                ].map(t => (
                  <div key={t} className="fp-compare-row">
                    <span className="fp-compare-x">✕</span> {t}
                  </div>
                ))}
              </div>
              <div className="fp-compare-col fp-compare-new">
                <div className="fp-compare-header">HomeRates.ai scenarios</div>
                {[
                  "Free to respond — always",
                  "One intro per scenario — you or nobody",
                  "Borrower chose you specifically",
                  "Warm intro — they already trust your response",
                  "Full scenario context before you even talk",
                  "Win on approach, not just price",
                ].map(t => (
                  <div key={t} className="fp-compare-row">
                    <span className="fp-compare-check">✓</span> {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── WHO IT'S FOR ── */}
        <section className="fp-section">
          <div className="fp-section-inner">
            <h2 className="fp-section-title">Built for both sides of the transaction</h2>
            <div className="fp-cards">
              <div className="fp-pro-card">
                <div className="fp-pro-icon">🏦</div>
                <h3 className="fp-pro-title">Loan Officers</h3>
                <p className="fp-pro-body">
                  Browse borrower scenarios filtered by state and loan type.
                  Respond with your rate estimate and why you're the right fit.
                  Borrowers compare your quote against our AI benchmark — so
                  accurate, honest responses win.
                </p>
                <Link href="/lo/scenarios" className="fp-pro-link">View LO Scenario Board →</Link>
              </div>
              <div className="fp-pro-card">
                <div className="fp-pro-icon">🏡</div>
                <h3 className="fp-pro-title">Real Estate Agents</h3>
                <p className="fp-pro-body">
                  Borrowers asking about purchase scenarios often need an agent too.
                  Respond to buyer scenarios in your market with your approach and
                  buyer rep fee — upfront transparency is exactly what earns the intro.
                </p>
                <Link href="/agent/scenarios" className="fp-pro-link">View Agent Scenario Board →</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── WHAT BORROWERS SEE ── */}
        <section className="fp-section fp-section-alt">
          <div className="fp-section-inner fp-section-narrow">
            <h2 className="fp-section-title">What the borrower already knows</h2>
            <p className="fp-section-sub">
              Before posting a scenario, every HomeRates.ai borrower has run their numbers
              through our AI. They know:
            </p>
            <div className="fp-knows-list">
              {[
                "Today's FRED benchmark rate for their loan type",
                "Their estimated PITI at current market rates",
                "Whether their DTI works at their price range",
                "What questions to ask any lender (from the AI checklist)",
                "What a fair rate vs a high rate looks like for their credit tier",
              ].map(item => (
                <div key={item} className="fp-knows-item">
                  <span className="fp-knows-dot">◆</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <p className="fp-knows-footer">
              This means they can evaluate your response immediately.
              The LOs and agents who win are the ones who are accurate, clear, and direct —
              not the ones who sell hardest.
            </p>
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="fp-cta-section">
          <div className="fp-cta-inner">
            <h2 className="fp-cta-title">Ready to respond to your first scenario?</h2>
            <p className="fp-cta-sub">
              Create a free account — takes 60 seconds. No credit card, no monthly fee to browse and respond.
            </p>
            <div className="fp-cta-btns">
              <Link href="/sign-up" className="fp-btn-primary">Create free account →</Link>
              <Link href="/lo/scenarios" className="fp-btn-ghost">Browse scenarios first</Link>
            </div>
            <p className="fp-cta-fine">
              HomeRates.ai is free for professionals to browse and respond.
              The borrower pays nothing too. The only currency is a good answer.
            </p>
          </div>
        </section>

      </div>

      <style>{`
        body:has(.fp-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.fp-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.fp-root) .app-footer { display: none; }

        .fp-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; background: #080c12; }

        /* NAV */
        .fp-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 32px;
          background: rgba(8,12,18,0.95); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .fp-nav-logo img { height: 28px; }
        .fp-nav-links { display: flex; align-items: center; gap: 20px; }
        .fp-nav-link { color: #8fa3b8; font-size: 0.875rem; text-decoration: none; transition: color 0.15s; }
        .fp-nav-link:hover { color: #f0f4ff; }
        .fp-nav-signin { color: #8fa3b8; font-size: 0.875rem; text-decoration: none; transition: color 0.15s; }
        .fp-nav-signin:hover { color: #f0f4ff; }
        .fp-nav-cta {
          padding: 8px 20px; background: #00e87a; color: #080c12;
          border-radius: 999px; font-size: 0.875rem; font-weight: 700;
          text-decoration: none; transition: opacity 0.15s;
        }
        .fp-nav-cta:hover { opacity: 0.88; }

        /* HERO */
        .fp-hero {
          max-width: 800px; margin: 0 auto;
          padding: 6rem 2rem 4rem;
          text-align: center;
        }
        .fp-eyebrow {
          display: inline-block;
          font-size: 0.78rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: #00e87a;
          background: rgba(0,232,122,0.08);
          border: 1px solid rgba(0,232,122,0.2);
          border-radius: 99px; padding: 4px 16px;
          margin-bottom: 1.5rem;
        }
        .fp-h1 {
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(2.2rem, 5vw, 3.5rem);
          font-weight: 800; line-height: 1.1;
          letter-spacing: -0.02em; margin: 0 0 1.25rem;
          color: #f0f4ff;
        }
        .fp-h1-green { color: #00e87a; }
        .fp-lead {
          font-size: clamp(1rem, 2vw, 1.15rem);
          color: #8fa3b8; line-height: 1.7;
          max-width: 640px; margin: 0 auto 2rem;
        }
        .fp-hero-ctas { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 2rem; }
        .fp-btn-primary {
          padding: 14px 32px; background: #00e87a; color: #080c12;
          border-radius: 999px; font-weight: 700; font-size: 1rem;
          text-decoration: none; transition: opacity 0.15s;
        }
        .fp-btn-primary:hover { opacity: 0.88; }
        .fp-btn-ghost {
          padding: 14px 28px; color: #f0f4ff;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 999px; font-size: 0.95rem;
          text-decoration: none; transition: border-color 0.15s;
        }
        .fp-btn-ghost:hover { border-color: rgba(255,255,255,0.35); }
        .fp-trust-bar {
          display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;
          font-size: 0.8rem; color: #3a4560;
        }

        /* SECTIONS */
        .fp-section { padding: 5rem 2rem; }
        .fp-section-alt { background: #0a0f1a; }
        .fp-section-inner { max-width: 860px; margin: 0 auto; }
        .fp-section-narrow { max-width: 640px; }
        .fp-section-title {
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(1.5rem, 3vw, 2rem);
          font-weight: 700; margin: 0 0 0.5rem;
          letter-spacing: -0.01em;
        }
        .fp-section-sub { color: #8fa3b8; font-size: 1rem; margin: 0 0 2rem; line-height: 1.65; }

        /* HOW IT WORKS */
        .fp-steps { display: flex; flex-direction: column; gap: 2rem; margin-top: 2.5rem; }
        .fp-step { display: flex; gap: 20px; align-items: flex-start; }
        .fp-step-num {
          width: 40px; height: 40px; flex-shrink: 0;
          border-radius: 50%;
          background: rgba(0,232,122,0.1); color: #00e87a;
          border: 1px solid rgba(0,232,122,0.25);
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 1rem;
        }
        .fp-step-title { font-weight: 700; font-size: 1.05rem; margin-bottom: 6px; color: #f0f4ff; }
        .fp-step-body { font-size: 0.9rem; color: #8fa3b8; line-height: 1.65; margin: 0; }

        /* COMPARISON */
        .fp-compare {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 16px; margin-top: 2.5rem;
        }
        .fp-compare-col {
          border-radius: 16px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .fp-compare-old { border-color: rgba(255,95,95,0.15); }
        .fp-compare-new { border-color: rgba(0,232,122,0.2); }
        .fp-compare-header {
          padding: 14px 20px; font-weight: 700; font-size: 0.85rem;
          letter-spacing: 0.04em; text-transform: uppercase;
        }
        .fp-compare-old .fp-compare-header { background: rgba(255,95,95,0.08); color: #ff5f5f; }
        .fp-compare-new .fp-compare-header { background: rgba(0,232,122,0.08); color: #00e87a; }
        .fp-compare-row {
          padding: 10px 20px; font-size: 0.875rem; color: #8fa3b8;
          border-top: 1px solid rgba(255,255,255,0.05);
          display: flex; align-items: flex-start; gap: 10px; line-height: 1.45;
        }
        .fp-compare-x { color: #ff5f5f; flex-shrink: 0; font-weight: 700; }
        .fp-compare-check { color: #00e87a; flex-shrink: 0; font-weight: 700; }

        /* PRO CARDS */
        .fp-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 2.5rem; }
        .fp-pro-card {
          background: #0e1420; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 2rem;
          display: flex; flex-direction: column; gap: 12px;
        }
        .fp-pro-icon { font-size: 2rem; }
        .fp-pro-title { font-family: 'DM Sans', sans-serif; font-size: 1.15rem; font-weight: 700; margin: 0; }
        .fp-pro-body { font-size: 0.9rem; color: #8fa3b8; line-height: 1.65; margin: 0; flex: 1; }
        .fp-pro-link {
          display: inline-block; font-size: 0.875rem; font-weight: 600;
          color: #00e87a; text-decoration: none; margin-top: 4px;
        }
        .fp-pro-link:hover { text-decoration: underline; }

        /* WHAT BORROWERS KNOW */
        .fp-knows-list { display: flex; flex-direction: column; gap: 10px; margin: 1.5rem 0; }
        .fp-knows-item {
          display: flex; align-items: flex-start; gap: 12px;
          font-size: 0.9rem; color: #f0f4ff; line-height: 1.5;
          background: #0e1420; border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px; padding: 12px 16px;
        }
        .fp-knows-dot { color: #3d8bff; flex-shrink: 0; margin-top: 2px; font-size: 0.65rem; }
        .fp-knows-footer { font-size: 0.9rem; color: #8fa3b8; line-height: 1.65; margin-top: 1rem; }

        /* FINAL CTA */
        .fp-cta-section { padding: 6rem 2rem; }
        .fp-cta-inner { max-width: 600px; margin: 0 auto; text-align: center; }
        .fp-cta-title {
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(1.6rem, 3vw, 2.2rem);
          font-weight: 800; margin: 0 0 1rem;
          letter-spacing: -0.02em;
        }
        .fp-cta-sub { font-size: 1rem; color: #8fa3b8; line-height: 1.65; margin: 0 0 2rem; }
        .fp-cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .fp-cta-fine { font-size: 0.78rem; color: #3a4560; line-height: 1.5; }

        @media (max-width: 640px) {
          .fp-nav { padding: 14px 20px; }
          .fp-nav-link { display: none; }
          .fp-compare { grid-template-columns: 1fr; }
          .fp-cards { grid-template-columns: 1fr; }
          .fp-hero { padding: 4rem 1.5rem 3rem; }
        }
      `}</style>
    </>
  );
}
