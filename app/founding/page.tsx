// app/founding/page.tsx
// Founding 500 — urgency landing page for early LO/agent adopters
// Server component: live counter from DB, no client JS needed for core render

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { getSupabase } from "../../lib/supabaseServer";

export const metadata: Metadata = {
  title: "Founding 500 — HomeRates.ai",
  description: "Join the first 500 mortgage professionals on HomeRates.ai and lock in Founding Member pricing and badge forever.",
  openGraph: {
    title: "Founding 500 — HomeRates.ai",
    description: "Only 500 spots. Lock in your Founding Member badge and pricing before they're gone.",
    url: "https://chat.homerates.ai/founding",
    siteName: "HomeRates.ai",
    images: [{ url: "https://chat.homerates.ai/assets/og-default.png", width: 1200, height: 630 }],
  },
};

const FOUNDING_CAP = 500;

const BENEFITS = [
  { icon: "🏅", title: "Founding Member badge", body: "Permanently displayed on your profile and contact card — visible to every borrower you work with." },
  { icon: "🔒", title: "Price locked forever", body: "Your rate never increases as long as your subscription stays active, even as we raise prices for new members." },
  { icon: "⚡", title: "First on the board", body: "Scenarios are first-come-first-served. Founding members get priority scenario notifications before general release." },
  { icon: "🗳️", title: "Shape the product", body: "Direct line to the founders. Vote on features, join beta tests, and influence the roadmap before it's set." },
];

export default async function FoundingPage() {
  const sb = getSupabase();

  // Count registered LOs + agents
  let claimed = 0;
  if (sb) {
    const [{ count: loCount }, { count: agentCount }] = await Promise.all([
      sb.from("loan_officers").select("id", { count: "exact", head: true }),
      sb.from("agents").select("id", { count: "exact", head: true }),
    ]);
    claimed = (loCount ?? 0) + (agentCount ?? 0);
  }

  const remaining = Math.max(FOUNDING_CAP - claimed, 0);
  const pct = Math.min(Math.round((claimed / FOUNDING_CAP) * 100), 100);
  const isFull = remaining === 0;

  // Urgency tier
  const urgency = remaining <= 10 ? "critical" : remaining <= 50 ? "high" : remaining <= 100 ? "medium" : "low";
  const urgencyColor = urgency === "critical" ? "#ff5f5f" : urgency === "high" ? "#ff8c42" : "#00e87a";

  return (
    <>
      <style>{`
        body:has(.founding-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.founding-root){height:auto!important;overflow:visible!important;}
        .founding-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif;}
        .founding-root *{box-sizing:border-box;}

        .f-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:56px;background:rgba(8,12,18,0.97);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px);}
        .f-logo img{height:26px;display:block;}
        .f-nav-cta{font-size:0.82rem;font-weight:700;color:#07100f;background:#00e87a;text-decoration:none;padding:7px 16px;border-radius:8px;}

        .f-shell{max-width:680px;margin:0 auto;padding:56px 20px 80px;}

        .f-badge{display:inline-block;background:#1a2e20;color:#00e87a;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:5px 12px;border-radius:20px;border:1px solid rgba(0,232,122,0.3);margin-bottom:20px;}

        .f-hero-title{font-size:clamp(2rem,6vw,3.2rem);font-weight:800;color:#f0f4ff;line-height:1.1;margin:0 0 16px;}
        .f-hero-title span{color:#00e87a;}
        .f-hero-sub{font-size:1.05rem;color:#7a9e8a;line-height:1.7;margin:0 0 36px;max-width:540px;}

        .f-counter-card{background:#0d1a12;border:1px solid #1a2e20;border-radius:16px;padding:28px;margin-bottom:32px;}
        .f-counter-nums{display:flex;align-items:baseline;gap:10px;margin-bottom:16px;}
        .f-claimed{font-size:3rem;font-weight:800;color:#f0f4ff;line-height:1;}
        .f-cap{font-size:1.2rem;color:#4a6e58;font-weight:600;}
        .f-remaining{font-size:0.9rem;font-weight:700;padding:4px 10px;border-radius:6px;background:#1a2e20;}
        .f-bar-track{height:10px;background:#0f2018;border-radius:999px;overflow:hidden;margin-bottom:10px;}
        .f-bar-fill{height:100%;border-radius:999px;transition:width .4s ease;}
        .f-bar-label{font-size:0.8rem;color:#4a6e58;}

        .f-benefits{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:36px;}
        .f-benefit{background:#0d1a12;border:1px solid #1a2e20;border-radius:12px;padding:18px;}
        .f-benefit-icon{font-size:1.4rem;margin-bottom:8px;}
        .f-benefit-title{font-size:0.9rem;font-weight:700;color:#e8f5ee;margin-bottom:4px;}
        .f-benefit-body{font-size:0.82rem;color:#4a6e58;line-height:1.6;}

        .f-cta{display:block;text-align:center;background:#00e87a;color:#07100f;font-size:1rem;font-weight:700;padding:16px 24px;border-radius:12px;text-decoration:none;margin-bottom:12px;}
        .f-cta:hover{opacity:.9;}
        .f-cta-ghost{display:block;text-align:center;background:transparent;border:1px solid rgba(255,255,255,0.1);color:#7a9e8a;font-size:0.88rem;font-weight:500;padding:12px 24px;border-radius:12px;text-decoration:none;}

        .f-full{background:#1a1410;border:1px solid #3a2010;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;}
        .f-full-title{font-size:1.1rem;font-weight:700;color:#ff8c42;margin-bottom:6px;}
        .f-full-body{font-size:0.88rem;color:#7a6050;line-height:1.6;}

        @media(max-width:560px){
          .f-benefits{grid-template-columns:1fr;}
          .f-shell{padding:36px 16px 60px;}
          .f-hero-title{font-size:1.8rem;}
        }
      `}</style>

      <div className="founding-root">
        <nav className="f-nav">
          <Link href="/" className="f-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          {!isFull && <Link href="/welcome" className="f-nav-cta">Claim your spot →</Link>}
        </nav>

        <div className="f-shell">
          <div className="f-badge">Founding 500</div>

          <h1 className="f-hero-title">
            Be one of the first<br />
            <span>500 professionals</span><br />
            on HomeRates.ai
          </h1>
          <p className="f-hero-sub">
            Lock in Founding Member pricing and your badge before the spots are gone.
            Early members shape the product — and never pay more as we grow.
          </p>

          {/* Live counter */}
          <div className="f-counter-card">
            <div className="f-counter-nums">
              <span className="f-claimed">{claimed}</span>
              <span className="f-cap">/ {FOUNDING_CAP} claimed</span>
              {!isFull && (
                <span className="f-remaining" style={{ color: urgencyColor }}>
                  {remaining} left
                </span>
              )}
            </div>
            <div className="f-bar-track">
              <div
                className="f-bar-fill"
                style={{ width: `${pct}%`, background: isFull ? "#ff8c42" : urgencyColor }}
              />
            </div>
            <div className="f-bar-label">{pct}% of founding spots claimed</div>
          </div>

          {/* Benefits grid */}
          <div className="f-benefits">
            {BENEFITS.map(b => (
              <div key={b.title} className="f-benefit">
                <div className="f-benefit-icon">{b.icon}</div>
                <div className="f-benefit-title">{b.title}</div>
                <div className="f-benefit-body">{b.body}</div>
              </div>
            ))}
          </div>

          {isFull ? (
            <div className="f-full">
              <div className="f-full-title">Founding spots are full</div>
              <div className="f-full-body">
                All 500 founding spots have been claimed. You can still join HomeRates.ai at standard pricing.
              </div>
              <Link href="/welcome" style={{ display: "inline-block", marginTop: 14, background: "#ff8c42", color: "#07100f", fontWeight: 700, padding: "10px 24px", borderRadius: 8, textDecoration: "none" }}>
                Join at standard pricing →
              </Link>
            </div>
          ) : (
            <>
              <Link href="/welcome" className="f-cta">
                Claim founding spot — {remaining} remaining →
              </Link>
              <Link href="/chat" className="f-cta-ghost">
                Try the platform first →
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
