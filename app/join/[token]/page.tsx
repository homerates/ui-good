// app/join/[token]/page.tsx
// Brokerage invite landing page
// If authenticated → auto-join attempt, then redirect to /brokerage/manage
// If not authenticated → show branded card with sign-up CTA

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";

async function getBrokerageName(token: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("brokerages")
    .select("name")
    .eq("invite_token", token)
    .maybeSingle();
  return data?.name ?? null;
}

export default async function JoinBrokeragePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const brokerageName = await getBrokerageName(token);

  if (!brokerageName) {
    // Invalid token — redirect to home
    redirect("/");
  }

  const { userId } = await auth();

  if (userId) {
    // Signed in — attempt to join via API, then redirect
    const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";
    try {
      await fetch(`${base}/api/brokerage/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
    } catch {
      // non-fatal; redirect anyway
    }
    redirect("/brokerage/manage");
  }

  // Not signed in — show landing page
  return (
    <>
      <style>{`
        body { margin: 0; padding: 0; background: #080c12; font-family: 'Helvetica Neue', Arial, sans-serif; }
        * { box-sizing: border-box; }
        .join-wrap {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          padding: 32px 16px;
        }
        .join-card {
          max-width: 440px; width: 100%;
          background: #0e1420;
          border: 1px solid rgba(0,232,122,0.18);
          border-radius: 20px; overflow: hidden;
        }
        .join-header {
          background: #0a1a10; border-bottom: 3px solid #00e87a;
          padding: 24px 32px;
        }
        .join-logo { height: 22px; display: block; }
        .join-body { padding: 32px; }
        .join-tag {
          display: inline-block;
          background: rgba(0,232,122,0.12); color: #00e87a;
          font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; padding: 4px 12px; border-radius: 999px;
          margin-bottom: 20px;
        }
        .join-h1 { font-size: 22px; font-weight: 700; color: #f0f4ff; margin: 0 0 10px; line-height: 1.3; }
        .join-sub { font-size: 15px; color: #8fa3b8; margin: 0 0 28px; }
        .join-sub strong { color: #e0e8f4; }
        .join-cta {
          display: block; width: 100%; background: #00e87a; color: #07100f;
          font-size: 15px; font-weight: 700; padding: 14px 20px;
          border-radius: 12px; text-align: center; text-decoration: none;
          transition: opacity 0.15s;
        }
        .join-cta:hover { opacity: 0.88; }
        .join-footnote {
          margin-top: 16px; font-size: 12px;
          color: rgba(143,163,184,0.5); text-align: center; line-height: 1.5;
        }
      `}</style>
      <div className="join-wrap">
        <div className="join-card">
          <div className="join-header">
            <img
              src="https://chat.homerates.ai/assets/homerates-email-logo.png"
              alt="HomeRates.ai"
              className="join-logo"
            />
          </div>
          <div className="join-body">
            <div className="join-tag">Team Invitation</div>
            <h1 className="join-h1">Join {brokerageName} on HomeRates.ai</h1>
            <p className="join-sub">
              You&apos;ve been invited to join the <strong>{brokerageName}</strong> team.
              Create your free account to accept.
            </p>
            <a href={`/sign-up?redirect_url=/join/${token}`} className="join-cta">
              Accept invitation →
            </a>
            <p className="join-footnote">
              Already have an account?{" "}
              <a href={`/sign-in?redirect_url=/join/${token}`} style={{ color: "#8fa3b8" }}>
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
