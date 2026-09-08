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
// Covers Phase 6 test cases I (repeated valid property -> same canonical
// row, no duplicate), J (valid unknown property -> identity passes ->
// persisted), and K (failed identity -> NOT_AVAILABLE, zero rows created).
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

  // ===== J: valid unknown property -- identity passes -> persisted =====
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
    // Give the fire-and-forget cachePropertyResult() write time to land.
    await new Promise((res) => setTimeout(res, 800));

    const after = await sb.from('properties').select('id').ilike('address_full', '%4210 Test Harness Ln%');
    const afterCount = after.data?.length ?? 0;

    const ok = r.json?.ok === true && beforeCount === 0 && afterCount === 1;
    record('J. valid unknown property -- identity matches, persisted exactly once', ok ? 'PASS' : 'FAIL', JSON.stringify({ status: r.status, ok: r.json?.ok, beforeCount, afterCount }));
  }

  // ===== I: repeated valid property -- same canonical row, no duplicate =====
  {
    const r2 = await callLookup(matchAddr);
    await new Promise((res) => setTimeout(res, 800));
    const after = await sb.from('properties').select('id').ilike('address_full', '%4210 Test Harness Ln%');
    const rowCount = after.data?.length ?? 0;
    const sameId = rowCount === 1;
    record('I. repeated valid property -- same canonical row, no duplicate', r2.json?.ok === true && sameId ? 'PASS' : 'FAIL', JSON.stringify({ rowCount, ids: after.data }));
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
  console.log('deleted test property ids:', [...ids1, ...ids2]);

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
