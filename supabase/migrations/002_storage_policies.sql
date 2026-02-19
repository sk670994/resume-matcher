-- 002_storage_policies.sql
-- Storage policy to restrict access to objects in the 'resumes' bucket
-- Assumes files are stored with path: user_<user_id>/...

-- Example: user_11111111-1111-1111-1111-111111111111/john_resume.pdf

-- Allow authenticated users to manage (select/insert/update/delete) their own objects
-- This policy uses a regular expression to extract the UUID from the object name.

-- Make policies idempotent: drop if they exist first
DROP POLICY IF EXISTS "resumes_select_owner_only" ON storage.objects;
CREATE POLICY "resumes_select_owner_only" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'resumes' AND
    (
      auth.uid() IS NOT NULL AND
      auth.uid() = substring(name from '^user_([0-9a-fA-F-]{36})')::uuid
    )
  );

DROP POLICY IF EXISTS "resumes_insert_owner_only" ON storage.objects;
CREATE POLICY "resumes_insert_owner_only" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'resumes' AND
    (
      auth.uid() IS NOT NULL AND
      auth.uid() = substring(name from '^user_([0-9a-fA-F-]{36})')::uuid
    )
  );

-- UPDATE (not typically needed) and DELETE policies can be added similarly if desired.

-- Notes:
-- 1) You must create the 'resumes' storage bucket separately via the Supabase dashboard or CLI:
--    supabase storage bucket create resumes --public=false
-- 2) Test policies carefully in the Supabase SQL editor / dashboard.
