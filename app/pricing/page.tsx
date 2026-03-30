"use client";

// app/pricing/page.tsx
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: 0,
    period: "",
    description: "Try HomeRates.ai with no commitment.",
    priceEnvKey: null,
    cta: "Get started",
    ctaVariant: "ghost" as const,
    features: [
      "20 AI mortgage questions / month",
      "Live rate ticker",
      "Basic calculators",
      "Shareable answer links",
    ],
    missing: [
      "PDF exports",
      "Rate & refi alerts",
      "Borrower management",
      "Unlimited questions",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 29,
    period: "/mo",
    description: "For loan officers managing clients.",
    priceEnvKey: "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID",
    cta: "Upgrade to Pro",
    ctaVariant: "primary" as const,
    highlight: true,
    features: [
      "Unlimited AI mortgage questions",
      "PDF export of any answer card",
      "Rate, refi & property alerts",
      "Up to 10 borrowers",
      "Borrower invite codes",
      "LO dashboard",
      "Priority support",
    ],
    missing: [],
  },
  {
    key: "team",
    name: "Team",
    price: 79,
    period: "/mo",
    description: "For high-volume teams and branches.",
    priceEnvKey: "NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID",
    cta: "Upgrade to Team",
    ctaVariant: "ghost" as const,
    features: [
      "Everything in Pro",
      "Up to 50 borrowers",
      "Shared project threads",
      "Team usage dashboard",
      "Dedicated onboarding",
    ],
    missing: [],
  },
];

export default function PricingPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canceled = searchParams?.get("canceled") === "true";

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (canceled) setError("Payment was canceled — no charge was made.");
  }, [canceled]);

  async function handleUpgrade(planKey: string) {
    if (!isSignedIn) return; // button hidden for signed-out users

    const priceId =
      planKey === "pro"
        ? process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID;

    if (!priceId) {
      setError("Stripe price not configured. Please contact support.");
      return;
    }

    setLoading(planKey);
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
        <h1 className="pricing-title">Simple, transparent pricing</h1>
        <p className="pricing-subtitle">
          Real mortgage math, live rates, no surprises on your bill.
        </p>
      </div>

      {canceled && (
        <div className="pricing-notice pricing-notice--warn">
          Payment canceled — no charge was made.
        </div>
      )}
      {error && !canceled && (
        <div className="pricing-notice pricing-notice--error">{error}</div>
      )}

      <div className="pricing-cards">
        {PLANS.map((plan) => (
          <div
            key={plan.key}
            className={`pricing-card ${plan.highlight ? "pricing-card--highlight" : ""}`}
          >
            {plan.highlight && <div className="pricing-badge">Most popular</div>}

            <div className="pricing-card-header">
              <div className="pricing-plan-name">{plan.name}</div>
              <div className="pricing-plan-price">
                {plan.price === 0 ? (
                  <span className="pricing-price-amount">Free</span>
                ) : (
                  <>
                    <span className="pricing-price-currency">$</span>
                    <span className="pricing-price-amount">{plan.price}</span>
                    <span className="pricing-price-period">{plan.period}</span>
                  </>
                )}
              </div>
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
                  disabled={loading === plan.key}
                >
                  {loading === plan.key ? "Redirecting…" : plan.cta}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="pricing-footer-note">
        All plans include a 7-day free trial. Cancel anytime.{" "}
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
          margin: 0 auto;
          line-height: 1.6;
        }
        .pricing-notice {
          max-width: 720px;
          margin: 0 auto 24px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 0.9rem;
          text-align: center;
        }
        .pricing-notice--warn  { background: rgba(255,200,0,0.1); border: 1px solid rgba(255,200,0,0.3); color: #ffd966; }
        .pricing-notice--error { background: rgba(255,80,80,0.1);  border: 1px solid rgba(255,80,80,0.3);  color: #ff8080; }

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
          transition: border-color 0.2s;
        }
        .pricing-card--highlight {
          border-color: rgba(0, 232, 122, 0.4);
          background: rgba(0, 232, 122, 0.04);
          box-shadow: 0 0 40px rgba(0, 232, 122, 0.06);
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
        .pricing-plan-price { display: flex; align-items: baseline; gap: 2px; margin-bottom: 8px; }
        .pricing-price-currency { font-size: 1.2rem; color: rgba(224,240,232,0.7); margin-top: 6px; }
        .pricing-price-amount { font-size: 2.4rem; font-weight: 700; color: #fff; line-height: 1; }
        .pricing-price-period { font-size: 0.9rem; color: rgba(160,192,168,0.7); margin-left: 2px; }
        .pricing-plan-desc { font-size: 0.85rem; color: rgba(160,192,168,0.75); margin: 0; line-height: 1.5; }

        .pricing-features { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; flex: 1; }
        .pricing-feature { display: flex; align-items: flex-start; gap: 8px; font-size: 0.875rem; line-height: 1.4; }
        .pricing-feature--yes { color: rgba(224,240,232,0.9); }
        .pricing-feature--no  { color: rgba(160,192,168,0.35); }
        .pricing-feature-icon {
          flex-shrink: 0;
          width: 16px;
          font-size: 0.75rem;
          margin-top: 1px;
        }
        .pricing-feature--yes .pricing-feature-icon { color: #00e87a; }
        .pricing-feature--no  .pricing-feature-icon { color: rgba(160,192,168,0.3); }

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
        .pricing-btn--ghost   {
          background: transparent;
          color: rgba(224,240,232,0.8);
          border: 1px solid rgba(255,255,255,0.15);
        }

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
