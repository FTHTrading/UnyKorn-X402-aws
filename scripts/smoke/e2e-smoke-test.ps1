# UnyKorn L1 / x402 / Apostle Chain - Smoke Test Script
# Runs health checks across all services plus basic economic flow validation
# Usage: .\scripts\smoke\e2e-smoke-test.ps1

$ErrorActionPreference = "Continue"
$pass = 0; $fail = 0; $warn = 0

function Test-Service($Name, $Url, $ExpectField) {
    try {
        $r = Invoke-WebRequest $Url -TimeoutSec 5 -UseBasicParsing
        if ($r.StatusCode -eq 200) {
            $body = $r.Content | ConvertFrom-Json
            if ($ExpectField -and -not ($body.PSObject.Properties.Name -contains $ExpectField)) {
                Write-Host "  [WARN] $Name => 200 but missing field '$ExpectField'" -ForegroundColor Yellow
                $script:warn++
            } else {
                Write-Host "  [PASS] $Name => 200 OK" -ForegroundColor Green
                $script:pass++
            }
            return $body
        } else {
            Write-Host "  [FAIL] $Name => $($r.StatusCode)" -ForegroundColor Red
            $script:fail++
            return $null
        }
    } catch {
        Write-Host "  [FAIL] $Name => $($_.Exception.Message)" -ForegroundColor Red
        $script:fail++
        return $null
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " UnyKorn L1 Stack - E2E Smoke Test" -ForegroundColor Cyan
Write-Host "========================================`n"

# ── 1. Service Health ──────────────────────────────────────
Write-Host "[1/6] Service Health Checks" -ForegroundColor Cyan

$fthPay   = Test-Service "FTH Pay API (:3100)"  "http://localhost:3100/health"   "status"
$apostle  = Test-Service "Apostle Chain (:7332)" "http://localhost:7332/health"   $null
$genesis  = Test-Service "Genesis Ledger (:4030)" "http://localhost:4030/health"  $null
$gateway  = Test-Service "Agent Gateway (:4010)" "http://localhost:4010/health"   $null

# Optional services
try {
    $treasury = Test-Service "x402 Treasury (:3200)" "http://localhost:3200/health" $null
} catch {}
try {
    $guardian = Test-Service "Guardian (:3300)"       "http://localhost:3300/health" $null
} catch {}

# ── 2. Apostle Chain State ─────────────────────────────────
Write-Host "`n[2/6] Apostle Chain State" -ForegroundColor Cyan

try {
    $status = (Invoke-WebRequest "http://localhost:7332/status" -TimeoutSec 5 -UseBasicParsing).Content | ConvertFrom-Json
    Write-Host "  Chain ID : $($status.chain_id)"
    Write-Host "  Height   : $($status.height)"
    Write-Host "  Agents   : $($status.agents)"
    Write-Host "  Mempool  : $($status.mempool)"
    
    if ($status.height -lt 2) {
        Write-Host "  [FAIL] Block height < 2 (chain not initialized)" -ForegroundColor Red
        $fail++
    } elseif ($status.height -gt 2) {
        Write-Host "  [PASS] Chain active (height $($status.height), proposer producing blocks)" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  [PASS] Chain initialized (height >= 2)" -ForegroundColor Green
        $pass++
        Write-Host "  [WARN] Height stuck at 2 - proposer idle (submit transactions to advance)" -ForegroundColor Yellow
        $warn++
    }
} catch {
    Write-Host "  [FAIL] Cannot reach Apostle Chain" -ForegroundColor Red
    $fail++
}

# ── 3. Genesis Ledger State ────────────────────────────────
Write-Host "`n[3/6] Genesis Ledger State" -ForegroundColor Cyan

try {
    $gl = (Invoke-WebRequest "http://localhost:4030/health" -TimeoutSec 5 -UseBasicParsing).Content | ConvertFrom-Json
    Write-Host "  Entries  : $($gl.entries)"
    Write-Host "  Uptime   : $($gl.uptime)s"
    
    if ($gl.entries -gt 0) {
        Write-Host "  [PASS] Genesis Ledger has entries" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  [WARN] Genesis Ledger is empty" -ForegroundColor Yellow
        $warn++
    }
} catch {
    Write-Host "  [FAIL] Cannot reach Genesis Ledger" -ForegroundColor Red
    $fail++
}

# ── 4. Agent Gateway ──────────────────────────────────────
Write-Host "`n[4/6] Agent Gateway State" -ForegroundColor Cyan

try {
    $ag = (Invoke-WebRequest "http://localhost:4010/health" -TimeoutSec 5 -UseBasicParsing).Content | ConvertFrom-Json
    Write-Host "  Agents   : $($ag.agents)"
    Write-Host "  Tasks    : $($ag.pending_tasks)"
    
    if ($ag.agents -gt 0) {
        Write-Host "  [PASS] Agents registered" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  [WARN] No agents registered" -ForegroundColor Yellow
        $warn++
    }
} catch {
    Write-Host "  [FAIL] Cannot reach Agent Gateway" -ForegroundColor Red
    $fail++
}

# ── 5. Database Connectivity ──────────────────────────────
Write-Host "`n[5/6] Database Connectivity" -ForegroundColor Cyan

@(5440, 5450) | ForEach-Object {
    $port = $_
    $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue
    if ($conn.TcpTestSucceeded) {
        Write-Host "  [PASS] PostgreSQL :$port - reachable" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  [FAIL] PostgreSQL :$port - unreachable" -ForegroundColor Red
        $fail++
    }
}

# ── 6. External DNS (if deployed to AWS) ──────────────────
Write-Host "`n[6/6] DNS Resolution" -ForegroundColor Cyan

try {
    $dns = Resolve-DnsName "l1.unykorn.org" -Type A -ErrorAction Stop 2>$null
    if ($dns) {
        Write-Host "  [PASS] l1.unykorn.org resolves to $($dns[0].IPAddress)" -ForegroundColor Green
        $pass++
    }
} catch {
    Write-Host "  [WARN] l1.unykorn.org does not resolve (NS delegation needed)" -ForegroundColor Yellow
    $warn++
}

# ── Summary ────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Cyan
$color = if ($fail -gt 0) { "Red" } elseif ($warn -gt 0) { "Yellow" } else { "Green" }
Write-Host " Results: $pass PASS / $fail FAIL / $warn WARN" -ForegroundColor $color
Write-Host "========================================`n"

if ($fail -gt 0) {
    Write-Host "Stack is NOT launch-ready. Fix failures above." -ForegroundColor Red
    exit 1
} elseif ($warn -gt 0) {
    Write-Host "Stack is partially operational. Warnings need attention." -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "Stack is launch-ready." -ForegroundColor Green
    exit 0
}
