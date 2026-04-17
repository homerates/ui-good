-- migration 028: system_flags
-- Generic key-value store for one-time system events (e.g. founding milestone blasts).
-- PRIMARY KEY on key ensures atomic dedup via INSERT (unique violation = already fired).

CREATE TABLE IF NOT EXISTS system_flags (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
