#!/usr/bin/env pwsh
# publish-custom-metrics.ps1 — Publish UnyKorn L1 chain metrics to CloudWatch (Windows)
# Usage: .\publish-custom-metrics.ps1
# Schedule: schtasks /create /tn "UnyKorn-Metrics" /tr "powershell -File C:\...\publish-custom-metrics.ps1" /sc minute /mo 1

$Namespace = "UnyKorn/L1"
$Node = "alpha"
$GenesisUrl = if ($env:GENESIS_URL) { $env:GENESIS_URL } else { "http://localhost:4030" }
$ApostleUrl = if ($env:APOSTLE_URL) { $env:APOSTLE_URL } else { "http://localhost:7332" }
$StateFile = "$env:TEMP\unykorn-metrics-state.json"

# Fetch Genesis Ledger health
try {
  $genesis = Invoke-RestMethod "$GenesisUrl/health" -TimeoutSec 5
  $ledgerEntries = [long]($genesis.entries)
} catch {
  $ledgerEntries = 0
}

# Fetch Apostle Chain status
try {
  $apostle = Invoke-RestMethod "$ApostleUrl/status" -TimeoutSec 5
  $blockHeight = [long]($apostle.height)
} catch {
  $blockHeight = 0
}

# Compute TPS from delta
$tps = 0.0
if (Test-Path $StateFile) {
  $prev = Get-Content $StateFile -Raw | ConvertFrom-Json
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $deltaEntries = $ledgerEntries - [long]$prev.entries
  $deltaTime = $now - [long]$prev.timestamp
  if ($deltaTime -gt 0 -and $deltaEntries -ge 0) {
    $tps = [math]::Round($deltaEntries / $deltaTime, 2)
  }
}

# Save state
@{ entries = $ledgerEntries; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() } |
  ConvertTo-Json | Set-Content $StateFile -Encoding ASCII

Write-Host "BlockHeight=$blockHeight LedgerEntries=$ledgerEntries TPS=$tps"

# Publish to CloudWatch
$metricData = @(
  @{ MetricName = "BlockHeight"; Dimensions = @(@{ Name = "Node"; Value = $Node }); Value = $blockHeight; Unit = "Count" },
  @{ MetricName = "TransactionsPerSecond"; Dimensions = @(@{ Name = "Node"; Value = $Node }); Value = $tps; Unit = "Count/Second" },
  @{ MetricName = "LedgerEntries"; Dimensions = @(@{ Name = "Node"; Value = $Node }); Value = $ledgerEntries; Unit = "Count" }
)

$json = @{ Namespace = $Namespace; MetricData = $metricData } | ConvertTo-Json -Depth 5 -Compress
$tmpFile = "$env:TEMP\cw-metrics.json"
[System.IO.File]::WriteAllText($tmpFile, $json, [System.Text.Encoding]::ASCII)

aws cloudwatch put-metric-data --cli-input-json "file://$tmpFile" 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "Published 3 metrics to $Namespace"
} else {
  Write-Host "FAILED to publish metrics" -ForegroundColor Red
}
Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
