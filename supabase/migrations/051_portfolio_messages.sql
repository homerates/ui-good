-- Migration 051: add messages column to portfolio_items
-- Stores the full chat message array for a buyer journey so Resume can restore the original thread.

ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS messages JSONB;
