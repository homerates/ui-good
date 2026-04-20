-- 036_homeowner_rate_alerts.sql
-- Consumer-side rate alerts: homeowner sets a threshold, gets emailed when 30Y drops to it.

CREATE TABLE IF NOT EXISTS public.homeowner_rate_alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text NOT NULL,
  property_id    uuid REFERENCES public.consumer_homeowner_properties(id) ON DELETE CASCADE,
  property_address text,
  email          text NOT NULL,
  threshold_rate numeric(5,3) NOT NULL,
  active         boolean DEFAULT true NOT NULL,
  created_at     timestamptz DEFAULT now(),
  triggered_at   timestamptz,
  UNIQUE(user_id, property_id)
);

CREATE INDEX IF NOT EXISTS homeowner_rate_alerts_active_idx
  ON public.homeowner_rate_alerts(active, threshold_rate)
  WHERE active = true;
