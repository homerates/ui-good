// lib/anonGate.ts
// Anonymous IP-based rate limiting for unauthenticated users.
// 3 free uses per IP per day for chat and investor-intel.

import { getSupabase } from './supabaseServer';

const LIMIT = 3;

export async function checkAnonGate(
  ip: string,
  type: 'chat' | 'investor'
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const sb = getSupabase();
    if (!sb) return { allowed: true, remaining: LIMIT }; // fail open

    const table = type === 'chat' ? 'anon_chat_usage' : 'anon_investor_usage';
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const { data } = await sb
      .from(table)
      .select('count')
      .eq('ip', ip)
      .eq('date', today)
      .maybeSingle();

    const current = (data as any)?.count ?? 0;

    if (current >= LIMIT) {
      return { allowed: false, remaining: 0 };
    }

    // Upsert: insert row or update count
    await sb.from(table).upsert(
      { ip, date: today, count: current + 1 },
      { onConflict: 'ip,date' }
    );

    return { allowed: true, remaining: LIMIT - (current + 1) };
  } catch {
    return { allowed: true, remaining: LIMIT }; // fail open — never block on DB error
  }
}
