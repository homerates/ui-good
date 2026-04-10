// app/r/[slug]/page.tsx
// Referral redirect — sets hr_ref cookie then sends visitor to /welcome
// slug = referring user's Clerk ID
// Server component: cookie write + redirect, no client JS needed

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabase } from "../../../lib/supabaseServer";

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Validate: slug must be a real user in our DB
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("users")
      .select("id")
      .eq("id", slug)
      .maybeSingle();
    if (!data) redirect("/welcome");
  }

  // Set 7-day cookie — survives the Clerk sign-up flow
  const jar = await cookies();
  jar.set("hr_ref", slug, {
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    httpOnly: true,
    sameSite: "lax",
  });

  redirect("/welcome");
}
