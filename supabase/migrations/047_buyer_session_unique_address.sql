-- 047_buyer_session_unique_address.sql
-- Enforce DB-level uniqueness on (user_id, property_address).
-- The API already does an application-level upsert by address; this makes it
-- a hard constraint so no duplicate sessions can ever exist for the same user + property.
-- Only applies to rows WITH an address (address-less scenario sessions are still allowed).

CREATE UNIQUE INDEX IF NOT EXISTS buyer_evaluation_sessions_user_address_unique
  ON buyer_evaluation_sessions (user_id, property_address)
  WHERE property_address IS NOT NULL;
