-- 043: track last time each member read deal room messages
ALTER TABLE deal_room_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
