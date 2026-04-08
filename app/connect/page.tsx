// app/connect/page.tsx
// "Lender Match" — borrower-facing landing page
// Borrowers post anonymous scenarios; LOs compete; borrower chooses

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import AppNav from "../components/AppNav";
import { getSupabase } from "../../lib/supabaseServer";
import { canPostScenario } from "../../lib/subscription";

export const metadata: Metadata = {
  title: "Get Matched With the Right Lender — On Your Terms | HomeRates.ai",
  description:
    "Post your mortgage scenario anonymously. Verified loan officers respond with their approach and rate estimate. You choose who earns an introduction. No credit check. No spam.",
};

export default async function ConnectPage() {
  const { userId } = await auth();
  let hasActiveScenario = false;
  let quota: { used: number; limit: number | null; allowed: boolean } | null = null;

  if (userId) {
    const sb = getSupabase();
    const [activeResult, quotaResult] = await Promise.all([
      sb
        ? sb.from("scenario_briefs").select("id").eq("borrower_id", userId).in("status", ["active", "matched"]).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      canPostScenario(userId),
    ]);
    hasActiveScenario = !!(activeResult as any).data;
    quota = quotaResult;
  }
  return (
    <>
      <div className="cn-root">

        {/* ── NAV ── */}
        <nav className="cn-nav">
          <Link href="/" className="cn-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <div className="cn-nav-links">
            <Link href="/for-pros" className="cn-nav-link">For Professionals</Link>
            {userId ? (
              <Link href="/dashboard" className="cn-nav-signin">Dashboard</Link>
            ) : (
              <Link href="/sign-in" className="cn-nav-signin">Sign in</Link>
            )}
            {/* Quota badge — visible to signed-in users with a finite limit */}
            {quota && quota.limit !== null && (
              <span style={{
                fontSize: '0.75rem', fontWeight: 600,
                padding: '4px 12px', borderRadius: 99,
                background: quota.allowed
                  ? (quota.used >= quota.limit - 1 ? 'rgba(255,140,66,0.1)' : 'rgba(0,232,122,0.08)')
                  : 'rgba(255,95,95,0.08)',
                color: quota.allowed
                  ? (quota.used >= quota.limit - 1 ? '#ff8c42' : 'rgba(0,232,122,0.75)')
                  : '#ff5f5f',
                border: `1px solid ${quota.allowed
                  ? (quota.used >= quota.limit - 1 ? 'rgba(255,140,66,0.25)' : 'rgba(0,232,122,0.2)')
                  : 'rgba(255,95,95,0.25)'}`,
              }}>
                {quota.used}/{quota.limit} posts used
              </span>
            )}
            {hasActiveScenario ? (
              <Link href="/connect/my-scenario" className="cn-nav-cta">View My Scenario →</Link>
            ) : (
              <Link href="/connect/post" className="cn-nav-cta">Post My Scenario →</Link>
            )}
          </div>
          <AppNav drawerOnly />
        </nav>

        {/* ── HERO ── */}
        <section className="cn-hero">
          <div className="cn-eyebrow">Introducing Lender Match</div>
          <h1 className="cn-h1">
            For the first time,<br />
            <span className="cn-h1-green">you interview the lender.</span>
          </h1>
          <p className="cn-lead">
            Post your mortgage scenario anonymously. Verified loan officers respond with their
            rate estimate and approach. You compare their answers against what our AI already
            told you — and invite the one who earned your trust.
          </p>
          <div className="cn-hero-ctas">
            <Link href="/connect/post" className="cn-btn-primary">Post My Scenario — Free</Link>
            <Link href="/chat" className="cn-btn-ghost">Get my analysis first →</Link>
          </div>
          <div className="cn-trust-bar">
            <span>🔒 No credit check. Ever.</span>
            <span>👤 Anonymous until you choose</span>
            <span>📵 One intro, not 15 callbacks</span>
            <span>🤖 AI benchmarks every response</span>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="cn-section">
          <div className="cn-section-label">How it works</div>
          <h2 className="cn-h2">Three steps. You stay in control the whole time.</h2>
          <div className="cn-steps">
            <div className="cn-step">
              <div className="cn-step-num">01</div>
              <div className="cn-step-icon">📋</div>
              <h3>Post your scenario</h3>
              <p>
                Share your loan type, price range, down payment, income range, credit tier, and timeline.
                No name. No address. No SSN. Just the scenario.
                Takes 60 seconds.
              </p>
            </div>
            <div className="cn-step-divider">→</div>
            <div className="cn-step">
              <div className="cn-step-num">02</div>
              <div className="cn-step-icon">📨</div>
              <h3>Receive responses</h3>
              <p>
                Verified loan officers on HomeRates.ai review your scenario and respond with
                their rate estimate, their approach, and their NMLS number.
                You see who's being honest — because HomeRates.ai already told you what the right answer looks like.
              </p>
            </div>
            <div className="cn-step-divider">→</div>
            <div className="cn-step">
              <div className="cn-step-num">03</div>
              <div className="cn-step-icon">✅</div>
              <h3>You choose who to invite</h3>
              <p>
                Pick the LO whose response matched your analysis. One click sends
                both of you each other's contact info. They already know your situation.
                You already know they're straight with you. No surprises.
              </p>
            </div>
          </div>
        </section>

        {/* ── THE DIFFERENCE ── */}
        <section className="cn-section cn-section-dark">
          <div className="cn-section-label">Why it's different</div>
          <h2 className="cn-h2">The mortgage industry sells borrowers as leads.<br />We don't.</h2>
          <div className="cn-compare">
            <div className="cn-compare-col cn-compare-old">
              <div className="cn-compare-header">
                <span className="cn-badge-red">Traditional lead gen</span>
              </div>
              <ul className="cn-compare-list">
                <li><span className="cn-x">✗</span> Fill out a form with your personal info</li>
                <li><span className="cn-x">✗</span> Get sold to 10–15 lenders simultaneously</li>
                <li><span className="cn-x">✗</span> Receive calls for weeks whether you're ready or not</li>
                <li><span className="cn-x">✗</span> No way to evaluate if a rate quote is honest</li>
                <li><span className="cn-x">✗</span> Lender knows nothing about you when they call</li>
              </ul>
            </div>
            <div className="cn-compare-col cn-compare-new">
              <div className="cn-compare-header">
                <span className="cn-badge-green">HomeRates.ai Lender Match</span>
              </div>
              <ul className="cn-compare-list">
                <li><span className="cn-check">✓</span> Post anonymously — no name, no SSN, no credit pull</li>
                <li><span className="cn-check">✓</span> You invite one LO, when you're ready</li>
                <li><span className="cn-check">✓</span> LOs can't contact you until you choose them</li>
                <li><span className="cn-check">✓</span> AI benchmarks every response against market rates</li>
                <li><span className="cn-check">✓</span> Your LO already knows your full scenario before the first call</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── SAMPLE SCENARIO ── */}
        <section className="cn-section">
          <div className="cn-section-label">What it looks like</div>
          <h2 className="cn-h2">A real scenario. What an LO sees.</h2>
          <p className="cn-section-desc">
            This is exactly what verified loan officers see on the board.
            No borrower identity — just the scenario they need to respond to intelligently.
          </p>
          <div className="cn-sample-card">
            <div className="cn-sample-header">
              <span className="cn-loan-badge">Conventional</span>
              <span className="cn-sample-state">California</span>
              <span className="cn-sample-time">Posted 2 hours ago · 3 responses</span>
            </div>
            <div className="cn-sample-grid">
              <div className="cn-sample-field">
                <div className="cn-field-label">Price range</div>
                <div className="cn-field-value">$600k – $750k</div>
              </div>
              <div className="cn-sample-field">
                <div className="cn-field-label">Down payment</div>
                <div className="cn-field-value">20%</div>
              </div>
              <div className="cn-sample-field">
                <div className="cn-field-label">Income range</div>
                <div className="cn-field-value">$150k – $200k</div>
              </div>
              <div className="cn-sample-field">
                <div className="cn-field-label">Credit tier</div>
                <div className="cn-field-value">Excellent (740+)</div>
              </div>
              <div className="cn-sample-field">
                <div className="cn-field-label">Timeline</div>
                <div className="cn-field-value">1–2 months</div>
              </div>
              <div className="cn-sample-field">
                <div className="cn-field-label">Purpose</div>
                <div className="cn-field-value">Purchase</div>
              </div>
            </div>
            <div className="cn-sample-note">
              "First-time buyer, open to locking early if rates dip further. No HOA."
            </div>
          </div>
          <p className="cn-sample-caption">
            That's it. No name. No address. No credit score. Just enough for a serious LO to give you a real answer.
          </p>
        </section>

        {/* ── SAMPLE RESPONSE ── */}
        <section className="cn-section cn-section-dark">
          <div className="cn-section-label">What an LO response looks like</div>
          <h2 className="cn-h2">You see who's being straight with you before you talk to anyone.</h2>
          <div className="cn-responses-demo">
            <div className="cn-response-card cn-response-good">
              <div className="cn-response-header">
                <span className="cn-response-lo">Loan Officer A · NMLS #123456</span>
                <span className="cn-response-rate cn-rate-match">6.50%–6.75% ✓ Matches AI estimate</span>
              </div>
              <p className="cn-response-text">
                "For a 20% down conventional at your credit tier in CA, you're looking at 6.5–6.75%
                at current FRED rates. I'd lock within 45 days of closing. No points needed at this
                LTV. I can pre-approve in 24 hours and close in 28 days."
              </p>
              <div className="cn-invite-demo">← Borrower chose this response</div>
            </div>
            <div className="cn-response-card cn-response-flag">
              <div className="cn-response-header">
                <span className="cn-response-lo">Loan Officer B · NMLS #789012</span>
                <span className="cn-response-rate cn-rate-flag">5.99% ⚠ Below market — ask why</span>
              </div>
              <p className="cn-response-text">
                "I can get you 5.99% on a 30-year fixed. Call me to discuss your options and
                we can get you pre-approved today."
              </p>
            </div>
          </div>
          <p className="cn-section-desc" style={{ textAlign: "center", marginTop: "1.5rem" }}>
            HomeRates.ai shows you what the market rate is for your scenario.
            You can tell immediately who's quoting points, who's being vague, and who's straight with you.
          </p>
        </section>

        {/* ── CTA ── */}
        <section className="cn-cta-section">
          <h2 className="cn-h2">Ready to flip the script?</h2>
          <p className="cn-lead" style={{ maxWidth: 520, margin: "0 auto 2rem" }}>
            Post your scenario anonymously. See who responds honestly.
            Choose who earns the introduction. 100% free for borrowers.
          </p>
          <Link href="/connect/post" className="cn-btn-primary cn-btn-large">
            Post My Scenario — Free →
          </Link>
          <p className="cn-cta-sub">No account required to browse · Sign up free to post</p>
        </section>

      </div>

      <style>{`
        body:has(.cn-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.cn-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.cn-root) .app-footer { display: none; }

        .cn-root {
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #f0f4ff;
          background: #080c12;
          min-height: 100vh;
        }

        /* Nav */
        .cn-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          background: rgba(8,12,18,0.95); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .cn-nav-logo { display: flex; align-items: center; text-decoration: none; }
        .cn-nav-logo img { height: 32px; width: auto; }
        .cn-nav-links { display: flex; align-items: center; gap: 14px; }
        .cn-nav-link { color: #8fa3b8; font-size: 0.875rem; text-decoration: none; transition: color 0.15s; }
        .cn-nav-link:hover { color: #f0f4ff; }
        .cn-nav-signin { color: #8fa3b8; text-decoration: none; font-size: 0.9rem; transition: color 0.15s; }
        .cn-nav-signin:hover { color: #f0f4ff; }
        .cn-nav-cta {
          padding: 8px 18px; background: #00e87a; color: #080c12;
          border-radius: 999px; font-size: 0.875rem;
          font-weight: 600; text-decoration: none; transition: opacity 0.15s;
        }
        .cn-nav-cta:hover { opacity: 0.88; }

        /* Hero */
        .cn-hero {
          max-width: 780px; margin: 0 auto;
          padding: 6rem 1.5rem 5rem;
          text-align: center;
        }
        .cn-eyebrow {
          display: inline-block;
          font-size: 0.78rem; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: #00e87a;
          background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.25);
          border-radius: 99px; padding: 4px 14px; margin-bottom: 1.5rem;
        }
        .cn-h1 {
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(2.2rem, 5vw, 3.5rem);
          font-weight: 800; line-height: 1.1;
          letter-spacing: -0.03em;
          margin: 0 0 1.5rem; color: #f0f4ff;
        }
        .cn-h1-green { color: #00e87a; }
        .cn-lead {
          font-size: 1.15rem; color: #8fa3b8;
          line-height: 1.7; max-width: 600px;
          margin: 0 auto 2rem;
        }
        .cn-hero-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 2.5rem; }
        .cn-btn-primary {
          display: inline-block; padding: 14px 32px;
          background: #00e87a; color: #080c12;
          border-radius: 999px; font-size: 1rem;
          font-weight: 700; text-decoration: none;
          transition: opacity 0.15s;
        }
        .cn-btn-primary:hover { opacity: 0.88; }
        .cn-btn-large { padding: 16px 40px; font-size: 1.1rem; }
        .cn-btn-ghost {
          display: inline-block; padding: 14px 24px;
          color: #f0f4ff; font-weight: 500;
          text-decoration: none; font-size: 0.95rem;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px; transition: border-color 0.15s;
        }
        .cn-btn-ghost:hover { border-color: rgba(255,255,255,0.3); }
        .cn-trust-bar {
          display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
          font-size: 0.82rem; color: #8fa3b8;
        }
        .cn-trust-bar span {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 99px; padding: 5px 14px;
        }

        /* Sections */
        .cn-section {
          max-width: 1000px; margin: 0 auto;
          padding: 5rem 1.5rem;
        }
        .cn-section-dark {
          max-width: 100%;
          background: #0e1420;
          padding: 5rem 1.5rem;
        }
        .cn-section-dark > * { max-width: 1000px; margin-left: auto; margin-right: auto; }
        .cn-section-label {
          font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: #3d8bff;
          margin-bottom: 1rem;
        }
        .cn-h2 {
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(1.5rem, 3vw, 2.2rem);
          font-weight: 700; line-height: 1.2;
          letter-spacing: -0.02em;
          margin: 0 0 1rem; color: #f0f4ff;
        }
        .cn-section-desc {
          font-size: 1rem; color: #8fa3b8;
          line-height: 1.65; max-width: 620px;
          margin: 0 0 2.5rem;
        }

        /* Steps */
        .cn-steps {
          display: flex; align-items: flex-start; gap: 0;
          margin-top: 3rem;
        }
        .cn-step {
          flex: 1;
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 2rem;
        }
        .cn-step-num {
          font-family: 'DM Mono', monospace;
          font-size: 0.75rem; color: #00e87a;
          margin-bottom: 0.75rem;
        }
        .cn-step-icon { font-size: 2rem; margin-bottom: 1rem; }
        .cn-step h3 {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.1rem; font-weight: 700;
          margin: 0 0 0.75rem; color: #f0f4ff;
        }
        .cn-step p { font-size: 0.9rem; color: #8fa3b8; line-height: 1.65; margin: 0; }
        .cn-step-divider {
          padding: 0 12px; align-self: center;
          color: #3a4560; font-size: 1.5rem; font-weight: 300;
          flex-shrink: 0;
        }

        /* Comparison */
        .cn-compare {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 16px; margin-top: 2.5rem;
        }
        .cn-compare-col {
          border-radius: 16px; padding: 2rem;
          border: 1px solid rgba(255,255,255,0.07);
        }
        .cn-compare-old { background: rgba(255,95,95,0.04); border-color: rgba(255,95,95,0.15); }
        .cn-compare-new { background: rgba(0,232,122,0.04); border-color: rgba(0,232,122,0.2); }
        .cn-compare-header { margin-bottom: 1.25rem; }
        .cn-badge-red {
          font-size: 0.75rem; font-weight: 600;
          padding: 4px 12px; border-radius: 99px;
          background: rgba(255,95,95,0.15); color: #ff5f5f;
          border: 1px solid rgba(255,95,95,0.3);
        }
        .cn-badge-green {
          font-size: 0.75rem; font-weight: 600;
          padding: 4px 12px; border-radius: 99px;
          background: rgba(0,232,122,0.12); color: #00e87a;
          border: 1px solid rgba(0,232,122,0.3);
        }
        .cn-compare-list { list-style: none; margin: 0; padding: 0; }
        .cn-compare-list li {
          display: flex; gap: 10px; align-items: flex-start;
          font-size: 0.9rem; color: #8fa3b8;
          padding: 7px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .cn-compare-list li:last-child { border-bottom: none; }
        .cn-x { color: #ff5f5f; font-weight: 700; flex-shrink: 0; }
        .cn-check { color: #00e87a; font-weight: 700; flex-shrink: 0; }

        /* Sample scenario card */
        .cn-sample-card {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 16px; padding: 2rem;
          margin-bottom: 1rem;
          max-width: 680px;
        }
        .cn-sample-header {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 1.5rem; flex-wrap: wrap;
        }
        .cn-loan-badge {
          font-size: 0.75rem; font-weight: 700; padding: 4px 12px;
          border-radius: 99px; background: rgba(61,139,255,0.12);
          color: #3d8bff; border: 1px solid rgba(61,139,255,0.25);
        }
        .cn-sample-state { font-size: 0.85rem; color: #f0f4ff; font-weight: 500; }
        .cn-sample-time { font-size: 0.78rem; color: #8fa3b8; margin-left: auto; }
        .cn-sample-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 12px; margin-bottom: 1.25rem;
        }
        .cn-sample-field { }
        .cn-field-label { font-size: 0.72rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
        .cn-field-value { font-size: 0.95rem; font-weight: 600; color: #f0f4ff; }
        .cn-sample-note {
          font-size: 0.88rem; color: #8fa3b8;
          border-top: 1px solid rgba(255,255,255,0.07);
          padding-top: 1rem; font-style: italic;
        }
        .cn-sample-caption { font-size: 0.88rem; color: #3a4560; margin: 0; }

        /* Response demo */
        .cn-responses-demo { display: flex; flex-direction: column; gap: 12px; max-width: 680px; margin: 2rem auto 0; }
        .cn-response-card {
          background: #141b28;
          border-radius: 14px; padding: 1.5rem;
          border: 1px solid rgba(255,255,255,0.07);
        }
        .cn-response-good { border-color: rgba(0,232,122,0.25); }
        .cn-response-flag { border-color: rgba(255,140,66,0.2); }
        .cn-response-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 0.75rem; flex-wrap: wrap; gap: 8px;
        }
        .cn-response-lo { font-size: 0.85rem; font-weight: 600; color: #f0f4ff; }
        .cn-response-rate { font-size: 0.82rem; font-weight: 600; padding: 3px 10px; border-radius: 99px; }
        .cn-rate-match { background: rgba(0,232,122,0.1); color: #00e87a; border: 1px solid rgba(0,232,122,0.25); }
        .cn-rate-flag { background: rgba(255,140,66,0.1); color: #ff8c42; border: 1px solid rgba(255,140,66,0.25); }
        .cn-response-text { font-size: 0.88rem; color: #8fa3b8; line-height: 1.6; margin: 0 0 0.75rem; }
        .cn-invite-demo { font-size: 0.78rem; color: #00e87a; font-weight: 600; }

        /* CTA section */
        .cn-cta-section {
          text-align: center;
          padding: 6rem 1.5rem;
          background: linear-gradient(to bottom, #080c12, #0a1019);
        }
        .cn-cta-sub { font-size: 0.82rem; color: #3a4560; margin-top: 1rem; }

        /* Mobile */
        @media (max-width: 700px) {
          .cn-steps { flex-direction: column; }
          .cn-step-divider { display: none; }
          .cn-compare { grid-template-columns: 1fr; }
          .cn-sample-grid { grid-template-columns: repeat(2, 1fr); }
          .cn-hero { padding: 4rem 1.25rem 3rem; }
          .cn-response-header { flex-direction: column; align-items: flex-start; }
          .cn-nav-links { display: none; }
        }
      `}</style>
    </>
  );
}
