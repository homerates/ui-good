// app/api/referral/track/route.ts
// GET — set hr_ref cookie then redirect (called when visitor clicks the landing page CTA)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code     = searchParams.get("code") ?? "";
  const redirect = searchParams.get("redirect") ?? "/sign-up";

  // Validate redirect is a relative path only (no open redirects)
  const safeRedirect = redirect.startsWith("/") ? redirect : "/sign-up";

  const sb = getSupabase();
  if (sb && code) {
    const { data: user } = await sb
      .from("users")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();

    if (user?.id) {
      const res = NextResponse.redirect(new URL(safeRedirect, req.url));
      res.cookies.set("hr_ref", user.id, {
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
        httpOnly: true,
        sameSite: "lax",
      });
      return res;
    }
  }

  // Invalid code — just redirect without cookie
  return NextResponse.redirect(new URL(safeRedirect, req.url));
}
