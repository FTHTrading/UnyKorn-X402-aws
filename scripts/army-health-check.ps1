#Requires -Version 5.1
<#
.SYNOPSIS
  One-command green/red health for the x402 army mesh.

.DESCRIPTION
  Probes: gateway :4020, x402.unykorn.org, paid.unykorn.org, pay.drunks.app,
  Ollama :11434, OpenClaw :18789, Nerve :3080.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/army-health-check.ps1
#>
param(
  [int]$TimeoutSec = 8,
  [string]$MoltbotUserAgent = "UnyKornMoltbot/1.0"
)

$ErrorActionPreference = "SilentlyContinue"

function Write-Pass([string]$Name, [string]$Detail) {
  Write-Host ("[PASS] {0,-28} {1}" -f $Name, $Detail) -ForegroundColor Green
}

function Write-Fail([string]$Name, [string]$Detail) {
  Write-Host ("[FAIL] {0,-28} {1}" -f $Name, $Detail) -ForegroundColor Red
}

function Test-HttpStatus {
  param(
    [string]$Name,
    [string]$Url,
    [string]$Method = "GET",
    [hashtable]$Headers = @{},
    [int[]]$ExpectedStatus = @(200),
    [scriptblock]$BodyPredicate = $null
  )

  try {
    $params = @{
      Uri             = $Url
      Method          = $Method
      TimeoutSec      = $TimeoutSec
      UseBasicParsing = $true
    }
    if ($Headers.Count -gt 0) { $params.Headers = $Headers }

    $resp = Invoke-WebRequest @params
    $code = [int]$resp.StatusCode
    $body = $resp.Content

    if ($ExpectedStatus -notcontains $code) {
      Write-Fail $Name "HTTP $code (expected $($ExpectedStatus -join '|'))"
      return $false
    }

    if ($null -ne $BodyPredicate) {
      $ok = & $BodyPredicate $body
      if (-not $ok) {
        Write-Fail $Name "HTTP $code but body check failed"
        return $false
      }
    }

    Write-Pass $Name "HTTP $code"
    return $true
  }
  catch {
    $msg = $_.Exception.Message
    if ($_.Exception.Response) {
      try {
        $code = [int]$_.Exception.Response.StatusCode.value__
        if ($ExpectedStatus -contains $code) {
          Write-Pass $Name "HTTP $code (expected non-2xx)"
          return $true
        }
        Write-Fail $Name "HTTP $code - $msg"
        return $false
      }
      catch { }
    }
    Write-Fail $Name $msg
    return $false
  }
}

function Test-GatewayHealthBody {
  param([string]$Body)
  if ([string]::IsNullOrWhiteSpace($Body)) { return $false }
  if ($Body -match '<html') { return $false }
  if ($Body -match '"ok"\s*:\s*true') { return $true }
  if ($Body -match '"status"\s*:\s*"ok"') { return $true }
  try {
    $j = $Body | ConvertFrom-Json
    return ($j.ok -eq $true) -or ($j.status -eq "ok")
  }
  catch { return $false }
}

$ua = @{ "User-Agent" = $MoltbotUserAgent }
$results = @()

Write-Host ""
Write-Host "=== x402 Army Health Check ===" -ForegroundColor Cyan
Write-Host ("Time: {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ""

# Local gateway :4020
$results += Test-HttpStatus -Name "Gateway :4020" `
  -Url "http://127.0.0.1:4020/health" `
  -ExpectedStatus @(200) `
  -BodyPredicate { param($b) Test-GatewayHealthBody $b }

# Public facilitator (Cloudflare needs UA; may be behind Access on some hostnames)
$results += Test-HttpStatus -Name "x402.unykorn.org" `
  -Url "https://x402.unykorn.org/health" `
  -Headers $ua `
  -ExpectedStatus @(200) `
  -BodyPredicate { param($b) Test-GatewayHealthBody $b }

# Paid edge — 402 means paywall alive
$results += Test-HttpStatus -Name "paid.unykorn.org" `
  -Url "https://paid.unykorn.org/v1/test" `
  -ExpectedStatus @(402)

# Drunks edge health + paywall
$results += Test-HttpStatus -Name "pay.drunks.app health" `
  -Url "https://pay.drunks.app/__x402/health" `
  -ExpectedStatus @(200)

$results += Test-HttpStatus -Name "pay.drunks.app gate" `
  -Url "https://pay.drunks.app/v1/test" `
  -ExpectedStatus @(402)

# Ollama
$results += Test-HttpStatus -Name "Ollama :11434" `
  -Url "http://127.0.0.1:11434/api/tags" `
  -ExpectedStatus @(200)

# OpenClaw gateway
$results += Test-HttpStatus -Name "OpenClaw :18789" `
  -Url "http://127.0.0.1:18789/health" `
  -ExpectedStatus @(200) `
  -BodyPredicate { param($b) ($b -match '"ok"\s*:\s*true') -or ($b -match 'live') }

# Nerve cockpit
$results += Test-HttpStatus -Name "Nerve :3080" `
  -Url "http://127.0.0.1:3080/health" `
  -ExpectedStatus @(200)

Write-Host ""
$pass = ($results | Where-Object { $_ }).Count
$fail = ($results | Where-Object { -not $_ }).Count
$total = $results.Count

if ($fail -eq 0) {
  Write-Host ("Result: {0}/{1} PASS - army healthy" -f $pass, $total) -ForegroundColor Green
  exit 0
}
else {
  Write-Host ("Result: {0} pass, {1} fail - see docs/X402_ARMY_STATUS.md" -f $pass, $fail) -ForegroundColor Yellow
  exit 1
}
