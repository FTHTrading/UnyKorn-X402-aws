#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Check wallet balances across all configured treasury rails.

.DESCRIPTION
    Queries on-chain balances for XRPL, Stellar, Polygon, and Ethereum
    treasury wallets. Reports activation status and balance thresholds.
#>

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

Write-Host "`n=== FTH Pay Treasury Wallet Health Check ===" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')`n"

# ────────────────────────────────────────────────────────────────
# 1. XRPL Treasury
# ────────────────────────────────────────────────────────────────
$xrplAddr = "rsJ3PGGDH4vPpedjfVRe9YKTCf9BWu6TDC"
Write-Host "XRPL Treasury ($xrplAddr)" -ForegroundColor Yellow
try {
    # Use XRPL mainnet RPC directly (xrpscan returns duplicate JSON keys that break ConvertFrom-Json)
    $xrplBody = '{"method":"account_info","params":[{"account":"' + $xrplAddr + '","ledger_index":"validated"}]}'
    $r = Invoke-WebRequest -Uri "https://xrplcluster.com/" -Method POST -Body $xrplBody -ContentType "application/json" -TimeoutSec 10 -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    if ($j.result.status -eq "success") {
        $dropsBalance = [decimal]$j.result.account_data.Balance
        $xrpBal = $dropsBalance / 1000000
        $available = $xrpBal - 10  # 10 XRP reserve
        $status = if ($available -gt 10) { "OK" } elseif ($available -gt 0) { "LOW" } else { "CRITICAL" }
        Write-Host "  Balance: $xrpBal XRP (Available: $available XRP after reserve)" -ForegroundColor $(if ($status -eq "OK") {"Green"} elseif ($status -eq "LOW") {"Yellow"} else {"Red"})
        Write-Host "  Status: $status"
    } else {
        Write-Host "  Account NOT FOUND (error: $($j.result.error))" -ForegroundColor Red
        Write-Host "  Status: CRITICAL"
    }
} catch {
    Write-Host "  ERROR: Could not query XRPL - $_" -ForegroundColor Red
}

# ────────────────────────────────────────────────────────────────
# 2. Stellar Treasury
# ────────────────────────────────────────────────────────────────
$stellarAddr = "GBJF54FBYPBVHR6Z3OKWWEMPF6QYPNH3RZZYX3E4V7AUMUWIEV7Z3DPX"
Write-Host "`nStellar Treasury ($($stellarAddr.Substring(0,8))...)" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "https://horizon.stellar.org/accounts/$stellarAddr" -TimeoutSec 10 -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    foreach ($b in $j.balances) {
        if ($b.asset_type -eq "native") {
            Write-Host "  XLM: $($b.balance)" -ForegroundColor Green
        } elseif ($b.asset_code) {
            Write-Host "  $($b.asset_code): $($b.balance)"
        }
    }
    Write-Host "  Status: ACTIVE"
} catch {
    if ($_.Exception.Response.StatusCode -eq 404 -or $_.Exception.Message -match "404") {
        Write-Host "  NOT ACTIVATED - Needs minimum 1 XLM to create account" -ForegroundColor Red
        Write-Host "  Status: CRITICAL"
    } else {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ────────────────────────────────────────────────────────────────
# 3. OPTKAS Stellar Accounts
# ────────────────────────────────────────────────────────────────
$optkas = @(
    @{Name="OPTKAS Issuer"; Addr="GBJIMHMBGTPN5RS42OGBUY5NC2ATZLPT3B3EWV32SM2GQLS46TRJWG4I"},
    @{Name="OPTKAS Distrib"; Addr="GAKCD7OKDM4HLZDBEE7KXTRFAYIE755UHL3JFQEOOHDPIMM5GEFY3RPF"},
    @{Name="OPTKAS Anchor"; Addr="GC6O6Q7FG5FZGHE5D5BHGA6ZTLRAU7UWFJKKWNOJ36G3PKVVKVYLQGA6"}
)

foreach ($acct in $optkas) {
    Write-Host "`n$($acct.Name) ($($acct.Addr.Substring(0,8))...)" -ForegroundColor Yellow
    try {
        $r = Invoke-WebRequest -Uri "https://horizon.stellar.org/accounts/$($acct.Addr)" -TimeoutSec 10 -UseBasicParsing
        $j = $r.Content | ConvertFrom-Json
        foreach ($b in $j.balances) {
            if ($b.asset_type -eq "native") {
                Write-Host "  XLM: $($b.balance)" -ForegroundColor Green
            } elseif ($b.asset_code -and [decimal]$b.balance -gt 0) {
                Write-Host "  $($b.asset_code): $($b.balance)"
            }
        }
        Write-Host "  Status: ACTIVE"
    } catch {
        Write-Host "  NOT ACTIVATED" -ForegroundColor Red
    }
}

# ────────────────────────────────────────────────────────────────
# 4. Polygon / EVM Treasury
# ────────────────────────────────────────────────────────────────
$evmAddr = "0x7d9a65d06dcc435a52D5880C6310Bd6E96c156DB"

Write-Host "`nPolygon Treasury ($evmAddr)" -ForegroundColor Yellow
try {
    $body = "{`"jsonrpc`":`"2.0`",`"method`":`"eth_getBalance`",`"params`":[`"$evmAddr`",`"latest`"],`"id`":1}"
    $r = Invoke-WebRequest -Uri "https://polygon-bor-rpc.publicnode.com" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10 -UseBasicParsing
    $hex = ($r.Content | ConvertFrom-Json).result
    if ($hex -and $hex -ne "0x0") {
        $polBal = python -c "print(int('$hex', 16) / 1e18)"
        Write-Host "  POL: $polBal" -ForegroundColor Green
    } else {
        Write-Host "  POL: 0" -ForegroundColor Red
    }
    Write-Host "  Status: $(if ([decimal]$polBal -gt 1) {'OK'} else {'LOW'})"
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
}

Write-Host "`nEthereum Treasury ($evmAddr)" -ForegroundColor Yellow
try {
    $body = "{`"jsonrpc`":`"2.0`",`"method`":`"eth_getBalance`",`"params`":[`"$evmAddr`",`"latest`"],`"id`":1}"
    $r = Invoke-WebRequest -Uri "https://ethereum-rpc.publicnode.com" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10 -UseBasicParsing
    $hex = ($r.Content | ConvertFrom-Json).result
    if ($hex -and $hex -ne "0x0") {
        $ethBal = python -c "print(int('$hex', 16) / 1e18)"
        Write-Host "  ETH: $ethBal" -ForegroundColor Green
    } else {
        Write-Host "  ETH: 0.0000" -ForegroundColor Red
    }
    Write-Host "  Status: $(if ($hex -ne '0x0') {'OK'} else {'CRITICAL - no gas for ERC-20'})"
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
}

# ────────────────────────────────────────────────────────────────
# 5. Local Services
# ────────────────────────────────────────────────────────────────
Write-Host "`n=== Local Service Health ===" -ForegroundColor Cyan

$services = @(
    @{Port=3100; Name="FTH Pay API"; Path="/health"},
    @{Port=3200; Name="x402 Treasury"; Path="/health"},
    @{Port=3300; Name="Guardian"; Path="/health"},
    @{Port=4010; Name="Agent Gateway"; Path="/health"},
    @{Port=4030; Name="Genesis Ledger"; Path="/health"},
    @{Port=7332; Name="Apostle Chain"; Path="/health"},
    @{Port=8077; Name="Daemon Dashboard"; Path="/"}
)

foreach ($svc in $services) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$($svc.Port)$($svc.Path)" -TimeoutSec 3 -UseBasicParsing
        $snippet = $r.Content.Substring(0, [Math]::Min(120, $r.Content.Length))
        Write-Host "  $($svc.Name) :$($svc.Port) => $($r.StatusCode) OK" -ForegroundColor Green
        if ($Verbose) { Write-Host "    $snippet" -ForegroundColor DarkGray }
    } catch {
        Write-Host "  $($svc.Name) :$($svc.Port) => DOWN" -ForegroundColor Red
    }
}

Write-Host "`n=== Check Complete ===" -ForegroundColor Cyan
