// app/s/[slug]/page.tsx
// Short-link redirect for HomeRates share URLs.
// Given a slug, look up the long URL and redirect (302) to it.

import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Reuse the same env logic as other server-side Supabase clients
const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        })
        : null;

// NOTE: we deliberately type props as any so we don't fight Next's generated PageProps,
// which currently treats params as a Promise<any> in .next/types.
export default async function ShortRedirectPage(props: any) {
    const params = (await props.params) as { slug?: string } | undefined;
    const slug = params?.slug ?? "";

    if (!slug || !supabase) {
        redirect("/");
    }

    // Backward/forward compatible:
    // - newer rows: target_url
    // - older rows (if any): url
    const { data, error } = await supabase
        .from("short_links")
        .select("target_url, url")
        .eq("slug", slug)
        .maybeSingle();

    if (error || !data) {
        redirect("/");
    }

    const target = String((data as any).target_url || (data as any).url || "");

    if (!target) {
        redirect("/");
    }

    redirect(target);
}
