#!/usr/bin/env bash
# Helper script to create the 'resumes' storage bucket using Supabase CLI if available.
# Usage: ./create_supabase.sh [project-ref]

PROJECT_REF="$1"
ENV_FILE=".env.local"
if [ -z "$PROJECT_REF" ] && [ -f "$ENV_FILE" ]; then
  URL_LINE=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' $ENV_FILE || true)
  if [ -n "$URL_LINE" ]; then
    URL=${URL_LINE#*=}
    PROJECT_REF=$(echo "$URL" | awk -F. '{print $1}' | sed 's#https?://##')
  fi
fi

if [ -z "$PROJECT_REF" ]; then
  echo "Project ref not provided and couldn't be inferred. Provide it as an argument or set NEXT_PUBLIC_SUPABASE_URL in .env.local."
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install it from https://supabase.com/docs/guides/cli"
  echo "Then run: supabase storage bucket create resumes --project-ref $PROJECT_REF --public=false"
  echo "After that run the SQL files in supabase/migrations in the SQL editor."
  exit 0
fi

echo "Creating 'resumes' bucket for project: $PROJECT_REF"
supabase storage bucket create resumes --project-ref $PROJECT_REF --public=false

echo ""
echo "Done. Next steps:"
echo "1) Open Supabase SQL editor and run these files in order:"
echo "   - supabase/migrations/001_create_resumes_table.sql"
echo "   - supabase/migrations/002_storage_policies.sql"
echo "2) Add SUPABASE_SERVICE_ROLE_KEY to your .env.local (server-only) and restart your dev server."
