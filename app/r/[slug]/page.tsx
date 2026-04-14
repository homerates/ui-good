// app/r/[slug]/page.tsx
// Referral landing page — slug = 8-char referral code
// Sets hr_ref cookie (referrer's clerk ID), then shows branded landing

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabase } from "../../../lib/supabaseServer";

export const dynamic = "force-dynamic";

interface ReferrerInfo {
  userId: string;
  fullName: string | null;
  title: string | null;
  lender: string | null;
}

async function getReferrer(slug: string): Promise<ReferrerInfo | null> {
  const sb = getSupabase();
  if (!sb) return null;

  // Look up by short referral_code
  const { data: user } = await sb
    .from("users")
    .select("id, full_name, role")
    .eq("referral_code", slug)
    .maybeSingle();

  if (!user) return null;

  let title: string | null = null;
  let lender: string | null = null;

  if (user.role === "lo") {
    const { data: lo } = await sb
      .from("loan_officers")
      .select("title, lender")
      .eq("user_id", user.id)
      .maybeSingle();
    title = lo?.title ?? "Loan Officer";
    lender = lo?.lender ?? null;
  } else if (user.role === "agent") {
    const { data: ag } = await sb
      .from("agents")
      .select("title, brokerage")
      .eq("user_id", user.id)
      .maybeSingle();
    title = ag?.title ?? "Real Estate Agent";
    lender = ag?.brokerage ?? null;
  }

  return { userId: user.id, fullName: user.full_name, title, lender };
}

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const referrer = await getReferrer(slug);
  if (!referrer) redirect("/welcome");

  // Set 7-day cookie with referrer's clerk user ID
  const jar = await cookies();
  jar.set("hr_ref", referrer.userId, {
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    httpOnly: true,
    sameSite: "lax",
  });

  const name = referrer.fullName ?? "A HomeRates professional";
  const title = referrer.title ?? "Mortgage Professional";
  const company = referrer.lender ? ` at ${referrer.lender}` : "";

  return (
    <>
      <style>{`
        body { margin: 0; padding: 0; background: #080c12; font-family: 'Helvetica Neue', Arial, sans-serif; }
        * { box-sizing: border-box; }
        .ref-wrap {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          padding: 32px 16px; background: #080c12;
        }
        .ref-card {
          max-width: 480px; width: 100%;
          background: #0e1420;
          border: 1px solid rgba(0,232,122,0.18);
          border-radius: 20px;
          overflow: hidden;
        }
        .ref-header {
          background: #0a1a10;
          border-bottom: 3px solid #00e87a;
          padding: 24px 32px;
        }
        .ref-logo {
          height: 22px; display: block;
        }
        .ref-body { padding: 32px; }
        .ref-tag {
          display: inline-block;
          background: rgba(0,232,122,0.12);
          color: #00e87a;
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.08em; text-transform: uppercase;
          padding: 4px 12px; border-radius: 999px;
          margin-bottom: 20px;
        }
        .ref-invite {
          font-size: 22px; font-weight: 700; color: #f0f4ff;
          line-height: 1.3; margin: 0 0 8px;
        }
        .ref-who {
          font-size: 15px; color: #8fa3b8; margin: 0 0 28px;
        }
        .ref-who strong { color: #e0e8f4; }
        .ref-benefits {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 28px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .ref-benefit {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 14px; color: #c8d8e8; line-height: 1.4;
        }
        .ref-icon {
          flex-shrink: 0; font-size: 16px; margin-top: 1px;
        }
        .ref-cta {
          display: block; width: 100%;
          background: #00e87a; color: #07100f;
          font-size: 15px; font-weight: 700;
          padding: 14px 20px; border-radius: 12px;
          text-align: center; text-decoration: none;
          border: none; cursor: pointer;
          transition: opacity 0.15s;
        }
        .ref-cta:hover { opacity: 0.88; }
        .ref-footnote {
          margin-top: 16px; font-size: 12px;
          color: rgba(143,163,184,0.5);
          text-align: center; line-height: 1.5;
        }
      `}</style>

      <div className="ref-wrap">
        <div className="ref-card">
          <div className="ref-header">
            <img
              src="https://chat.homerates.ai/assets/homerates-email-logo.png"
              alt="HomeRates.ai"
              className="ref-logo"
            />
          </div>
          <div className="ref-body">
            <div className="ref-tag">Personal Invitation</div>
            <h1 className="ref-invite">You&rsquo;ve been invited to HomeRates.ai</h1>
            <p className="ref-who">
              <strong>{name}</strong>, {title}{company}, is sharing AI-powered mortgage tools with you.
            </p>

            <div className="ref-benefits">
              <div className="ref-benefit">
                <span className="ref-icon">💬</span>
                <span>Ask any mortgage question in plain English — get instant, accurate answers</span>
              </div>
              <div className="ref-benefit">
                <span className="ref-icon">📊</span>
                <span>Run real rate scenarios and payment breakdowns in seconds</span>
              </div>
              <div className="ref-benefit">
                <span className="ref-icon">🏡</span>
                <span>Get a free monthly home value &amp; equity report for your property</span>
              </div>
              <div className="ref-benefit">
                <span className="ref-icon">🎁</span>
                <span>Start with free credits — no credit card required</span>
              </div>
            </div>

            <a href="/sign-up" className="ref-cta">
              Get started free →
            </a>
            <p className="ref-footnote">
              Already have an account? <a href="/sign-in" style={{ color: "#8fa3b8" }}>Sign in</a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
