-- Allow agent-owned borrowers: loan_officer_id is null when agent_id is set
ALTER TABLE borrowers ALTER COLUMN loan_officer_id DROP NOT NULL;
