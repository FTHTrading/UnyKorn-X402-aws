# ---------------------------------------------------------------------------
# openclaw-queue-inspect.ps1 — Inspect delivery queue entries
# ---------------------------------------------------------------------------
# Usage: .\scripts\ops\openclaw-queue-inspect.ps1
# Shows all pending and failed delivery queue entries with classification.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Continue"

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " OpenClaw Delivery Queue Inspector" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n"

$queueDir = Join-Path $env:USERPROFILE ".openclaw\delivery-queue"
$failedDir = Join-Path $queueDir "failed"

# Pending
Write-Host "[Pending Queue] $queueDir" -ForegroundColor Yellow
if (Test-Path $queueDir) {
    $pending = Get-ChildItem -Path $queueDir -Filter "*.json" -File -ErrorAction SilentlyContinue
    if ($pending.Count -eq 0) {
        Write-Host "  (empty)" -ForegroundColor Green
    } else {
        Write-Host "  $($pending.Count) entries:" -ForegroundColor Yellow
        foreach ($f in $pending) {
            try {
                $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
                $jobId = if ($data.jobId) { $data.jobId } elseif ($data.job_id) { $data.job_id } else { "unknown" }
                $mode = if ($data.mode) { $data.mode } elseif ($data.deliveryMode) { $data.deliveryMode } else { "n/a" }
                $target = if ($data.target) { $data.target } elseif ($data.recipient) { $data.recipient } else { "n/a" }
                Write-Host "  $($f.Name): job=$jobId mode=$mode target=$target" -ForegroundColor White
            } catch {
                Write-Host "  $($f.Name): [PARSE ERROR] $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
} else {
    Write-Host "  (directory does not exist)" -ForegroundColor DarkGray
}

# Failed
Write-Host "`n[Failed Queue] $failedDir" -ForegroundColor Yellow
if (Test-Path $failedDir) {
    $failed = Get-ChildItem -Path $failedDir -Filter "*.json" -File -ErrorAction SilentlyContinue
    if ($failed.Count -eq 0) {
        Write-Host "  (empty)" -ForegroundColor Green
    } else {
        Write-Host "  $($failed.Count) entries:" -ForegroundColor Red
        foreach ($f in $failed) {
            try {
                $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
                $jobId = if ($data.jobId) { $data.jobId } elseif ($data.job_id) { $data.job_id } else { "unknown" }
                Write-Host "  $($f.Name): job=$jobId" -ForegroundColor Red
            } catch {
                Write-Host "  $($f.Name): [PARSE ERROR]" -ForegroundColor Red
            }
        }
    }
} else {
    Write-Host "  (directory does not exist)" -ForegroundColor DarkGray
}

Write-Host ""
exit 0
