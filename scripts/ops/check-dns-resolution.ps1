#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verify DNS resolution for all l1.unykorn.org subdomains.
.DESCRIPTION
    Checks NS delegation, A record resolution, and HTTPS connectivity
    for the UnyKorn L1 infrastructure endpoints.
#>

param(
    [string]$DnsServer = "8.8.8.8",
    [switch]$SkipHttps
)

$ErrorActionPreference = "Continue"

$domains = @(
    "l1.unykorn.org",
    "api.l1.unykorn.org",
    "demo.l1.unykorn.org",
    "rpc.l1.unykorn.org",
    "x402.l1.unykorn.org",
    "facilitator.l1.unykorn.org",
    "treasury.l1.unykorn.org",
    "guardian.l1.unykorn.org"
)

$expectedNs = @(
    "ns-600.awsdns-11.net",
    "ns-1855.awsdns-39.co.uk",
    "ns-1501.awsdns-59.org",
    "ns-307.awsdns-38.com"
)

$httpsEndpoints = @(
    @{ url = "https://facilitator.l1.unykorn.org/health"; expect = 200 },
    @{ url = "https://treasury.l1.unykorn.org/health"; expect = 200 },
    @{ url = "https://guardian.l1.unykorn.org/health"; expect = 200 },
    @{ url = "https://l1.unykorn.org"; expect = 200 },
    @{ url = "https://api.l1.unykorn.org/api/status"; expect = 200 }
)

$pass = 0
$fail = 0

function Test-Result($name, $ok, $detail) {
    if ($ok) {
        Write-Host "  [PASS] $name — $detail" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  [FAIL] $name — $detail" -ForegroundColor Red
        $script:fail++
    }
}

Write-Host ""
Write-Host "=== UnyKorn L1 DNS Resolution Check ===" -ForegroundColor Cyan
Write-Host "DNS Server: $DnsServer"
Write-Host "Timestamp:  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC' -AsUTC)"
Write-Host ""

# --- 1. NS Delegation ---
Write-Host "--- NS Delegation ---" -ForegroundColor Yellow
try {
    $nsResult = Resolve-DnsName -Name "l1.unykorn.org" -Type NS -Server $DnsServer -ErrorAction Stop
    $nsRecords = $nsResult | Where-Object { $_.QueryType -eq "NS" } | ForEach-Object { $_.NameHost }
    $allFound = $true
    foreach ($expected in $expectedNs) {
        $found = $nsRecords -contains $expected
        Test-Result "NS $expected" $found $(if ($found) { "present" } else { "MISSING" })
        if (-not $found) { $allFound = $false }
    }
    if ($allFound) {
        Write-Host "  NS delegation: COMPLETE" -ForegroundColor Green
    }
} catch {
    Test-Result "NS delegation" $false "Query failed: $($_.Exception.Message)"
}

Write-Host ""

# --- 2. A Record Resolution ---
Write-Host "--- A Record Resolution ---" -ForegroundColor Yellow
foreach ($domain in $domains) {
    try {
        $result = Resolve-DnsName -Name $domain -Type A -Server $DnsServer -ErrorAction Stop
        $ips = ($result | Where-Object { $_.QueryType -eq "A" }).IPAddress -join ", "
        if ($ips) {
            Test-Result $domain $true "resolves to $ips"
        } else {
            # Check for CNAME/alias
            $cnames = ($result | Where-Object { $_.QueryType -eq "CNAME" }).NameHost -join " → "
            Test-Result $domain ($cnames.Length -gt 0) $(if ($cnames) { "CNAME: $cnames" } else { "no A record" })
        }
    } catch {
        Test-Result $domain $false "NXDOMAIN or timeout"
    }
}

Write-Host ""

# --- 3. HTTPS Connectivity ---
if (-not $SkipHttps) {
    Write-Host "--- HTTPS Connectivity ---" -ForegroundColor Yellow
    foreach ($ep in $httpsEndpoints) {
        try {
            $resp = Invoke-WebRequest -Uri $ep.url -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
            $ok = $resp.StatusCode -eq $ep.expect
            Test-Result $ep.url $ok "HTTP $($resp.StatusCode)"
        } catch {
            $status = $_.Exception.Response.StatusCode.value__
            if ($status) {
                Test-Result $ep.url ($status -eq $ep.expect) "HTTP $status"
            } else {
                Test-Result $ep.url $false "$($_.Exception.Message)"
            }
        }
    }
}

Write-Host ""
Write-Host "=== Results: $pass passed, $fail failed ===" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host ""

exit $fail
