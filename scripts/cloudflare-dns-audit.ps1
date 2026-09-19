<#
.SYNOPSIS
  Audit Cloudflare zones, DNS records, and Pages projects (read-only).

.PARAMETER TokenPath
  Path to API token file (default: Desktop Read all resources file).

.PARAMETER OutDir
  Directory for JSON exports (default: registry/cf-audit-latest).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/cloudflare-dns-audit.ps1
#>
param(
  [string]$TokenPath = "C:\Users\Kevan\OneDrive - FTH Trading\Desktop\Read all resources API token was su.txt",
  [string]$AccountId = "07bcc4a189ef176261b818409c95891f",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
if (-not $OutDir) { $OutDir = Join-Path $repoRoot "registry\cf-audit-latest" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Get-CfToken([string]$Path) {
  if (-not (Test-Path $Path)) { throw "Token file not found: $Path" }
  $lines = Get-Content $Path
  foreach ($l in $lines) {
    if ($l -match '^(#|Read|Account|curl|http|Zone)') { continue }
    $t = ($l -replace '^Bearer\s+', '').Trim() -replace '[\r\n]', ''
    if ($t.Length -ge 30 -and $t -notmatch '\s') { return $t }
  }
  return (($lines | Where-Object { $_.Length -gt 40 } | Select-Object -Last 1) -replace '[\r\n]', '').Trim()
}

function Invoke-CfApi {
  param([string]$Uri, [hashtable]$Headers)
  try {
    return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method GET
  } catch {
    Write-Warning "CF API $Uri failed: $($_.Exception.Message)"
    return $null
  }
}

$token = Get-CfToken $TokenPath
$headers = @{ Authorization = "Bearer $token" }

$verify = Invoke-CfApi "https://api.cloudflare.com/client/v4/user/tokens/verify" $headers
if (-not $verify.success) { throw "Token verify failed" }
Write-Host "Token status: $($verify.result.status)"

$zonesResp = Invoke-CfApi "https://api.cloudflare.com/client/v4/zones?per_page=100" $headers
$zones = @()
if ($zonesResp.success) {
  $zones = $zonesResp.result
  Write-Host "Zones: $($zones.Count)"
}

$dnsByZone = @{}
foreach ($z in $zones) {
  $dnsResp = Invoke-CfApi "https://api.cloudflare.com/client/v4/zones/$($z.id)/dns_records?per_page=500" $headers
  if ($dnsResp.success) {
    $dnsByZone[$z.name] = $dnsResp.result
    Write-Host "  DNS $($z.name): $($dnsResp.result.Count) records"
  }
  Start-Sleep -Milliseconds 200
}

$pages = @()
$pagesResp = Invoke-CfApi "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects?per_page=100" $headers
if ($pagesResp -and $pagesResp.success) {
  $pages = $pagesResp.result
  Write-Host "Pages projects: $($pages.Count)"
} else {
  $acctResp = Invoke-CfApi "https://api.cloudflare.com/client/v4/accounts" $headers
  if ($acctResp -and $acctResp.success -and $acctResp.result.Count -gt 0) {
    $aid = $acctResp.result[0].id
    $pagesResp = Invoke-CfApi "https://api.cloudflare.com/client/v4/accounts/$aid/pages/projects?per_page=100" $headers
    if ($pagesResp -and $pagesResp.success) {
      $pages = $pagesResp.result
      Write-Host "Pages projects (acct $aid): $($pages.Count)"
    }
  }
}

$export = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  accountId = $AccountId
  zones = $zones | ForEach-Object {
    [ordered]@{
      name = $_.name
      id = $_.id
      status = $_.status
      name_servers = $_.name_servers
      record_count = if ($dnsByZone.ContainsKey($_.name)) { $dnsByZone[$_.name].Count } else { 0 }
    }
  }
  dns_records = $dnsByZone
  pages_projects = $pages | ForEach-Object {
    [ordered]@{
      name = $_.name
      subdomain = $_.subdomain
      production_branch = $_.production_branch
      domains = $_.domains
    }
  }
}

$export | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "audit.json") -Encoding UTF8
Write-Host "Wrote $(Join-Path $OutDir 'audit.json')"

# Subdomain hints for unykorn.org
$unykorn = $dnsByZone['unykorn.org']
if ($unykorn) {
  $subs = $unykorn | Where-Object { $_.type -in @('CNAME','A','AAAA') } |
    ForEach-Object { $_.name -replace '\.unykorn\.org$','' } |
    Sort-Object -Unique
  $subs | Set-Content (Join-Path $OutDir "unykorn-subdomains.txt")
  Write-Host "unykorn.org subs exported: $($subs.Count)"
}
