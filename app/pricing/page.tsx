"use client";

// app/pricing/page.tsx
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

type BillingPeriod = "monthly" | "annual";

const PLANS = [
  {
    key: "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnual: 0,
    annualMonthly: 0,  // per month when billed annually
    description: "Try HomeRates.ai, no credit card needed.",
    envKeyMonthly: null,
    envKeyAnnual: null,
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
    description: "For homebuyers and investors who want the full toolkit.",
    envKeyMonthly: "NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID",
    envKeyAnnual:  "NEXT_PUBLIC_STRIPE_PLUS_ANNUAL_PRICE_ID",
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
    description: "For loan officers managing clients and borrowers.",
    envKeyMonthly: "NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID",
    envKeyAnnual:  "NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID",
    cta: "Start Pro",
    ctaVariant: "ghost" as const,
    features: [
      "Everything in Plus",
      "Up to 10 borrowers",
      "Borrower invite codes",
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

  useEffect(() => {
    if (canceled) setError("Payment was canceled — no charge was made.");
  }, [canceled]);

  async function handleUpgrade(planKey: string) {
    if (!isSignedIn) return;

    const plan = PLANS.find((p) => p.key === planKey);
    if (!plan || !plan.envKeyMonthly) return;

    const priceId = billing === "annual"
      ? process.env[plan.envKeyAnnual ?? ""]
      : process.env[plan.envKeyMonthly];

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
    <main className="pricing-page">
      <div className="pricing-header">
        <Link href="/" className="pricing-logo-link">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" className="pricing-logo" />
        </Link>
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
        {PLANS.map((plan) => {
          const displayPrice = billing === "annual" && plan.annualMonthly
            ? plan.annualMonthly
            : plan.priceMonthly;
          const isLoadingThis = loading === `${plan.key}-${billing}`;

          return (
            <div
              key={plan.key}
              className={`pricing-card ${plan.highlight ? "pricing-card--highlight" : ""}`}
            >
              {plan.highlight && (
                <div className="pricing-badge">{plan.badge}</div>
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
                {plan.key === "free" ? (
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

      <p className="pricing-footer-note">
        All paid plans include a 7-day free trial. Cancel anytime.{" "}
        <Link href="/disclosures" className="pricing-footer-link">Terms apply.</Link>
      </p>

      <style>{`
        .pricing-page {
          min-height: 100vh;
          background: var(--bg, #080c12);
          color: var(--text, #e0f0e8);
          padding: 48px 16px 80px;
          font-family: var(--font-dm-sans, sans-serif);
        }
        .pricing-logo-link { display: block; text-align: center; margin-bottom: 32px; }
        .pricing-logo { height: 36px; width: auto; }
        .pricing-header { text-align: center; margin-bottom: 48px; }
        .pricing-title {
          font-family: var(--font-syne, sans-serif);
          font-size: clamp(1.8rem, 4vw, 2.8rem);
          font-weight: 700;
          margin: 0 0 12px;
          color: #fff;
        }
        .pricing-subtitle {
          font-size: 1rem;
          color: rgba(160, 192, 168, 0.8);
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
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          max-width: 960px;
          margin: 0 auto 48px;
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
        .pricing-plan-name {
          font-family: var(--font-syne, sans-serif);
          font-size: 1.1rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 8px;
        }
        .pricing-plan-price { display: flex; align-items: baseline; gap: 2px; margin-bottom: 4px; }
        .pricing-price-currency { font-size: 1.2rem; color: rgba(224,240,232,0.7); margin-top: 6px; }
        .pricing-price-amount { font-size: 2.4rem; font-weight: 700; color: #fff; line-height: 1; }
        .pricing-price-period { font-size: 0.9rem; color: rgba(160,192,168,0.7); margin-left: 2px; }
        .pricing-billed-annual { font-size: 0.75rem; color: rgba(0,232,122,0.7); margin-bottom: 4px; }
        .pricing-plan-desc { font-size: 0.85rem; color: rgba(160,192,168,0.75); margin: 0; line-height: 1.5; }

        .pricing-features { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; flex: 1; }
        .pricing-feature { display: flex; align-items: flex-start; gap: 8px; font-size: 0.875rem; line-height: 1.4; }
        .pricing-feature--yes { color: rgba(224,240,232,0.9); }
        .pricing-feature--no  { color: rgba(160,192,168,0.3); }
        .pricing-feature-icon { flex-shrink: 0; width: 16px; font-size: 0.75rem; margin-top: 1px; }
        .pricing-feature--yes .pricing-feature-icon { color: #00e87a; }
        .pricing-feature--no  .pricing-feature-icon { color: rgba(160,192,168,0.25); }

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
          color: rgba(160,192,168,0.5);
          max-width: 480px;
          margin: 0 auto;
        }
        .pricing-footer-link { color: rgba(0,232,122,0.7); text-decoration: none; }
        .pricing-footer-link:hover { color: #00e87a; }
      `}</style>
    </main>
  );
}
