<#
.SYNOPSIS
    Deploy UNYKORN x402 payment-gated edge proxy to Cloudflare.

.EXAMPLE
    .\deploy-x402-proxy.ps1
    .\deploy-x402-proxy.ps1 -RoutesOnly
    .\deploy-x402-proxy.ps1 -SetJwtSecret
#>
param(
    [switch]$RoutesOnly,
    [switch]$StagingRoutesOnly,
    [switch]$SetJwtSecret,
    [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN,
    [string]$AccountId = "07bcc4a189ef176261b818409c95891f"
)

$WorkerDir = Split-Path $PSScriptRoot -Parent

if (-not $ApiToken) {
    Write-Host "Set CLOUDFLARE_API_TOKEN or pass -ApiToken" -ForegroundColor Red
    exit 1
}

$env:CLOUDFLARE_API_TOKEN = $ApiToken
$env:CLOUDFLARE_ACCOUNT_ID = $AccountId

# Staging-first routes (safe — no api.unykorn.org conflict). Use -ProductionRoutes for api cutover.
$stagingRoutes = @(
    @{ zone = "drunks.app";       pattern = "pay.drunks.app/*";       script = "unykorn-x402-proxy" },
    @{ zone = "unykorn.org";      pattern = "paid.unykorn.org/*";     script = "unykorn-x402-proxy" }
)

$domainRoutes = @(
    @{ zone = "unykorn.org";      pattern = "api.unykorn.org/*";      script = "unykorn-x402-proxy" },
    @{ zone = "drunks.app";       pattern = "drunks.app/*";           script = "unykorn-x402-proxy" },
    @{ zone = "drunks.app";       pattern = "www.drunks.app/*";       script = "unykorn-x402-proxy" },
    @{ zone = "heliosdigital.xyz"; pattern = "heliosdigital.xyz/*";   script = "unykorn-x402-proxy" },
    @{ zone = "heliosdigital.xyz"; pattern = "www.heliosdigital.xyz/*"; script = "unykorn-x402-proxy" },
    @{ zone = "optkas.org";       pattern = "dr.optkas.org/*";        script = "unykorn-x402-proxy" },
    @{ zone = "nil33.com";        pattern = "nil33.com/*";            script = "unykorn-x402-proxy" },
    @{ zone = "nil33.com";        pattern = "www.nil33.com/*";        script = "unykorn-x402-proxy" },
    @{ zone = "xxxiii.io";        pattern = "xxxiii.io/*";            script = "unykorn-x402-proxy" },
    @{ zone = "y3kmarkets.com";   pattern = "y3kmarkets.com/*";       script = "unykorn-x402-proxy" },
    @{ zone = "y3kmarkets.com";   pattern = "www.y3kmarkets.com/*";   script = "unykorn-x402-proxy" },
    @{ zone = "etrenzik.com";     pattern = "etrenzik.com/*";         script = "unykorn-x402-proxy" },
    @{ zone = "mensofgod.com";    pattern = "mensofgod.com/*";        script = "unykorn-x402-proxy" }
)

function Get-ZoneId($name) {
    $h = @{ Authorization = "Bearer $ApiToken" }
    (Invoke-RestMethod "https://api.cloudflare.com/client/v4/zones?name=$name" -Headers $h).result[0].id
}

if ($RoutesOnly -or $StagingRoutesOnly) {
    $routesToAttach = if ($StagingRoutesOnly) { $stagingRoutes } else { $domainRoutes }
    $h = @{ Authorization = "Bearer $ApiToken"; "Content-Type" = "application/json" }
    foreach ($r in $routesToAttach) {
        $zoneId = Get-ZoneId $r.zone
        $body = @{ pattern = $r.pattern; script = $r.script } | ConvertTo-Json
        try {
            Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/workers/routes" -Headers $h -Body $body | Out-Null
            Write-Host "[OK] $($r.pattern) -> $($r.script)" -ForegroundColor Green
        } catch {
            Write-Host "[SKIP] $($r.pattern) - $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    exit 0
}

Push-Location $WorkerDir
if (-not (Test-Path node_modules)) { npm install }
if ($SetJwtSecret) {
    $secret = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
    $secret | wrangler secret put JWT_SECRET
}
wrangler deploy
Pop-Location

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deploy OK. Run with -RoutesOnly to attach zone routes (review conflicts first)." -ForegroundColor Green
}
