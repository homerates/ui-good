-- 007_messaging.sql
-- Private async messaging between borrowers and professionals
-- Two tables: conversation_threads (one per borrower↔pro pair) + messages

-- Conversation threads (one per scenario_response)
CREATE TABLE IF NOT EXISTS public.conversation_threads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id         uuid REFERENCES public.scenario_briefs(id) ON DELETE SET NULL,
  borrower_id         text NOT NULL,         -- Clerk userId
  professional_id     text NOT NULL,         -- Clerk userId
  professional_type   text NOT NULL,         -- 'lo' | 'agent'
  status              text NOT NULL DEFAULT 'active',  -- 'active' | 'contact_shared' | 'closed'
  unread_borrower     integer NOT NULL DEFAULT 0,
  unread_professional integer NOT NULL DEFAULT 0,
  last_message_at     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique thread per borrower↔pro pair (one conversation per relationship)
CREATE UNIQUE INDEX IF NOT EXISTS conversation_threads_pair_idx
  ON public.conversation_threads (borrower_id, professional_id);

-- Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid NOT NULL REFERENCES public.conversation_threads(id) ON DELETE CASCADE,
  sender_role  text NOT NULL,   -- 'borrower' | 'professional'
  content      text NOT NULL,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_thread_id_idx ON public.messages (thread_id, created_at);

-- Contact share log (borrower triggers, records mutual consent)
CREATE TABLE IF NOT EXISTS public.contact_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES public.conversation_threads(id) ON DELETE CASCADE,
  borrower_email  text,
  borrower_phone  text,
  pro_email       text,
  pro_phone       text,
  shared_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only see threads they are a party to
ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_shares        ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by API routes via service key)
-- All reads/writes go through server-side API with auth check — no client direct access needed
