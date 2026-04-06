# ---------------------------------------------------------------------------
# openclaw-plugins-status.ps1 — Inspect plugin startup and health
# ---------------------------------------------------------------------------
# Usage: .\scripts\ops\openclaw-plugins-status.ps1
# Shows which plugins are loaded, disabled, or problematic.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Continue"

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " OpenClaw Plugin Status" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n"

$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"

if (-not (Test-Path $configPath)) {
    Write-Host "  [FAIL] Config not found: $configPath" -ForegroundColor Red
    exit 1
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$problematic = @("google", "minimax")

$plugins = @()
if ($config.plugins -and $config.plugins.entries) {
    $plugins = $config.plugins.entries
}

if ($plugins.Count -eq 0) {
    Write-Host "  No plugins configured." -ForegroundColor Yellow
    exit 0
}

$loaded = 0; $disabled = 0; $dangerous = 0

foreach ($p in $plugins) {
    $name = if ($p.name) { $p.name } elseif ($p.id) { $p.id } else { "unknown" }
    $enabled = $p.enabled -ne $false
    $isProblematic = $problematic -contains $name.ToLower()

    if ($enabled -and $isProblematic) {
        Write-Host "  [DANGER] $name — ENABLED but KNOWN PROBLEMATIC" -ForegroundColor Red
        Write-Host "           Causes: RangeError: Maximum call stack size (ajv schema compilation)" -ForegroundColor Red
        Write-Host "           Fix: Set enabled=false in openclaw.json" -ForegroundColor Red
        $dangerous++
        $loaded++
    } elseif ($enabled) {
        Write-Host "  [OK]     $name — enabled" -ForegroundColor Green
        $loaded++
    } elseif ($isProblematic) {
        Write-Host "  [SAFE]   $name — disabled (known problematic, correctly disabled)" -ForegroundColor DarkGray
        $disabled++
    } else {
        Write-Host "  [OFF]    $name — disabled" -ForegroundColor DarkGray
        $disabled++
    }
}

Write-Host "`n  Summary: $loaded loaded, $disabled disabled, $dangerous dangerous" -ForegroundColor Cyan

# Gateway health
Write-Host "`n  Gateway health:" -ForegroundColor Yellow
try {
    $start = Get-Date
    $response = Invoke-WebRequest "http://127.0.0.1:18789/health" -TimeoutSec 5 -UseBasicParsing
    $latency = ((Get-Date) - $start).TotalMilliseconds
    Write-Host "  [OK] Gateway healthy ($([int]$latency)ms)" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Gateway not reachable: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
if ($dangerous -gt 0) { exit 1 }
exit 0
