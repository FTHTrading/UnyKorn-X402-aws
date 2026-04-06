# ---------------------------------------------------------------------------
# openclaw-backup-state.ps1 — Backup OpenClaw runtime state
# ---------------------------------------------------------------------------
# Usage: .\scripts\ops\openclaw-backup-state.ps1 [--list]
# Creates timestamped backup of config, cron, queue, and memory state.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Continue"

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " OpenClaw State Backup" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n"

$scriptDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backupScript = Join-Path $scriptDir "packages\openclaw-hardening\src\backup.mjs"

if (-not (Test-Path $backupScript)) {
    Write-Host "  [FAIL] Backup script not found: $backupScript" -ForegroundColor Red
    exit 1
}

if ($args -contains "--list") {
    & "C:\Program Files\nodejs\node.exe" $backupScript --list
} else {
    & "C:\Program Files\nodejs\node.exe" $backupScript
}
exit $LASTEXITCODE
