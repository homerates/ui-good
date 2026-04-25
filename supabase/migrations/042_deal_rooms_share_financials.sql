-- Add buyer-controlled financial sharing permission to deal_rooms
ALTER TABLE deal_rooms
  ADD COLUMN IF NOT EXISTS share_financials BOOLEAN NOT NULL DEFAULT FALSE;
