-- Migration 074: guideline_chunks — real RAG grounding for underwriting/
-- general-knowledge answers (Fannie Mae, Freddie Mac, HUD/FHA, VA, USDA).
-- Additive only. Run in Supabase SQL editor (Dashboard → SQL Editor → New query).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.guideline_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,        -- 'fannie_mae' | 'freddie_mac' | 'hud_fha' | 'va' | 'usda'
  source_label  text NOT NULL,        -- human-readable, e.g. "Fannie Mae Selling Guide"
  section_title text,                 -- e.g. "B3-6-02: Debt-to-Income Ratios"
  url           text NOT NULL,        -- official source URL — used for the answer's citation
  topic         text,                 -- 'dti' | 'credit_score' | 'ltv' | 'mip' | 'reserves' | 'gift_funds' | 'income' | 'occupancy' | 'loan_limits'
  chunk_text    text NOT NULL,        -- verbatim guideline passage — never paraphrased at ingest time
  embedding     vector(1536),         -- OpenAI text-embedding-3-small
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guideline_chunks_source_idx ON public.guideline_chunks (source);
CREATE INDEX IF NOT EXISTS guideline_chunks_topic_idx  ON public.guideline_chunks (topic);

-- No ANN index (ivfflat/hnsw) yet — Phase 1's corpus is small enough that an
-- exact cosine-distance scan via match_guideline_chunks below is sub-second
-- and an ivfflat index built on too few rows is actively worse than a scan.
-- Add one once the corpus is large enough to need it.

CREATE OR REPLACE FUNCTION public.match_guideline_chunks(
  query_embedding vector(1536),
  match_topic text DEFAULT NULL,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  source text,
  source_label text,
  section_title text,
  url text,
  topic text,
  chunk_text text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT id, source, source_label, section_title, url, topic, chunk_text,
         1 - (embedding <=> query_embedding) AS similarity
  FROM public.guideline_chunks
  WHERE (match_topic IS NULL OR topic = match_topic)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
