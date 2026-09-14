// scripts/test-address-identity-integration.ts
//
// Integration-level tests for the address-identity gate wired into
// app/api/property/lookup/route.ts's handleAddress() (2026-09-08). Calls the
// REAL exported POST handler in-process (same technique
// scripts/test-external-adapter.ts already uses for the MCP route), with
// Tavily/OpenAI network calls intercepted by a controlled mock -- so these
// tests are deterministic and free of real external cost, while exercising
// the actual shipped route code, not a copy of it.
//
// Covers Phase 6 test cases I (repeated address resolved only via
// broad_search -> still never persisted, not a dedup concern), J (valid
// unknown property found ONLY via broad_search -> refused, never
// persisted -- see the route's own 2026-09-14 comment: this branch cannot
// confirm it found the right listing at all, only a plausible one, which
// live incident evidence showed can silently be the WRONG UNIT at a
// multi-unit address even when validatePropertyIdentity() passes), and K
// (failed identity -> NOT_AVAILABLE, zero rows created).
//
// Run with: npx tsx scripts/test-address-identity-integration.ts

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

type TavilySearchHandler = (query: string) => any[];
type TavilyExtractHandler = (url: string) => { raw_content: string | null; images: string[] };

let tavilySearchHandler: TavilySearchHandler | null = null;
let tavilyExtractHandler: TavilyExtractHandler | null = null;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  const bodyStr = init?.body ? String(init.body) : '{}';

  if (url.includes('api.tavily.com/search') && tavilySearchHandler) {
    let query = '';
    try { query = JSON.parse(bodyStr).query ?? ''; } catch { /* noop */ }
    const results = tavilySearchHandler(query);
    return new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('api.tavily.com/extract') && tavilyExtractHandler) {
    let reqUrl = '';
    try { reqUrl = JSON.parse(bodyStr).urls?.[0] ?? ''; } catch { /* noop */ }
    const { raw_content, images } = tavilyExtractHandler(reqUrl);
    return new Response(JSON.stringify({ results: [{ raw_content, images }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('api.openai.com')) {
    // No extra fields needed for these tests -- regex parsing alone supplies
    // everything the identity gate checks. Return an empty object so
    // mergeGpt4o() is a no-op.
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input, init);
}) as typeof fetch;

import { NextRequest } from 'next/server';
import { getSupabase } from '../lib/supabaseServer';
import { POST } from '../app/api/property/lookup/route';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

async function callLookup(address: string) {
  const req = new NextRequest('http://localhost/api/property/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const res = await POST(req);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function padText(s: string): string {
  return s + '\n'.padEnd(210, '.');
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  const noRedfinResults = () => [];

  // ===== J: valid unknown property found ONLY via broad_search -- refused, never persisted =====
  // Behavior changed 2026-09-14 (see app/api/property/lookup/route.ts's own
  // comment on the broad_search branch): this branch's own confidence
  // (0.65) was always scored specifically because it cannot confirm it
  // found the right listing, only a plausible one. Real, live incident:
  // a real multi-unit address ("41 Shepherds Knls, Pebble Beach") resolved
  // via this exact branch to a DIFFERENT unit than the one asked about,
  // even though validatePropertyIdentity() passed (it has no unit concept
  // -- see lib/addressIdentity.ts). This single-family test fixture is
  // itself unambiguous and would have matched correctly, but the route no
  // longer has a way to distinguish "unambiguous single-family broad-search
  // match" from "ambiguous multi-unit broad-search match" -- so it now
  // refuses BOTH, a deliberate precision-over-coverage tradeoff, not a bug.
  const matchAddr = `4210 Test Harness Ln, Rivertown, TX 75001`;
  {
    tavilySearchHandler = (query: string) => {
      if (query.includes('site:redfin.com')) return noRedfinResults();
      // broadSearchFallback's own query -- return a MATCHING Zillow result.
      return [{ url: 'https://www.zillow.com/homedetails/4210-Test-Harness-Ln-Rivertown-TX-75001/1000001_zpid/' }];
    };
    tavilyExtractHandler = () => ({
      raw_content: padText('4210 Test Harness Ln, Rivertown, TX 75001\n$350,000\n3 bed 2 bath 1800 sqft'),
      images: [],
    });

    const before = await sb.from('properties').select('id').ilike('address_full', '%4210 Test Harness Ln%');
    const beforeCount = before.data?.length ?? 0;

    const r = await callLookup(matchAddr);
    // No persistence write to wait for any more -- this branch never calls
    // cachePropertyResult() now, but the pause is kept so a regression that
    // reintroduced the write would still have time to land before we check.
    await new Promise((res) => setTimeout(res, 800));

    const after = await sb.from('properties').select('id').ilike('address_full', '%4210 Test Harness Ln%');
    const afterCount = after.data?.length ?? 0;

    const ok = r.json?.ok === false && beforeCount === 0 && afterCount === 0;
    record('J. valid unknown property found only via broad_search -- refused, never persisted', ok ? 'PASS' : 'FAIL', JSON.stringify({ status: r.status, ok: r.json?.ok, beforeCount, afterCount }));
  }

  // ===== I: repeated address, still only resolvable via broad_search -- still never persisted =====
  // Not a dedup concern any more (nothing is ever written the first time),
  // but worth keeping as its own case: confirms the refusal is stable and
  // idempotent across repeat calls, not a one-time fluke.
  {
    const r2 = await callLookup(matchAddr);
    await new Promise((res) => setTimeout(res, 800));
    const after = await sb.from('properties').select('id').ilike('address_full', '%4210 Test Harness Ln%');
    const rowCount = after.data?.length ?? 0;
    record('I. repeated broad_search-only address -- still refused, still zero rows', r2.json?.ok === false && rowCount === 0 ? 'PASS' : 'FAIL', JSON.stringify({ rowCount, ids: after.data }));
  }

  // ===== K: failed identity -- valid-looking but wrong candidate =====
  const mismatchAddr = `77 Alpine Trail, Boulderville, CO 80301`;
  {
    tavilySearchHandler = (query: string) => {
      if (query.includes('site:redfin.com')) return noRedfinResults();
      // broadSearchFallback's own query -- return a REAL redfin-domain result,
      // but for a COMPLETELY DIFFERENT property (the exact vulnerability).
      return [{ url: 'https://www.redfin.com/CO/OtherTown/999-Wrong-St-88888/home/2000002' }];
    };
    tavilyExtractHandler = () => ({
      raw_content: padText('999 Wrong St, OtherTown, CO 88888\n$500,000\n3 bed 2 bath 1500 sqft'),
      images: [],
    });

    const before = await sb.from('properties').select('id').ilike('address_full', '%77 Alpine Trail%');
    const beforeCount = before.data?.length ?? 0;

    const r = await callLookup(mismatchAddr);
    await new Promise((res) => setTimeout(res, 800));

    const afterAlpine = await sb.from('properties').select('id').ilike('address_full', '%77 Alpine Trail%');
    const afterWrong = await sb.from('properties').select('id').ilike('address_full', '%999 Wrong St%').or('address_full.ilike.%Wrong St%');

    const noPersistence = (afterAlpine.data?.length ?? 0) === 0 && (afterWrong.data?.length ?? 0) === 0;
    const ok = r.json?.ok === false && beforeCount === 0 && noPersistence;
    record('K. failed identity -- NOT_AVAILABLE, zero property rows created', ok ? 'PASS' : 'FAIL', JSON.stringify({ status: r.status, ok: r.json?.ok, error: r.json?.error, noPersistence }));
  }

  // ===== L: multi-unit building -- direct Redfin URL match on the RIGHT street
  // but an UNCONFIRMED specific unit -- refused, never persisted =====
  // Regression test for the real, live incident this whole session's fix
  // responds to: "41 Shepherds Knls, Pebble Beach" resolved via a DIRECT
  // Redfin URL (found by findRedfinUrl()'s own targeted address search,
  // confidence 0.90 -- the "trusted" branch) to Redfin's own "unit-41"
  // listing, a different, unrelated unit than the one the caller actually
  // meant. validatePropertyIdentity() passes (street/city/state/zip all
  // genuinely agree -- it has no unit concept at all), so
  // candidateIsUnconfirmedUnit() (lib/addressIdentity.ts) is the only thing
  // that can catch this: the resolved URL's own "/unit-41/" path signals a
  // specific sub-unit the caller's address string never mentioned.
  // A synthetic, clearly-fake URL/home id (never a real listing) -- keeps
  // this test deterministic and isolated from real network reachability,
  // same as J/K's fixtures above, while preserving the one thing that
  // matters: a "/unit-N/" path segment on the right street.
  const unitAddr = `9100 Fictional Knls, Pebble Beach, CA 93953`;
  {
    tavilySearchHandler = (query: string) => {
      if (query.includes('site:redfin.com')) {
        return [{ url: 'https://www.redfin.com/CA/Pebble-Beach/9100-Fictional-Knls-93953/unit-41/home/9999999' }];
      }
      return noRedfinResults();
    };
    tavilyExtractHandler = () => ({
      raw_content: padText('9100 Fictional Knls, Pebble Beach, CA 93953\n$1,150,000\n2 bed 2 bath 1528 sqft'),
      images: [],
    });

    const before = await sb.from('properties').select('id').ilike('address_full', '%9100 Fictional Knls%');
    const beforeCount = before.data?.length ?? 0;

    const r = await callLookup(unitAddr);
    await new Promise((res) => setTimeout(res, 800));

    const after = await sb.from('properties').select('id').ilike('address_full', '%9100 Fictional Knls%');
    const afterCount = after.data?.length ?? 0;

    const ok = r.json?.ok === false && beforeCount === 0 && afterCount === 0;
    record('L. multi-unit building, direct Redfin URL match but unconfirmed unit -- refused, never persisted', ok ? 'PASS' : 'FAIL', JSON.stringify({ status: r.status, ok: r.json?.ok, beforeCount, afterCount }));
  }

  console.log('\n=== CLEANUP ===');
  const del1 = await sb.from('properties').select('id').ilike('address_full', '%4210 Test Harness Ln%');
  const ids1 = (del1.data ?? []).map((r: any) => r.id);
  if (ids1.length) {
    await sb.from('property_snapshots').delete().in('property_id', ids1);
    await sb.from('properties').delete().in('id', ids1);
  }
  const del2 = await sb.from('properties').select('id').ilike('address_full', '%Wrong St%');
  const ids2 = (del2.data ?? []).map((r: any) => r.id);
  if (ids2.length) {
    await sb.from('property_snapshots').delete().in('property_id', ids2);
    await sb.from('properties').delete().in('id', ids2);
  }
  const del3 = await sb.from('properties').select('id').ilike('address_full', '%9100 Fictional Knls%');
  const ids3 = (del3.data ?? []).map((r: any) => r.id);
  if (ids3.length) {
    await sb.from('property_snapshots').delete().in('property_id', ids3);
    await sb.from('properties').delete().in('id', ids3);
  }
  console.log('deleted test property ids:', [...ids1, ...ids2, ...ids3]);

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
