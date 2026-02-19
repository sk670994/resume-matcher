-- 001_create_resumes_table.sql
-- Creates `resumes` table and owner-only RLS policy for Supabase

-- Enable extensions commonly used for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  path text NOT NULL,
  content_type text,
  size bigint,
  uploaded_at timestamptz DEFAULT now(),
  status text DEFAULT 'uploaded',
  extracted_text text
);

-- Link to Supabase auth.users (optional but recommended)
ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- Enable row-level security and add a policy so users can only manage their own rows
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to manage their own resumes" ON public.resumes
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket creation cannot be performed via Postgres SQL; run this command with the Supabase CLI or via the dashboard:
-- supabase storage bucket create resumes --public=false

-- Recommended storage policy (manage via dashboard/CLI):
-- Allow authenticated users to read/write only their files under "user-id/" path patterns.
-- See Supabase Storage Policies docs for exact policy examples.
