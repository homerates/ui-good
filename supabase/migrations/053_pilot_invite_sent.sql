-- Migration 053: track when a pilot invite email was sent
alter table company_pilots add column if not exists invite_sent_at timestamptz;
