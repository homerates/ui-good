-- Migration 018: add user_id to borrowers
-- Links a borrower row to their Clerk account once they sign up via invite link.
-- Allows LO to gift credits and detect signed-up status.

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS user_id text;

-- Index for quick lookup by Clerk user_id
CREATE INDEX IF NOT EXISTS idx_borrowers_user_id ON public.borrowers (user_id);
