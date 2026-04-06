# ---------------------------------------------------------------------------
# openclaw-cron-resolve.ps1 — Show resolved models for all cron jobs
# ---------------------------------------------------------------------------
# Usage: .\scripts\ops\openclaw-cron-resolve.ps1
# Displays the full model resolution chain for each cron job:
# job override → agent override → global default, plus provider safety.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Continue"

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " OpenClaw Cron Model Resolution" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n"

$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"
$jobsPath = Join-Path $env:USERPROFILE ".openclaw\cron\jobs.json"

if (-not (Test-Path $configPath)) {
    Write-Host "  [FAIL] Config not found: $configPath" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $jobsPath)) {
    Write-Host "  [WARN] No cron jobs file: $jobsPath" -ForegroundColor Yellow
    exit 0
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$jobsRaw = Get-Content $jobsPath -Raw | ConvertFrom-Json

# Extract defaults
$globalDefault = $config.agents.defaults.model.primary
$agentModel = if ($config.agents.list -and $config.agents.list.Count -gt 0) { $config.agents.list[0].model } else { $null }

Write-Host "  Global default model:  $globalDefault" -ForegroundColor White
Write-Host "  Agent[0] model:        $(if($agentModel){"$agentModel"}else{'(not set — inherits global)'})" -ForegroundColor White
Write-Host ""

# Handle jobs as array or object
$jobs = @()
if ($jobsRaw -is [System.Collections.IEnumerable] -and $jobsRaw -isnot [string]) {
    $jobs = $jobsRaw
} elseif ($jobsRaw.PSObject.Properties) {
    foreach ($prop in $jobsRaw.PSObject.Properties) {
        $job = $prop.Value
        if (-not $job.id) { $job | Add-Member -NotePropertyName "id" -NotePropertyValue $prop.Name -Force }
        $jobs += $job
    }
}

$nonCronSafe = @("github-copilot", "copilot", "vscode-copilot")
$cronSafe = @("ollama", "llamafile", "lmstudio", "localai")

foreach ($job in $jobs) {
    $name = if ($job.name) { $job.name } elseif ($job.label) { $job.label } else { $job.id }
    $deliveryMode = if ($job.delivery -and $job.delivery.mode) { $job.delivery.mode } else { "(not set)" }

    # Resolve model
    $resolvedModel = $null
    $source = ""
    if ($job.model) {
        $resolvedModel = $job.model
        $source = "job-override"
    } elseif ($agentModel) {
        $resolvedModel = $agentModel
        $source = "agent-override"
    } elseif ($globalDefault) {
        $resolvedModel = $globalDefault
        $source = "global-default"
    } else {
        $source = "NONE"
    }

    # Extract provider
    $provider = $null
    if ($resolvedModel -and $resolvedModel.Contains("/")) {
        $provider = $resolvedModel.Split("/")[0]
    }

    # Safety check
    $safety = "unknown"
    if ($provider -and $nonCronSafe -contains $provider.ToLower()) {
        $safety = "UNSAFE"
    } elseif ($provider -and $cronSafe -contains $provider.ToLower()) {
        $safety = "safe"
    }

    # Output
    $color = if ($safety -eq "UNSAFE") { "Red" } elseif (-not $resolvedModel) { "Red" } else { "Green" }
    Write-Host "  [$name] ($($job.id))" -ForegroundColor Cyan
    Write-Host "    Model:     $resolvedModel (source: $source)" -ForegroundColor $color
    Write-Host "    Provider:  $provider ($safety)" -ForegroundColor $color
    Write-Host "    Delivery:  $deliveryMode" -ForegroundColor White
    Write-Host ""
}
