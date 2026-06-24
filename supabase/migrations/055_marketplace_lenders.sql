-- 055_marketplace_lenders.sql
-- Anonymous rate marketplace: lenders list rates, borrowers see no lender identity
-- until explicit opt-in through the existing deal room / contact-sharing flow.

-- ── Lender listings ────────────────────────────────────────────────────────────

create table if not exists marketplace_lenders (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Identity — never exposed to borrowers pre-opt-in
  lender_name             text not null,
  nmls_number             text,
  contact_email           text not null,
  contact_name            text,

  -- Pricing: margin they charge above (FRED par + LLPA rateEquivalent)
  -- e.g. 0.625 means borrowerRate = fredPar + llpaEquivalent + 0.625%
  margin_over_par         numeric(5,3) not null,

  -- Eligibility overlays — filter applied before engine runs per-scenario
  loan_types              text[] not null default array['conventional'],
  eligible_states         text[] not null default array['CA'],
  min_loan_amount         integer not null default 100000,
  max_loan_amount         integer not null default 3000000,
  min_credit_score        integer not null default 620,
  max_ltv                 numeric(5,2) not null default 97.0,

  -- Lock period pricing relative to 30-day base (in rate %)
  lock_15_adj             numeric(5,3) not null default -0.125,
  lock_45_adj             numeric(5,3) not null default  0.125,
  lock_60_adj             numeric(5,3) not null default  0.250,

  -- Lifecycle
  status                  text not null default 'pending'
                          check (status in ('pending','active','suspended','cancelled')),

  -- Billing
  stripe_customer_id      text,
  stripe_subscription_id  text,

  -- Running counters (updated by trigger or API on opt-in events)
  total_opt_ins           integer not null default 0,
  total_views             integer not null default 0
);

alter table marketplace_lenders enable row level security;

-- Only admins can read or write lender identity
create policy "Admin full access to marketplace_lenders"
  on marketplace_lenders for all
  using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );

create index if not exists marketplace_lenders_status_idx
  on marketplace_lenders(status);

-- ── Opt-in events ──────────────────────────────────────────────────────────────
-- Created when a borrower confirms contact share with a specific lender.
-- This is the billing trigger event.

create table if not exists marketplace_opt_ins (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  lender_id         uuid not null references marketplace_lenders(id),

  -- Borrower (nullable — anonymous browsing allowed pre-opt-in)
  borrower_user_id  uuid references auth.users(id),

  -- Scenario snapshot: what was shared with the lender at opt-in time
  -- Contains: ltv, loan_amount, credit_score_band, loan_type, state, lock_days
  -- Never contains: name, email, address, behavioral history
  scenario_snapshot jsonb not null,

  -- The deal room created to facilitate their discovery exchange
  deal_room_id      uuid references deal_rooms(id),

  -- Billing
  fee_charged       boolean not null default false
);

alter table marketplace_opt_ins enable row level security;

create policy "Admin full access to marketplace_opt_ins"
  on marketplace_opt_ins for all
  using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );

create index if not exists marketplace_opt_ins_lender_idx
  on marketplace_opt_ins(lender_id);

create index if not exists marketplace_opt_ins_borrower_idx
  on marketplace_opt_ins(borrower_user_id);

-- ── View counter RPC (called fire-and-forget from the API) ────────────────────

create or replace function increment_marketplace_views(lender_ids uuid[])
returns void language sql security definer as $$
  update marketplace_lenders
  set    total_views = total_views + 1,
         updated_at  = now()
  where  id = any(lender_ids);
$$;
