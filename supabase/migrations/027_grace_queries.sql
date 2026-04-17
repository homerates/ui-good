-- Migration 027: grace_queries for credit-gate soft enforcement
-- Free users get 3 grace messages after credits hit 0, then hard block.
-- grace_queries resets monthly because it lives in usage_monthly (keyed by month).

ALTER TABLE public.usage_monthly
  ADD COLUMN IF NOT EXISTS grace_queries integer NOT NULL DEFAULT 0;

-- Atomic increment + read for grace_queries.
-- Returns the NEW value after incrementing.
-- INSERT on first use, UPDATE on subsequent calls.
CREATE OR REPLACE FUNCTION public.increment_grace(p_user_id text, p_month text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_new integer;
BEGIN
  INSERT INTO public.usage_monthly (user_id, month, grace_queries)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET grace_queries = public.usage_monthly.grace_queries + 1
  RETURNING public.usage_monthly.grace_queries INTO v_new;
  RETURN v_new;
END;
$$;
