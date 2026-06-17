-- 052_company_pilots.sql
-- Company-level pilot links for CEO/owner direct outreach.
-- Each row = one mortgage company pilot (e.g. NEXA Mortgage).
-- LOs who activate via /pilot/[slug] are linked here and get founding access.

create table if not exists company_pilots (
  id                uuid        primary key default gen_random_uuid(),
  company_name      text        not null,
  slug              text        not null unique,          -- URL slug → /pilot/[slug]
  contact_name      text,                                 -- CEO / owner name
  contact_email     text,                                 -- CEO / owner email
  credits_per_lo    integer     not null default 1000,   -- credits awarded per activating LO
  is_active         boolean     not null default true,
  notes             text,
  created_at        timestamptz not null default now()
);

-- Track which pilot each LO came from
alter table loan_officers
  add column if not exists company_pilot_id uuid references company_pilots(id);

create index if not exists company_pilots_slug_idx      on company_pilots(slug);
create index if not exists loan_officers_pilot_idx      on loan_officers(company_pilot_id);
