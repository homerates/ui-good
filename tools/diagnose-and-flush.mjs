// tools/diagnose-and-flush.mjs
// Usage: node tools/diagnose-and-flush.mjs [--flush]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Parse env without quote issues
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) { console.error("Missing URL or key"); process.exit(1); }
console.log("URL:", url.substring(0, 40));
console.log("KEY: present", key.length, "chars\n");

const sb = createClient(url, key);
const doFlush = process.argv.includes("--flush");

async function diagnose() {
  // Latest scenario_briefs
  const { data: scenarios, error: se } = await sb
    .from("scenario_briefs")
    .select("id, loan_type, has_card_data, card_price, card_rate, card_monthly, card_dp_pct, status, borrower_id, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("=== Latest scenario_briefs ===");
  if (se) console.error("Error:", se.message);
  else scenarios?.forEach(s => console.log(JSON.stringify({
    id: s.id.slice(0, 8),
    loan_type: s.loan_type,
    has_card_data: s.has_card_data,
    card_price: s.card_price,
    card_rate: s.card_rate,
    card_monthly: s.card_monthly,
    card_dp_pct: s.card_dp_pct,
    status: s.status,
    borrower: s.borrower_id.slice(0, 8),
    created_at: s.created_at?.slice(0, 16),
  })));

  // Latest conversation_threads
  const { data: threads, error: te } = await sb
    .from("conversation_threads")
    .select("id, scenario_id, borrower_id, professional_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("\n=== Latest conversation_threads ===");
  if (te) console.error("Error:", te.message);
  else threads?.forEach(t => console.log(JSON.stringify({
    id: t.id.slice(0, 8),
    scenario_id: t.scenario_id?.slice(0, 8) ?? null,
    borrower: t.borrower_id.slice(0, 8),
    pro: t.professional_id.slice(0, 8),
    status: t.status,
    created_at: t.created_at?.slice(0, 16),
  })));

  // Latest messages
  const { data: msgs, error: me } = await sb
    .from("messages")
    .select("id, thread_id, sender_role, content, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("\n=== Latest messages ===");
  if (me) console.error("Error:", me.message);
  else msgs?.forEach(m => console.log(JSON.stringify({
    id: m.id.slice(0, 8),
    thread: m.thread_id.slice(0, 8),
    role: m.sender_role,
    type: m.metadata?.type ?? "chat",
    content: m.content?.slice(0, 60),
    created_at: m.created_at?.slice(0, 16),
  })));

  // Check if any scenario has card data + matching thread
  console.log("\n=== Cross-check: scenarios WITH card data ===");
  const { data: withCard } = await sb
    .from("scenario_briefs")
    .select("id, loan_type, card_price, card_rate, borrower_id, status")
    .not("card_price", "is", null)
    .not("card_rate", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);

  for (const s of withCard ?? []) {
    const { data: thread } = await sb
      .from("conversation_threads")
      .select("id, scenario_id")
      .eq("borrower_id", s.borrower_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log(JSON.stringify({
      scenario: s.id.slice(0, 8),
      price: s.card_price,
      rate: s.card_rate,
      loan_type: s.loan_type,
      status: s.status,
      thread_id: thread?.id?.slice(0, 8) ?? null,
      thread_scenario_id: thread?.scenario_id?.slice(0, 8) ?? null,
      scenario_id_matches: thread?.scenario_id === s.id,
    }));
  }
}

async function flush() {
  console.log("\n=== FLUSHING DATA ===");

  // Delete messages first (FK dependency)
  const { error: me, count: mc } = await sb.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("messages deleted:", mc, me?.message ?? "OK");

  // Delete conversation_threads
  const { error: te, count: tc } = await sb.from("conversation_threads").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("conversation_threads deleted:", tc, te?.message ?? "OK");

  // Delete scenario_responses
  const { error: sre, count: src } = await sb.from("scenario_responses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("scenario_responses deleted:", src, sre?.message ?? "OK");

  // Delete scenario_briefs
  const { error: sce, count: scc } = await sb.from("scenario_briefs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("scenario_briefs deleted:", scc, sce?.message ?? "OK");

  console.log("\nFlush complete. All test data cleared.");
}

await diagnose();
if (doFlush) await flush();
else console.log("\n(Pass --flush to delete all test data)");
