"use client";
// app/connect/post/page.tsx
// Borrower posts an anonymous scenario brief — 2-step form

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const LOAN_TYPES = ["Conventional", "FHA", "VA", "Jumbo", "DSCR", "Other"];
const PURPOSES = ["Purchase", "Refinance"];
const PRICE_RANGES = ["Under $300k", "$300k–$400k", "$400k–$500k", "$500k–$750k", "$750k–$1M", "$1M–$1.5M", "$1.5M+"];
const DOWN_PAYMENTS = [3, 5, 10, 15, 20, 25, 30];
const INCOME_RANGES = ["Under $60k", "$60k–$80k", "$80k–$100k", "$100k–$150k", "$150k–$200k", "$200k+"];
const CREDIT_TIERS = ["Excellent (740+)", "Good (700–739)", "Fair (660–699)", "Below 660"];
const TIMELINES = ["ASAP (under 30 days)", "1–2 months", "3–6 months", "Just researching"];
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

export default function PostScenarioPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    needs_professional: "both",
    loan_type: "",
    loan_purpose: "Purchase",
    price_range: "",
    down_payment_pct: "",
    income_range: "",
    credit_tier: "",
    timeline: "",
    state: "",
    notes: "",
  });

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const step1Valid = form.loan_type && form.loan_purpose && form.price_range && form.down_payment_pct;
  const step2Valid = form.income_range && form.credit_tier && form.timeline && form.state;

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          loan_type: form.loan_type.toLowerCase().replace(/ /g, "_"),
          down_payment_pct: parseInt(form.down_payment_pct),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.existing_id) {
          router.push("/connect/my-scenario");
          return;
        }
        setError(data.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }
      router.push("/connect/my-scenario");
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="post-root">

        <nav className="post-nav">
          <Link href="/connect" className="post-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <span className="post-nav-label">Post Your Scenario</span>
        </nav>

        <div className="post-container">

          {/* Progress */}
          <div className="post-progress">
            <div className={`post-prog-step ${step >= 1 ? "active" : ""}`}>
              <span>1</span> Loan Details
            </div>
            <div className="post-prog-line" />
            <div className={`post-prog-step ${step >= 2 ? "active" : ""}`}>
              <span>2</span> About You
            </div>
            <div className="post-prog-line" />
            <div className={`post-prog-step ${step >= 3 ? "active" : ""}`}>
              <span>3</span> Review & Post
            </div>
          </div>

          <div className="post-card">

            {step === 1 && (
              <>
                <h1 className="post-title">Tell us about the loan</h1>
                <p className="post-sub">This is what professionals will see — no personal details.</p>

                <div className="post-field">
                  <label>Who do you need?</label>
                  <div className="post-chips">
                    {[
                      { v: "both", label: "Lender + Agent" },
                      { v: "lender", label: "Lender only" },
                      { v: "agent", label: "Agent only" },
                    ].map(({ v, label }) => (
                      <button key={v} className={`post-chip ${form.needs_professional === v ? "selected" : ""}`} onClick={() => set("needs_professional", v)}>{label}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Loan type</label>
                  <div className="post-chips">
                    {LOAN_TYPES.map(t => (
                      <button key={t} className={`post-chip ${form.loan_type === t ? "selected" : ""}`} onClick={() => set("loan_type", t)}>{t}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Purpose</label>
                  <div className="post-chips">
                    {PURPOSES.map(p => (
                      <button key={p} className={`post-chip ${form.loan_purpose === p ? "selected" : ""}`} onClick={() => set("loan_purpose", p)}>{p}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Price range</label>
                  <div className="post-chips">
                    {PRICE_RANGES.map(r => (
                      <button key={r} className={`post-chip ${form.price_range === r ? "selected" : ""}`} onClick={() => set("price_range", r)}>{r}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Down payment</label>
                  <div className="post-chips">
                    {DOWN_PAYMENTS.map(d => (
                      <button key={d} className={`post-chip ${form.down_payment_pct === String(d) ? "selected" : ""}`} onClick={() => set("down_payment_pct", String(d))}>{d}%</button>
                    ))}
                  </div>
                </div>

                <button className="post-btn" disabled={!step1Valid} onClick={() => setStep(2)}>
                  Continue →
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="post-title">A bit about your situation</h1>
                <p className="post-sub">Helps lenders give you a real answer. Still anonymous.</p>

                <div className="post-field">
                  <label>Household income range</label>
                  <div className="post-chips">
                    {INCOME_RANGES.map(r => (
                      <button key={r} className={`post-chip ${form.income_range === r ? "selected" : ""}`} onClick={() => set("income_range", r)}>{r}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Credit score tier (self-reported)</label>
                  <div className="post-chips">
                    {CREDIT_TIERS.map(t => (
                      <button key={t} className={`post-chip ${form.credit_tier === t ? "selected" : ""}`} onClick={() => set("credit_tier", t)}>{t}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>Timeline</label>
                  <div className="post-chips">
                    {TIMELINES.map(t => (
                      <button key={t} className={`post-chip ${form.timeline === t ? "selected" : ""}`} onClick={() => set("timeline", t)}>{t}</button>
                    ))}
                  </div>
                </div>

                <div className="post-field">
                  <label>State</label>
                  <select className="post-select" value={form.state} onChange={e => set("state", e.target.value)}>
                    <option value="">Select state</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="post-row">
                  <button className="post-btn-ghost" onClick={() => setStep(1)}>← Back</button>
                  <button className="post-btn" disabled={!step2Valid} onClick={() => setStep(3)}>Continue →</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="post-title">Review your scenario</h1>
                <p className="post-sub">This is exactly what professionals will see. No personal info is shared.</p>

                <div className="post-review-grid">
                  {[
                    ["Need", form.needs_professional === "both" ? "Lender + Agent" : form.needs_professional === "agent" ? "Agent only" : "Lender only"],
                    ["Loan type", form.loan_type],
                    ["Purpose", form.loan_purpose],
                    ["Price range", form.price_range],
                    ["Down payment", `${form.down_payment_pct}%`],
                    ["Income range", form.income_range],
                    ["Credit tier", form.credit_tier],
                    ["Timeline", form.timeline],
                    ["State", form.state],
                  ].map(([label, value]) => (
                    <div key={label} className="post-review-field">
                      <div className="post-review-label">{label}</div>
                      <div className="post-review-value">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="post-field">
                  <label>Optional note <span className="post-optional">(visible to professionals)</span></label>
                  <textarea
                    className="post-textarea"
                    placeholder="e.g. First-time buyer, open to ARM, have a co-borrower..."
                    maxLength={280}
                    value={form.notes}
                    onChange={e => set("notes", e.target.value)}
                    rows={3}
                  />
                  <div className="post-char-count">{form.notes.length}/280</div>
                </div>

                <div className="post-privacy-note">
                  🔒 Your name, email, and contact info are never shared until you choose to invite a specific professional.
                </div>

                {error && <div className="post-error">{error}</div>}

                <div className="post-row">
                  <button className="post-btn-ghost" onClick={() => setStep(2)}>← Back</button>
                  <button className="post-btn" disabled={submitting} onClick={submit}>
                    {submitting ? "Posting..." : "Post My Scenario →"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        body:has(.post-root) {
          display: block !important; height: auto !important;
          overflow-y: auto !important; background: #080c12 !important;
        }
        html:has(.post-root) { background: #080c12 !important; height: auto !important; overflow-y: auto !important; }
        body:has(.post-root) .app-footer { display: none; }

        .post-root { font-family: 'DM Sans', system-ui, sans-serif; color: #f0f4ff; min-height: 100vh; background: #080c12; }

        .post-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          background: rgba(8,12,18,0.95); backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .post-nav-logo img { height: 28px; }
        .post-nav-label { font-size: 0.85rem; color: #6b7a99; }

        .post-container { max-width: 560px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }

        .post-progress {
          display: flex; align-items: center; margin-bottom: 2.5rem; gap: 0;
        }
        .post-prog-step {
          display: flex; align-items: center; gap: 8px;
          font-size: 0.82rem; color: #3a4560; font-weight: 500;
          white-space: nowrap;
        }
        .post-prog-step.active { color: #f0f4ff; }
        .post-prog-step span {
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(255,255,255,0.07); color: #3a4560;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 600; flex-shrink: 0;
        }
        .post-prog-step.active span { background: #00e87a; color: #080c12; }
        .post-prog-line { flex: 1; height: 1px; background: rgba(255,255,255,0.08); margin: 0 10px; }

        .post-card {
          background: #0e1420;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 2.5rem;
        }
        .post-title {
          font-family: 'Syne', sans-serif;
          font-size: 1.5rem; font-weight: 700;
          margin: 0 0 0.4rem; color: #f0f4ff;
        }
        .post-sub { font-size: 0.9rem; color: #6b7a99; margin: 0 0 2rem; }

        .post-field { margin-bottom: 1.75rem; }
        .post-field label {
          display: block; font-size: 0.82rem; font-weight: 600;
          color: #6b7a99; text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 0.75rem;
        }
        .post-optional { font-weight: 400; text-transform: none; letter-spacing: 0; color: #3a4560; }

        .post-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .post-chip {
          padding: 7px 16px; border-radius: 99px;
          border: 1px solid rgba(255,255,255,0.10);
          background: transparent; color: #6b7a99;
          font-size: 0.875rem; cursor: pointer;
          transition: all 0.15s;
        }
        .post-chip:hover { border-color: rgba(255,255,255,0.25); color: #f0f4ff; }
        .post-chip.selected { background: rgba(0,232,122,0.12); border-color: rgba(0,232,122,0.4); color: #00e87a; font-weight: 600; }

        .post-select {
          width: 100%; padding: 10px 14px;
          background: #141b28; border: 1px solid rgba(255,255,255,0.10);
          border-radius: 10px; color: #f0f4ff; font-size: 0.9rem;
          outline: none;
        }
        .post-select:focus { border-color: rgba(0,232,122,0.4); }

        .post-textarea {
          width: 100%; padding: 12px 14px;
          background: #141b28; border: 1px solid rgba(255,255,255,0.10);
          border-radius: 10px; color: #f0f4ff; font-size: 0.9rem;
          resize: vertical; outline: none; font-family: inherit;
          line-height: 1.5; box-sizing: border-box;
        }
        .post-textarea:focus { border-color: rgba(0,232,122,0.4); }
        .post-char-count { font-size: 0.75rem; color: #3a4560; text-align: right; margin-top: 4px; }

        .post-review-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 12px; margin-bottom: 1.75rem;
          background: #141b28; border-radius: 12px; padding: 1.25rem;
          border: 1px solid rgba(255,255,255,0.07);
        }
        .post-review-label { font-size: 0.72rem; color: #3a4560; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
        .post-review-value { font-size: 0.9rem; font-weight: 600; color: #f0f4ff; }

        .post-privacy-note {
          font-size: 0.83rem; color: #6b7a99;
          background: rgba(0,232,122,0.05);
          border: 1px solid rgba(0,232,122,0.15);
          border-radius: 10px; padding: 12px 16px;
          margin-bottom: 1.5rem; line-height: 1.5;
        }

        .post-error {
          font-size: 0.875rem; color: #ff5f5f;
          background: rgba(255,95,95,0.08); border: 1px solid rgba(255,95,95,0.2);
          border-radius: 8px; padding: 10px 14px; margin-bottom: 1rem;
        }

        .post-row { display: flex; gap: 12px; justify-content: flex-end; }

        .post-btn {
          padding: 12px 28px; background: #00e87a; color: #080c12;
          border: none; border-radius: 999px;
          font-size: 0.95rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .post-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .post-btn:not(:disabled):hover { opacity: 0.88; }

        .post-btn-ghost {
          padding: 12px 20px; background: transparent;
          border: 1px solid rgba(255,255,255,0.12); color: #6b7a99;
          border-radius: 999px; font-size: 0.9rem; cursor: pointer;
          transition: all 0.15s;
        }
        .post-btn-ghost:hover { border-color: rgba(255,255,255,0.25); color: #f0f4ff; }

        @media (max-width: 500px) {
          .post-card { padding: 1.5rem; }
          .post-review-grid { grid-template-columns: 1fr; }
          .post-prog-step { font-size: 0; }
          .post-prog-step span { font-size: 0.75rem; }
        }
      `}</style>
    </>
  );
}
