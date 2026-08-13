-- 080_aerial_view_debug_columns.sql
-- Persistent diagnostic columns on aerial_view_cache -- so investigating a
-- stuck/failed address doesn't require re-adding a temporary ?debug=1 query
-- flag to the route each time. Never surfaced to the client; queried directly
-- against Supabase when investigating. video_id lets us see whether repeated
-- checks are tracking the SAME Google render job or spawning separate ones
-- (e.g. from a malformed/duplicated address string producing a different query).

ALTER TABLE public.aerial_view_cache
  ADD COLUMN IF NOT EXISTS video_id     text,
  ADD COLUMN IF NOT EXISTS http_status  integer,
  ADD COLUMN IF NOT EXISTS error_detail text;
