-- Add agent_id FK to borrowers table for agent portal support
ALTER TABLE borrowers ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id);
CREATE INDEX IF NOT EXISTS borrowers_agent_id_idx ON borrowers(agent_id);
