"use client";

// app/pricing/page.tsx
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import PageShell from "../components/PageShell";

type BillingPeriod = "monthly" | "annual";

const PLANS = [
  {
    key: "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnual: 0,
    annualMonthly: 0,  // per month when billed annually
    description: "Try HomeRates.ai, no credit card needed.",
    cta: "Get started free",
    ctaVariant: "ghost" as const,
    features: [
      "20 AI mortgage questions / month",
      "Live rate ticker",
      "Basic calculators",
      "Shareable answer links",
    ],
    missing: [
      "Unlimited questions",
      "PDF exports",
      "Rate & refi alerts",
      "Borrower tools",
    ],
  },
  {
    key: "plus",
    name: "Plus",
    priceMonthly: 7,
    priceAnnual: 59,
    annualMonthly: 4.92,
    description: "For homebuyers who want unlimited AI tools and alerts.",
    cta: "Start Plus",
    ctaVariant: "primary" as const,
    highlight: true,
    badge: "Most popular",
    features: [
      "Unlimited AI mortgage questions",
      "PDF export of any answer card",
      "Rate, refi & property alerts",
      "All calculators",
      "Priority support",
    ],
    missing: [
      "Borrower management",
      "LO dashboard",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: 19,
    priceAnnual: 159,
    annualMonthly: 13.25,
    description: "For investors, buyers, and loan officers who need the full stack.",
    cta: "Start Pro",
    ctaVariant: "ghost" as const,
    badge2: "Investor + LO",
    features: [
      "Everything in Plus",
      "⭐ Property Intelligence Reports",
      "⭐ Rentcast Rent AVM + cap rate",
      "⭐ DSCR & investment cash flow",
      "Up to 10 borrowers",
      "LO dashboard",
      "Shared project threads",
    ],
    missing: [],
  },
];

export default function PricingPage() {
  const { isSignedIn, isLoaded } = useUser();
  const searchParams = useSearchParams();
  const canceled = searchParams?.get("canceled") === "true";

  const [billing, setBilling] = useState<BillingPeriod>("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [isLO, setIsLO] = useState<boolean | null>(null); // null = not yet loaded

  useEffect(() => {
    if (canceled) setError("Payment was canceled — no charge was made.");
  }, [canceled]);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/user/plan").then(r => r.json()).then(d => {
      if (d.plan) setCurrentPlan(d.plan);
      setIsLO(d.isLO ?? false);
    }).catch(() => {});
  }, [isSignedIn]);

  // Which plans to show:
  // - Not signed in: all 3 (unknown role, let them see everything)
  // - Signed in LO: all 3
  // - Signed in borrower (not LO): Free + Plus only
  const showPro = !isSignedIn || isLO === null || isLO === true;
  const visiblePlans = showPro ? PLANS : PLANS.filter(p => p.key !== "pro");

  async function handlePortal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  }

  // Static references required — Next.js replaces NEXT_PUBLIC_* at build time
  const PRICE_IDS: Record<string, { monthly: string; annual: string }> = {
    plus: {
      monthly: process.env.NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID ?? "",
      annual:  process.env.NEXT_PUBLIC_STRIPE_PLUS_ANNUAL_PRICE_ID  ?? "",
    },
    pro: {
      monthly: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
      annual:  process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID  ?? "",
    },
  };

  async function handleUpgrade(planKey: string) {
    if (!isSignedIn) return;

    const priceId = billing === "annual"
      ? PRICE_IDS[planKey]?.annual
      : PRICE_IDS[planKey]?.monthly;

    if (!priceId) {
      setError("Stripe price not configured. Please contact support.");
      return;
    }

    setLoading(`${planKey}-${billing}`);
    setError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <PageShell backHref="/" backLabel="Home" maxWidth={1040}>
      <div className="pricing-header">
        <h1 className="pricing-title">Simple, honest pricing</h1>
        <p className="pricing-subtitle">
          Real mortgage math, live rates — no hidden fees, no sales pitch.
        </p>

        {/* Billing toggle */}
        <div className="pricing-toggle">
          <button
            className={`pricing-toggle-btn ${billing === "monthly" ? "active" : ""}`}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </button>
          <button
            className={`pricing-toggle-btn ${billing === "annual" ? "active" : ""}`}
            onClick={() => setBilling("annual")}
          >
            Annual <span className="pricing-toggle-save">Save 30%</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="pricing-notice pricing-notice--error">{error}</div>
      )}

      <div className="pricing-cards">
        {visiblePlans.map((plan) => {
          const isLoadingThis = loading === `${plan.key}-${billing}`;

          return (
            <div
              key={plan.key}
              className={`pricing-card ${plan.highlight ? "pricing-card--highlight" : ""}`}
            >
              {plan.highlight && (
                <div className="pricing-badge">{plan.badge}</div>
              )}
              {(plan as any).badge2 && (
                <div className="pricing-badge pricing-badge--amber">{(plan as any).badge2}</div>
              )}

              <div className="pricing-card-header">
                <div className="pricing-plan-name">{plan.name}</div>
                <div className="pricing-plan-price">
                  {plan.priceMonthly === 0 ? (
                    <span className="pricing-price-amount">Free</span>
                  ) : (
                    <>
                      <span className="pricing-price-currency">$</span>
                      <span className="pricing-price-amount">
                        {billing === "annual"
                          ? plan.annualMonthly.toFixed(2)
                          : plan.priceMonthly}
                      </span>
                      <span className="pricing-price-period">/mo</span>
                    </>
                  )}
                </div>
                {billing === "annual" && plan.priceAnnual > 0 && (
                  <div className="pricing-billed-annual">
                    Billed ${plan.priceAnnual}/yr
                  </div>
                )}
                <p className="pricing-plan-desc">{plan.description}</p>
              </div>

              <ul className="pricing-features">
                {plan.features.map((f) => (
                  <li key={f} className="pricing-feature pricing-feature--yes">
                    <span className="pricing-feature-icon">✓</span> {f}
                  </li>
                ))}
                {plan.missing.map((f) => (
                  <li key={f} className="pricing-feature pricing-feature--no">
                    <span className="pricing-feature-icon">✗</span> {f}
                  </li>
                ))}
              </ul>

              <div className="pricing-cta-wrap">
                {currentPlan === plan.key ? (
                  <button
                    className="pricing-btn pricing-btn--ghost"
                    onClick={handlePortal}
                    disabled={loading === "portal"}
                  >
                    {loading === "portal" ? "Redirecting…" : plan.key === "free" ? "Current Plan" : "Manage Subscription"}
                  </button>
                ) : plan.key === "free" ? (
                  <Link href="/chat" className="pricing-btn pricing-btn--ghost">
                    {plan.cta}
                  </Link>
                ) : isLoaded && !isSignedIn ? (
                  <SignInButton mode="modal">
                    <button className={`pricing-btn pricing-btn--${plan.ctaVariant}`}>
                      {plan.cta}
                    </button>
                  </SignInButton>
                ) : (
                  <button
                    className={`pricing-btn pricing-btn--${plan.ctaVariant}`}
                    onClick={() => handleUpgrade(plan.key)}
                    disabled={isLoadingThis}
                  >
                    {isLoadingThis ? "Redirecting…" : plan.cta}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* LO callout — shown to signed-in borrowers in place of the Pro card */}
      {isSignedIn && isLO === false && (
        <div className="pricing-lo-callout">
          <span className="pricing-lo-callout-label">Are you a Loan Officer or Agent?</span>
          <Link href="/for-pros" className="pricing-lo-callout-link">See Pro plan for professionals →</Link>
        </div>
      )}

      <p className="pricing-footer-note">
        All paid plans include a 7-day free trial. Cancel anytime.{" "}
        <Link href="/disclosures" className="pricing-footer-link">Terms apply.</Link>
        {" · "}
        <Link href="/support" className="pricing-footer-link">Support</Link>
      </p>

      <style>{`
        .pricing-header { text-align: center; margin-bottom: 48px; }
        .pricing-title {
          font-family: var(--font-dm-sans, sans-serif);
          font-size: clamp(1.8rem, 4vw, 2.8rem);
          font-weight: 700;
          margin: 0 0 12px;
          color: #fff;
        }
        .pricing-subtitle {
          font-size: 1rem;
          color: rgba(185, 208, 192, 0.8);
          max-width: 480px;
          margin: 0 auto 28px;
          line-height: 1.6;
        }

        /* Billing toggle */
        .pricing-toggle {
          display: inline-flex;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 999px;
          padding: 4px;
          gap: 4px;
        }
        .pricing-toggle-btn {
          padding: 7px 20px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(224,240,232,0.6);
          font-family: var(--font-dm-sans, sans-serif);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pricing-toggle-btn.active {
          background: rgba(0,232,122,0.15);
          color: #00e87a;
        }
        .pricing-toggle-save {
          font-size: 0.7rem;
          font-weight: 700;
          background: #00e87a;
          color: #080c12;
          padding: 2px 7px;
          border-radius: 999px;
          letter-spacing: 0.04em;
        }

        .pricing-notice {
          max-width: 720px;
          margin: 0 auto 24px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 0.9rem;
          text-align: center;
        }
        .pricing-notice--error { background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.3); color: #ff8080; }

        .pricing-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
          gap: 20px;
          max-width: 960px;
          width: 100%;
          margin: 0 auto 48px;
        }
        @media (max-width: 640px) {
          .pricing-cards {
            grid-template-columns: 1fr;
          }
        }
        .pricing-card {
          position: relative;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 28px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .pricing-card--highlight {
          border-color: rgba(0,232,122,0.4);
          background: rgba(0,232,122,0.04);
          box-shadow: 0 0 40px rgba(0,232,122,0.06);
        }
        .pricing-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: #00e87a;
          color: #080c12;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 3px 12px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .pricing-badge--amber {
          background: linear-gradient(135deg, #f59e0b, #fbbf24);
          color: #1a0a00;
        }
        .pricing-plan-name {
          font-family: var(--font-dm-sans, sans-serif);
          font-size: 1.1rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 8px;
        }
        .pricing-plan-price { display: flex; align-items: baseline; gap: 2px; margin-bottom: 4px; }
        .pricing-price-currency { font-size: 1.2rem; color: rgba(224,240,232,0.7); margin-top: 6px; }
        .pricing-price-amount { font-size: 2.4rem; font-weight: 700; color: #fff; line-height: 1; }
        .pricing-price-period { font-size: 0.9rem; color: rgba(185,208,192,0.7); margin-left: 2px; }
        .pricing-billed-annual { font-size: 0.75rem; color: rgba(0,232,122,0.7); margin-bottom: 4px; }
        .pricing-plan-desc { font-size: 0.85rem; color: rgba(185,208,192,0.75); margin: 0; line-height: 1.5; }

        .pricing-features { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; flex: 1; }
        .pricing-feature { display: flex; align-items: flex-start; gap: 8px; font-size: 0.875rem; line-height: 1.4; }
        .pricing-feature--yes { color: rgba(224,240,232,0.9); }
        .pricing-feature--no  { color: rgba(185,208,192,0.3); }
        .pricing-feature-icon { flex-shrink: 0; width: 16px; font-size: 0.75rem; margin-top: 1px; }
        .pricing-feature--yes .pricing-feature-icon { color: #00e87a; }
        .pricing-feature--no  .pricing-feature-icon { color: rgba(185,208,192,0.25); }

        .pricing-cta-wrap { margin-top: auto; }
        .pricing-btn {
          display: block;
          width: 100%;
          padding: 12px 20px;
          border-radius: 10px;
          font-family: var(--font-dm-sans, sans-serif);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          border: none;
          transition: opacity 0.15s, transform 0.15s;
        }
        .pricing-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .pricing-btn:not(:disabled):hover { opacity: 0.88; transform: translateY(-1px); }
        .pricing-btn--primary { background: #00e87a; color: #080c12; }
        .pricing-btn--ghost { background: transparent; color: rgba(224,240,232,0.8); border: 1px solid rgba(255,255,255,0.15); }

        .pricing-footer-note {
          text-align: center;
          font-size: 0.8rem;
          color: rgba(185,208,192,0.5);
          max-width: 480px;
          margin: 0 auto;
        }
        .pricing-footer-link { color: rgba(0,232,122,0.7); text-decoration: none; }
        .pricing-footer-link:hover { color: #00e87a; }

        .pricing-lo-callout {
          display: flex; align-items: center; justify-content: center;
          gap: 16px; flex-wrap: wrap;
          margin: 0 auto 28px;
          padding: 12px 20px;
          background: rgba(61,139,255,0.06);
          border: 1px solid rgba(61,139,255,0.15);
          border-radius: 10px;
          max-width: 480px;
        }
        .pricing-lo-callout-label { font-size: 0.85rem; color: rgba(185,208,192,0.7); }
        .pricing-lo-callout-link { font-size: 0.85rem; font-weight: 600; color: #3d8bff; text-decoration: none; white-space: nowrap; }
        .pricing-lo-callout-link:hover { color: #6aaeff; }
      `}</style>
    </PageShell>
  );
}
