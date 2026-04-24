-- 041_deal_rooms.sql
-- AI-powered Deal Room: multi-party (buyer + LO + agent) transaction workspace

-- Core room record — one per property transaction
CREATE TABLE IF NOT EXISTS public.deal_rooms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        text NOT NULL,                              -- Clerk user_id of creator (LO or agent)
  property_address  text NOT NULL,
  property_data     jsonb,                                      -- snapshot from property/lookup at room creation
  status            text NOT NULL DEFAULT 'shopping'
                    CHECK (status IN ('shopping','offer','contract','processing','closed','cancelled')),
  offer_price       numeric(12,2),
  target_close_date date,
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL
);

-- Members: buyer / lo / agent — one row per participant
CREATE TABLE IF NOT EXISTS public.deal_room_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_room_id  uuid NOT NULL REFERENCES public.deal_rooms(id) ON DELETE CASCADE,
  user_id       text,                                           -- null until invite accepted
  role          text NOT NULL CHECK (role IN ('buyer','lo','agent')),
  display_name  text,
  email         text,
  invite_token  text UNIQUE DEFAULT gen_random_uuid()::text,
  invited_at    timestamptz DEFAULT now() NOT NULL,
  joined_at     timestamptz,
  UNIQUE (deal_room_id, role)                                  -- one of each role per room
);

-- Milestone timeline — pre-seeded on room creation, updated as deal progresses
CREATE TABLE IF NOT EXISTS public.deal_room_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_room_id  uuid NOT NULL REFERENCES public.deal_rooms(id) ON DELETE CASCADE,
  milestone_key text NOT NULL,                                  -- e.g. 'preapproval', 'offer_submitted'
  label         text NOT NULL,
  stage         text NOT NULL CHECK (stage IN ('shopping','offer','contract','processing','closed')),
  sort_order    int NOT NULL DEFAULT 0,
  target_date   date,
  completed_at  timestamptz,
  completed_by  text,                                           -- Clerk user_id
  ai_note       text,                                           -- AI-generated context note
  UNIQUE (deal_room_id, milestone_key)
);

-- Room-scoped message thread (separate from main messaging system)
CREATE TABLE IF NOT EXISTS public.deal_room_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_room_id  uuid NOT NULL REFERENCES public.deal_rooms(id) ON DELETE CASCADE,
  sender_id     text NOT NULL,                                  -- Clerk user_id
  sender_role   text NOT NULL CHECK (sender_role IN ('buyer','lo','agent','system')),
  sender_name   text,
  content       text NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Saved offer scenarios — any party can model offers, all parties see them
CREATE TABLE IF NOT EXISTS public.deal_room_scenarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_room_id  uuid NOT NULL REFERENCES public.deal_rooms(id) ON DELETE CASCADE,
  created_by    text NOT NULL,
  created_by_role text NOT NULL,
  label         text,                                           -- e.g. "Offer at $750k", "Counter at $780k"
  offer_price   numeric(12,2),
  down_pct      numeric(5,2),
  loan_type     text,
  rate          numeric(5,3),
  piti          numeric(10,2),
  result_json   jsonb,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS deal_rooms_created_by_idx ON public.deal_rooms(created_by);
CREATE INDEX IF NOT EXISTS deal_room_members_user_id_idx ON public.deal_room_members(user_id);
CREATE INDEX IF NOT EXISTS deal_room_members_token_idx ON public.deal_room_members(invite_token);
CREATE INDEX IF NOT EXISTS deal_room_messages_room_idx ON public.deal_room_messages(deal_room_id, created_at);
CREATE INDEX IF NOT EXISTS deal_room_milestones_room_idx ON public.deal_room_milestones(deal_room_id, sort_order);

-- RLS
ALTER TABLE public.deal_rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_room_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_room_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_room_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_room_scenarios ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (API routes use service role key)
CREATE POLICY "service_role_all_deal_rooms"          ON public.deal_rooms          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_deal_room_members"   ON public.deal_room_members   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_deal_room_milestones" ON public.deal_room_milestones FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_deal_room_messages"  ON public.deal_room_messages  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_deal_room_scenarios" ON public.deal_room_scenarios FOR ALL TO service_role USING (true) WITH CHECK (true);
