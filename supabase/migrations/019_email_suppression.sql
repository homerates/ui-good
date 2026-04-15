-- Migration 019: email suppression list (CAN-SPAM compliance)
-- Stores emails that have unsubscribed from outbound LO marketing emails.
-- All outbound sends must check this table before sending.

CREATE TABLE IF NOT EXISTS public.email_suppression (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL,
  source     text        NOT NULL DEFAULT 'unsubscribe', -- 'unsubscribe' | 'bounce' | 'complaint'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique index — one row per email
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppression_email
  ON public.email_suppression (lower(email));

-- Fast lookup before every send
CREATE INDEX IF NOT EXISTS idx_email_suppression_created
  ON public.email_suppression (created_at DESC);
