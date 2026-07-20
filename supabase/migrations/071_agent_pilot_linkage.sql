-- 071_agent_pilot_linkage.sql
-- Fixes: agent-pilot activations were never linked back to company_pilots.
-- company_pilot_id was added to loan_officers only (052_company_pilots.sql),
-- before the agent pilot program existed (054_agent_pilots.sql). Agents who
-- activated via /agent-pilot/[slug] got their credits correctly (awardCredits
-- doesn't depend on this column) but were never linked to the pilot record,
-- so admin activation counts for agent pilots were always 0.

alter table agents
  add column if not exists company_pilot_id uuid references company_pilots(id);

create index if not exists agents_pilot_idx on agents(company_pilot_id);
