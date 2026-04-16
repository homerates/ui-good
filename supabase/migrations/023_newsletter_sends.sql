-- Migration 023: newsletter_sends
-- Tracks each weekly market update batch send.

CREATE TABLE IF NOT EXISTS public.newsletter_sends (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  subject      text        NOT NULL,
  recipient_count int      NOT NULL DEFAULT 0,
  skipped_count   int      NOT NULL DEFAULT 0,  -- suppressed / already sent this week
  error_count     int      NOT NULL DEFAULT 0,
  resend_batch_id text,
  notes        text
);
