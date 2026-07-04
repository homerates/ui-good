-- Migration 063: add vintage_used column to address_geocode_cache
-- Records which Census Geocoder vintage produced the match.
-- Existing rows default to 'Current_Current' (the only vintage ever used prior to this migration).
ALTER TABLE address_geocode_cache
  ADD COLUMN IF NOT EXISTS vintage_used VARCHAR(40) DEFAULT 'Current_Current';
