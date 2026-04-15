-- Migration 020: newsletter_subscribers
-- Stores emails from article page newsletter capture CTAs.
-- Separate from email_suppression — this is opt-in, not opt-out.

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL UNIQUE,
  source      text        NOT NULL DEFAULT 'article', -- 'article', 'market-news', 'knowledge-hub'
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: only service role can read/write (no public access)
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
