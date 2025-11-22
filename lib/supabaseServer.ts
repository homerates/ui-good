// ==== REPLACE / CREATE FILE: lib/supabaseServer.ts ====
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * getSupabase()
 *
 * Safe Supabase client loader:
 * - Never runs at build-time in a way that breaks deploys
 * - Returns null instead of throwing if env vars are missing
 * - Caches the client so it's not recreated on every call
 */
export function getSupabase(): SupabaseClient | null {
    // Read env vars at runtime only (NOT at module import)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

    // Missing env values? Fail soft.
    if (!url || !key) {
        console.warn("Supabase not configured: missing URL or KEY");
        return null;
    }

    // Create client once and cache it
    if (!cachedClient) {
        try {
            cachedClient = createClient(url, key, {
                auth: {
                    persistSession: false,
                },
            });
        } catch (err) {
            console.error("Supabase init error:", err);
            return null;
        }
    }

    return cachedClient;
}
