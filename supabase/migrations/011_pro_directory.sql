-- ============================================================
-- 011_pro_directory.sql
-- Public professional directory — seeded from NMLS and CA DRE
-- public records. Records exist before anyone signs up.
-- A claimed_by field links to a Clerk user_id when a pro
-- creates an account and claims their listing.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pro_directory (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Source identification ──────────────────────────────────
  source          text        NOT NULL,   -- 'nmls' | 'ca_dre'
  source_id       text        NOT NULL,   -- NMLS ID or DRE license number (as string)
  pro_type        text        NOT NULL,   -- 'lo' | 'lo_company' | 'agent' | 'agent_broker'

  -- ── Public data (from seed) ───────────────────────────────
  name            text        NOT NULL,   -- full name or company name
  company_name    text,                   -- employer / parent brokerage (individuals only)
  city            text,
  state           text        NOT NULL DEFAULT 'CA',
  zip             text,
  license_type    text,                   -- e.g. "Mortgage Loan Originator", "Real Estate Salesperson"
  license_status  text,                   -- "Active", "Inactive", "Expired"

  -- ── Claim state ───────────────────────────────────────────
  claimed_by      text,                   -- Clerk user_id (null = unclaimed)
  claimed_at      timestamptz,

  -- ── Profile enrichment (populated after claiming) ─────────
  bio             text,
  phone           text,
  website         text,
  photo_url       text,

  -- ── Sync metadata ─────────────────────────────────────────
  seeded_at       timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  UNIQUE(source, source_id)
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pro_dir_type_state
  ON public.pro_directory (pro_type, state);

CREATE INDEX IF NOT EXISTS idx_pro_dir_city
  ON public.pro_directory (state, city);

CREATE INDEX IF NOT EXISTS idx_pro_dir_claimed
  ON public.pro_directory (claimed_by)
  WHERE claimed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pro_dir_source_id
  ON public.pro_directory (source, source_id);

-- Full-text search index on name + company
CREATE INDEX IF NOT EXISTS idx_pro_dir_name_fts
  ON public.pro_directory USING gin(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(company_name, '')));

-- ── updated_at trigger ────────────────────────────────────────
CREATE TRIGGER pro_directory_updated_at
  BEFORE UPDATE ON public.pro_directory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.pro_directory ENABLE ROW LEVEL SECURITY;

-- Anyone can read the directory (it's public record data)
CREATE POLICY "pro_dir: public read"
  ON public.pro_directory FOR SELECT
  USING (true);

-- Only the claiming user can update their own record's enrichment fields
CREATE POLICY "pro_dir: owner update"
  ON public.pro_directory FOR UPDATE
  USING (claimed_by = auth.uid()::text);
