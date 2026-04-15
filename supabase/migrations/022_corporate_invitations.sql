-- 022_corporate_invitations.sql
-- Enterprise onboarding: admin-sent corporate invitations + pro org nominations
-- Also adds admin_invited + compliance fields to brokerages.

-- ── 1. Corporate invitations (admin → org) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.corporate_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name        TEXT NOT NULL,
  org_type        TEXT NOT NULL DEFAULT 'brokerage',
  contact_name    TEXT,
  contact_email   TEXT NOT NULL,
  invited_by      TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  token           TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  notes           TEXT,
  brokerage_id    UUID REFERENCES public.brokerages(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_corp_inv_token
  ON public.corporate_invitations (token);
CREATE INDEX IF NOT EXISTS idx_corp_inv_email
  ON public.corporate_invitations (lower(contact_email));
ALTER TABLE public.corporate_invitations ENABLE ROW LEVEL SECURITY;

-- ── 2. Org nominations (pro → nominates their employer) ──────────────────────
CREATE TABLE IF NOT EXISTS public.org_nominations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nominated_by    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  org_name        TEXT NOT NULL,
  org_type        TEXT NOT NULL DEFAULT 'brokerage',
  contact_email   TEXT,
  website         TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | contacted | converted | dismissed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.org_nominations ENABLE ROW LEVEL SECURITY;

-- ── 3. Enrich brokerages with admin-invite + compliance flag ─────────────────
ALTER TABLE public.brokerages
  ADD COLUMN IF NOT EXISTS admin_invited        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS compliance_accepted_at TIMESTAMPTZ;
