-- Allow agents to generate borrower reports
ALTER TABLE public.borrower_reports ALTER COLUMN lo_id DROP NOT NULL;
ALTER TABLE public.borrower_reports ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS borrower_reports_agent_idx ON public.borrower_reports(agent_id);
