-- Daily FRED mortgage rate snapshots — used to detect rate moves and trigger rate-alert digests
CREATE TABLE IF NOT EXISTS public.rate_snapshots (
    snapshot_date date PRIMARY KEY,
    rate          numeric(6,3) NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
