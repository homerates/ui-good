CREATE TABLE IF NOT EXISTS chats (
  id               text NOT NULL,
  clerk_user_id    text NOT NULL,
  project_id       uuid REFERENCES projects(id) ON DELETE SET NULL,
  title            text,
  messages         jsonb NOT NULL DEFAULT '[]',
  memory_thread_id uuid REFERENCES memory_threads(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, clerk_user_id)
);
CREATE INDEX IF NOT EXISTS chats_user_idx ON chats(clerk_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS chats_project_idx ON chats(clerk_user_id, project_id);

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY chats_owner_only ON chats
  USING (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text;
CREATE UNIQUE INDEX IF NOT EXISTS projects_user_name_uq ON projects(clerk_user_id, name);
