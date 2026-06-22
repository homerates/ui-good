-- 054_agent_pilots.sql
-- Extend company_pilots to support Agent pilot program alongside LO pilot program.
-- Uses pilot_type discriminator so the same brokerage can appear in both programs.

-- Add pilot_type column (default 'lo' preserves all existing rows)
alter table company_pilots
  add column if not exists pilot_type text not null default 'lo';

-- Replace unique-slug constraint with composite (slug, pilot_type)
-- so e.g. slug='compass' can exist as both type='lo' and type='agent'
alter table company_pilots
  drop constraint if exists company_pilots_slug_key;

alter table company_pilots
  add constraint if not exists company_pilots_slug_type_key unique (slug, pilot_type);

create index if not exists company_pilots_type_idx on company_pilots(pilot_type);
