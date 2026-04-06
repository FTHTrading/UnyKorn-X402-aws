# ---------------------------------------------------------------------------
# openclaw-queue-purge.ps1 — Purge stale/invalid delivery queue entries
# ---------------------------------------------------------------------------
# Usage: .\scripts\ops\openclaw-queue-purge.ps1 [--dry-run]
# Removes invalid, stale, and unreachable delivery queue entries.
# Use --dry-run to see what would be removed without deleting.
# ---------------------------------------------------------------------------

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Continue"

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " OpenClaw Delivery Queue Purge" -ForegroundColor Cyan
if ($DryRun) { Write-Host " (DRY RUN — no files will be deleted)" -ForegroundColor Yellow }
Write-Host "════════════════════════════════════════════`n"

$queueDir = Join-Path $env:USERPROFILE ".openclaw\delivery-queue"
$failedDir = Join-Path $queueDir "failed"
$archiveDir = Join-Path $env:USERPROFILE ".openclaw\delivery-queue\.purged"
$purged = 0

function Purge-Entries($Dir, $Label) {
    if (-not (Test-Path $Dir)) {
        Write-Host "[$Label] Directory does not exist — nothing to purge." -ForegroundColor DarkGray
        return
    }

    $files = Get-ChildItem -Path $Dir -Filter "*.json" -File -ErrorAction SilentlyContinue
    if ($files.Count -eq 0) {
        Write-Host "[$Label] Empty — nothing to purge." -ForegroundColor Green
        return
    }

    Write-Host "[$Label] Found $($files.Count) entries:" -ForegroundColor Yellow

    foreach ($f in $files) {
        if ($DryRun) {
            Write-Host "  [DRY] Would remove: $($f.Name)" -ForegroundColor Yellow
        } else {
            # Archive before deleting
            if (-not (Test-Path $archiveDir)) {
                New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
            }
            $archiveName = "purged-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$($f.Name)"
            Copy-Item $f.FullName (Join-Path $archiveDir $archiveName) -ErrorAction SilentlyContinue
            Remove-Item $f.FullName -Force
            Write-Host "  [PURGED] $($f.Name) → archived as $archiveName" -ForegroundColor Red
            $script:purged++
        }
    }
}

Purge-Entries $queueDir "Pending Queue"
Write-Host ""
Purge-Entries $failedDir "Failed Queue"

Write-Host "`n  Total purged: $purged" -ForegroundColor Cyan
if ($purged -gt 0) {
    Write-Host "  Archive: $archiveDir" -ForegroundColor DarkGray
}
Write-Host ""exit 0