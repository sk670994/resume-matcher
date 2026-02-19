<#
PowerShell helper to create the `resumes` storage bucket using the Supabase CLI (if installed).
It will print the commands to run to apply SQL migrations manually.

Usage:
  .\create_supabase.ps1 [project-ref]
If no project-ref is supplied, the script will attempt to parse it from NEXT_PUBLIC_SUPABASE_URL in .env.local.
#>

param(
  [string]$ProjectRef
)

# Try to load .env.local if present to extract NEXT_PUBLIC_SUPABASE_URL
$envFile = Join-Path (Get-Location) ".env.local"
if (-not $ProjectRef -and Test-Path $envFile) {
  $content = Get-Content $envFile | Where-Object {$_ -match "^NEXT_PUBLIC_SUPABASE_URL="}
  if ($content) {
    $url = ($content -split "=")[1].Trim()
    try {
      $uri = [Uri]$url
      $host = $uri.Host
      $ProjectRef = $host.Split('.')[0]
    } catch {
    }
  }
}

if (-not $ProjectRef) {
  Write-Host "Project ref not provided and couldn't be inferred. Provide it as an argument or set NEXT_PUBLIC_SUPABASE_URL in .env.local." -ForegroundColor Yellow
  exit 1
}

# Check supabase CLI
$supabasePath = (Get-Command supabase -ErrorAction SilentlyContinue)?.Source
if (-not $supabasePath) {
  Write-Host "Supabase CLI not found. Install it from https://supabase.com/docs/guides/cli" -ForegroundColor Yellow
  Write-Host "Then run the following commands:" -ForegroundColor Green
  Write-Host "supabase storage bucket create resumes --project-ref $ProjectRef --public=false"
  Write-Host "-- Then open the Supabase SQL editor and run: supabase/migrations/001_create_resumes_table.sql and 002_storage_policies.sql"
  exit 0
}

Write-Host "Creating 'resumes' bucket for project: $ProjectRef" -ForegroundColor Cyan
& supabase storage bucket create resumes --project-ref $ProjectRef --public=false

Write-Host "\nDone. Next steps:" -ForegroundColor Green
Write-Host "1) Open Supabase SQL editor and run these files in order:" -ForegroundColor Green
Write-Host "   - supabase/migrations/001_create_resumes_table.sql" -ForegroundColor Green
Write-Host "   - supabase/migrations/002_storage_policies.sql" -ForegroundColor Green
Write-Host "2) Add SUPABASE_SERVICE_ROLE_KEY to your .env.local (server-only) and restart your dev server." -ForegroundColor Green
