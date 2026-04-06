# ---------------------------------------------------------------------------
# openclaw-validate.ps1 — Full OpenClaw config validation
# ---------------------------------------------------------------------------
# Usage: .\scripts\ops\openclaw-validate.ps1
# Runs all validators: delivery modes, cron model resolution, providers,
# plugins, memory, delivery queue.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Continue"

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " OpenClaw Config Validation" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n"

$scriptDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$validator = Join-Path $scriptDir "packages\openclaw-hardening\src\validate-config.mjs"

if (-not (Test-Path $validator)) {
    Write-Host "  [FAIL] Validator not found: $validator" -ForegroundColor Red
    exit 1
}

& "C:\Program Files\nodejs\node.exe" $validator
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "  Validation passed." -ForegroundColor Green
} else {
    Write-Host "  Validation failed. See errors above." -ForegroundColor Red
}

exit $exitCode
