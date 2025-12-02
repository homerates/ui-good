-- setup-supabase.sql
-- Run this once to create your answer library table

create table if not exists public.user_answers (
  id uuid primary key default uuid_generate_v4(),
  clerk_user_id text not null,
  question text not null,
  answer jsonb not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.user_answers enable row level security;

-- Allow users to see and add their own answers
create policy "user can manage own answers"
  on public.user_answers
  for all
  using (auth.uid()::text = clerk_user_id)
  with check (auth.uid()::text = clerk_user_id);