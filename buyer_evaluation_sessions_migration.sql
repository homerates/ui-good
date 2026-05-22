-- ============================================================
-- buyer_evaluation_sessions migration
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ============================================================

create table if not exists buyer_evaluation_sessions (
  id                 uuid        primary key default gen_random_uuid(),

  -- The two fixed anchors
  user_id            text        not null,          -- Clerk userId (URN)
  property_address   text,                          -- normalized full address (nullable — scenario-only evaluations ok)

  -- Human-readable label (auto-derived from scenario or address)
  session_name       text,

  -- Lifecycle
  status             text        not null default 'active',
  -- 'active' | 'archived' | 'closed'

  -- Latest financial scenario snapshot (updated as cards run)
  -- { price, dp_pct, lt, rate, term, piti }
  scenario_json      jsonb,

  -- Track 5 scores — updated independently by different events
  l1_score           smallint,   -- Financial Readiness  (0–100) — from scenario cards
  l1_summary         text,
  l2_score           smallint,   -- Market Conditions    (0–100) — from market analysis
  l2_summary         text,
  l3_score           smallint,   -- Property Value       (0–100) — from check-property / AVM
  l3_summary         text,
  l4_score           smallint,   -- Location Intelligence (0–100) — from property-intel
  l4_summary         text,

  -- Weighted composite: L1×35% + L2×25% + L3×25% + L4×15%
  -- null when < 2 levels are filled
  composite_score    smallint,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One evaluation per (user, known address) — partial index so NULLs don't collide
create unique index if not exists buyer_eval_sessions_user_address_uq
  on buyer_evaluation_sessions (user_id, property_address)
  where property_address is not null;

-- Fast lookups by user
create index if not exists buyer_eval_sessions_user_updated_idx
  on buyer_evaluation_sessions (user_id, status, updated_at desc);

-- RLS enabled — all writes go through service role API routes (Clerk-authenticated)
alter table buyer_evaluation_sessions enable row level security;

-- No row-level policy needed — service role bypasses RLS entirely.
-- Consumer access is enforced by user_id check in every API route.
