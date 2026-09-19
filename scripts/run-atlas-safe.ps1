# Safe Atlas runner — dry-run reports only (no move/copy/delete/launch).
# Source script: scripts/atlas_master_safe_v2.py

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$AtlasPy = Join-Path $PSScriptRoot "atlas_master_safe_v2.py"

if (-not (Test-Path $AtlasPy)) {
    Write-Host "Missing $AtlasPy" -ForegroundColor Red
    exit 1
}

Write-Host "UNYKORN Atlas (safe v2) — dry-run only" -ForegroundColor Cyan
Write-Host "Reports target: C:\UNYKORN_EMPIRE\99_Reports"
Write-Host "No files will be moved, copied, deleted, or launched by this script."
Write-Host ""

$pyLauncher = Get-Command py -ErrorAction SilentlyContinue
if (-not $pyLauncher) {
    Write-Host "Python launcher 'py' not found. Install Python 3 from python.org." -ForegroundColor Red
    exit 1
}

& py -3 -c "import pandas" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing pandas + openpyxl (user scope)..." -ForegroundColor Yellow
    & py -3 -m pip install --user pandas openpyxl
}

$reportsDir = "C:\UNYKORN_EMPIRE\99_Reports"
if (-not (Test-Path $reportsDir)) {
    New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null
}

Push-Location $RepoRoot
try {
    & py -3 $AtlasPy
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($code -eq 0) {
    Write-Host ""
    Write-Host "Done. Review CSV/MD under C:\UNYKORN_EMPIRE\99_Reports before any APPLY script." -ForegroundColor Green
}
exit $code
