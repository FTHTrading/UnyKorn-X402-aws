# ---------------------------------------------------------------------------
# openclaw-smoke.ps1 — Full OpenClaw smoke test
# ---------------------------------------------------------------------------
# Usage: .\scripts\ops\openclaw-smoke.ps1
# Checks: config, gateway, plugins, ollama, cron, queue, memory.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Continue"

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " OpenClaw Smoke Test" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n"

$scriptDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$smokeTest = Join-Path $scriptDir "packages\openclaw-hardening\src\smoke-test.mjs"

if (-not (Test-Path $smokeTest)) {
    Write-Host "  [FAIL] Smoke test not found: $smokeTest" -ForegroundColor Red
    exit 1
}

& "C:\Program Files\nodejs\node.exe" $smokeTest
exit $LASTEXITCODE
