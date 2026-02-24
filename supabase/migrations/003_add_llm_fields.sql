-- 003_add_llm_fields.sql
-- Adds LLM enrichment columns and enforces allowed resume statuses using text + CHECK.

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS llm_summary text,
  ADD COLUMN IF NOT EXISTS llm_skills text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS llm_roles text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS llm_experience_years numeric,
  ADD COLUMN IF NOT EXISTS llm_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS llm_match jsonb;

-- Keep status as text, but enforce known values.
ALTER TABLE public.resumes
  ALTER COLUMN status TYPE text,
  ALTER COLUMN status SET DEFAULT 'uploaded';

-- Normalize existing rows with null/empty status.
UPDATE public.resumes
SET status = 'uploaded'
WHERE status IS NULL OR btrim(status) = '';

-- Remove legacy/previous constraint if present, then enforce allowed statuses.
ALTER TABLE public.resumes
  DROP CONSTRAINT IF EXISTS resumes_status_check;

ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_status_check
  CHECK (status IN ('uploaded', 'extracting', 'llm_processing', 'ready', 'error'));
