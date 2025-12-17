// app/s/[slug]/page.tsx
// Short-link redirect for HomeRates share URLs.
// Given a slug, look up the long URL and redirect (302) to it.

import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Reuse the same env logic as other server-side Supabase clients
const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

// Prefer service role (server-only) if present, otherwise fall back to anon key
const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

// Create a simple server-side client (no session persistence)
const supabase =
    SUPABASE_URL && SUPABASE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: false },
        })
        : null;

// NOTE: we deliberately type props as any so we don't fight Next's generated PageProps,
// which currently treats params as a Promise<any> in .next/types.
export default async function ShortRedirectPage(props: any) {
    // Next 15 sometimes models params as a Promise in its generated types,
    // so we use await here to be compatible either way.
    const params = (await props.params) as { slug?: string } | undefined;
    const slug = params?.slug ?? "";

    if (!slug || !supabase) {
        // If we can't resolve the slug or Supabase isn't configured, go home.
        redirect("/");
    }

    // Look up the long URL from your short_links table
    const { data, error } = await supabase
        .from("short_links")
        .select("url")
        .eq("slug", slug)
        .maybeSingle();

    if (error || !data?.url) {
        // On any failure, just send them to the main app
        redirect("/");
    }

    const target = String(data.url || "").trim();

    if (!target) redirect("/");

    redirect(target);
}
