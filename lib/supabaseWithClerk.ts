'use client';
// lib/supabaseWithClerk.ts
// Client-side Supabase hook authenticated via Clerk JWT.
// Requires a Clerk JWT Template named "supabase" with claim:
//   { "role": "authenticated" }
// And Supabase configured with Clerk's JWKS URL as a third-party provider.
//
// Setup steps:
//   1. Clerk Dashboard → JWT Templates → Add "supabase" template
//      Claims: { "role": "authenticated" }
//   2. Supabase Dashboard → Authentication → Third-party Auth (or JWT Secret)
//      Set JWT signing key to match Clerk's RS256 public key / JWKS URL

import { useAuth } from '@clerk/nextjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useMemo } from 'react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Returns a Supabase client that automatically injects the current
 * Clerk session token as a Bearer JWT on every request.
 * auth.uid() in RLS policies will resolve to the Clerk user ID.
 */
export function useSupabaseWithClerk(): SupabaseClient {
    const { getToken } = useAuth();

    return useMemo(() => {
        return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: {
                fetch: async (url: RequestInfo | URL, options: RequestInit = {}) => {
                    const token = await getToken({ template: 'supabase' }).catch(() => null);
                    const headers = new Headers(options.headers);
                    if (token) headers.set('Authorization', `Bearer ${token}`);
                    return fetch(url, { ...options, headers });
                },
            },
        });
    }, [getToken]);
}
