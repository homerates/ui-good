-- 060: Add invite token + invited_at to marketplace_lenders
-- Used for tokenized lender portal (/lender-portal/[token]) — no Clerk auth needed.

ALTER TABLE marketplace_lenders
  ADD COLUMN IF NOT EXISTS invite_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS invited_at   timestamptz;

CREATE INDEX IF NOT EXISTS marketplace_lenders_invite_token_idx
  ON marketplace_lenders (invite_token)
  WHERE invite_token IS NOT NULL;
