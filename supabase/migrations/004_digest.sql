-- Migration 004: homeowner digest — property address on borrowers + snapshot history

-- 1. Add property_address to borrowers
ALTER TABLE borrowers
  ADD COLUMN IF NOT EXISTS property_address text,
  ADD COLUMN IF NOT EXISTS digest_enabled   boolean NOT NULL DEFAULT true;

-- 2. Monthly snapshot table — one row per borrower per month
CREATE TABLE IF NOT EXISTS homeowner_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id         uuid NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
  snapshot_date       date NOT NULL DEFAULT current_date,
  estimated_value     integer,
  estimated_value_low integer,
  estimated_value_high integer,
  estimated_balance   integer,
  estimated_equity    integer,
  purchase_rate       numeric(5,2),
  live_rate           numeric(5,2),
  last_sale_price     integer,
  last_sale_date      text,
  listing_status      text,
  -- refi window flag: true when live_rate < purchase_rate - 0.5
  refi_window         boolean GENERATED ALWAYS AS (
    live_rate IS NOT NULL AND purchase_rate IS NOT NULL AND live_rate < purchase_rate - 0.5
  ) STORED,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (borrower_id, snapshot_date)
);

-- 3. Digest send log — track every email sent
CREATE TABLE IF NOT EXISTS digest_sends (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id  uuid NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
  lo_user_id   text NOT NULL,
  snapshot_id  uuid REFERENCES homeowner_snapshots(id),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  resend_id    text,
  status       text NOT NULL DEFAULT 'sent'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_snapshots_borrower ON homeowner_snapshots(borrower_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_digest_sends_lo    ON digest_sends(lo_user_id, sent_at DESC);
