# ---------------------------------------------------------------------------
# openclaw-memory-status.ps1 — Memory provider readiness check
# ---------------------------------------------------------------------------
# Usage: .\scripts\ops\openclaw-memory-status.ps1
# Checks memory search config, embedding provider, and Ollama connectivity.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Continue"

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " OpenClaw Memory Provider Status" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n"

$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"

if (-not (Test-Path $configPath)) {
    Write-Host "  [FAIL] Config not found: $configPath" -ForegroundColor Red
    exit 1
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$ms = $config.agents.defaults.memorySearch

# Enabled?
$enabled = $ms.enabled -eq $true
Write-Host "  Enabled:   $(if($enabled){'yes'}else{'no'})" -ForegroundColor $(if($enabled){'Green'}else{'Yellow'})

if (-not $enabled) {
    Write-Host "`n  Memory search is disabled. Enable with:" -ForegroundColor Yellow
    Write-Host "    openclaw config set agents.defaults.memorySearch.enabled true" -ForegroundColor White
    exit 0
}

# Provider
$provider = $ms.provider
Write-Host "  Provider:  $(if($provider -and $provider -ne 'auto'){$provider}else{'auto (WARNING: may skip Ollama)'})" -ForegroundColor $(if($provider -and $provider -ne 'auto'){'Green'}else{'Red'})

if (-not $provider -or $provider -eq "auto") {
    Write-Host "`n  [FAIL] Provider is 'auto' — Ollama adapter lacks autoSelectPriority" -ForegroundColor Red
    Write-Host "         Fix: openclaw config set agents.defaults.memorySearch.provider ollama" -ForegroundColor Yellow
}

# Ollama embedding check
if ($provider -eq "ollama") {
    Write-Host "`n  Checking Ollama embedding endpoint..." -ForegroundColor Yellow

    try {
        $body = @{ model = "nomic-embed-text"; prompt = "hardening probe" } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/embeddings" `
            -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10

        if ($response.embedding -and $response.embedding.Count -gt 0) {
            Write-Host "  [OK] Ollama embedding ready — $($response.embedding.Count) dimensions" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Ollama returned empty embedding" -ForegroundColor Red
        }
    } catch {
        Write-Host "  [FAIL] Ollama embedding not reachable: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "         Ensure Ollama is running and nomic-embed-text is pulled:" -ForegroundColor Yellow
        Write-Host "           ollama pull nomic-embed-text" -ForegroundColor White
    }
}

# Memory workspace
$memDir = Join-Path $env:USERPROFILE ".openclaw\workspace\memory"
if (Test-Path $memDir) {
    $memFiles = Get-ChildItem $memDir -File
    Write-Host "`n  Workspace: $memDir ($($memFiles.Count) files)" -ForegroundColor Green
} else {
    Write-Host "`n  [WARN] Memory workspace directory not found: $memDir" -ForegroundColor Yellow
    Write-Host "         Create it with: New-Item -ItemType Directory '$memDir'" -ForegroundColor White
}

# Memory DB
$memDb = Join-Path $env:USERPROFILE ".openclaw\memory\main.sqlite"
if (Test-Path $memDb) {
    $size = (Get-Item $memDb).Length
    Write-Host "  SQLite DB: $memDb ($([math]::Round($size/1024, 1)) KB)" -ForegroundColor Green
} else {
    Write-Host "  SQLite DB: not found (run `openclaw memory index` to create)" -ForegroundColor Yellow
}

Write-Host ""
