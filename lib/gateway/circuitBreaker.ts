// lib/gateway/circuitBreaker.ts
//
// Two distinct controls, both backed by gateway_config (migration 083), kept
// semantically separate even though they share a table -- per the locked
// architecture, collapsing them would lose real meaning:
//
//   circuit_state -- operational/economic protection. Phase D only
//     establishes the read/mechanism; no auto-opening heuristic or spend-
//     monitoring logic exists yet (explicitly out of scope this phase --
//     something else, later, decides WHEN to open it; this file only
//     answers "is it open right now").
//
//   kill_switch -- explicit administrative global disable, independent of
//     any economic signal. A human decision, not a heuristic.
//
// Both fail SAFE = fail CLOSED, consistent with the Gateway's whole posture:
// if gateway_config cannot be read reliably, this treats the circuit as OPEN
// (blocking) and the kill switch as ENABLED (blocking) -- assume the worst,
// not the best, when the control state itself is unknown. The alternative
// (assume closed/disabled = allow traffic) would mean a Supabase hiccup
// silently disables the one mechanism meant to protect against exactly that
// kind of failure.

import { getSupabase } from '../supabaseServer';

async function readConfigFlag(key: string, flagField: string): Promise<boolean | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from('gateway_config').select('value').eq('key', key).maybeSingle();
    if (error || !data) return null;
    const value = data.value as Record<string, unknown>;
    return value?.[flagField] === true;
  } catch {
    return null;
  }
}

export async function isCircuitOpen(): Promise<boolean> {
  const result = await readConfigFlag('circuit_state', 'open');
  return result ?? true; // fail closed: unknown state -> treat as open/blocking
}

export async function isKillSwitchEnabled(): Promise<boolean> {
  const result = await readConfigFlag('kill_switch', 'enabled');
  return result ?? true; // fail closed: unknown state -> treat as enabled/blocking
}
