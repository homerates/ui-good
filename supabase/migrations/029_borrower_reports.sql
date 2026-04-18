-- 029_borrower_reports.sql
-- Shareable branded property intelligence report tokens

CREATE TABLE IF NOT EXISTS public.borrower_reports (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token         text UNIQUE NOT NULL,
    borrower_id   uuid NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
    lo_id         uuid NOT NULL REFERENCES public.loan_officers(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS borrower_reports_token_idx ON public.borrower_reports(token);
CREATE INDEX IF NOT EXISTS borrower_reports_borrower_idx ON public.borrower_reports(borrower_id);
