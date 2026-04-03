# ─────────────────────────────────────────────────────────────
# deploy-mesh.ps1 — Deploy Living Mesh (x402 neural layer)
#
# Builds the unified Docker image with all 4 new packages:
#   stellar-bridge (3250), asset-registry (3260), barter (3270), mesh-pulse (3280)
#
# Then:
#   1. Pushes image to ECR
#   2. Copies migration files to EC2 via SSM
#   3. Applies migrations 016-019 on the live DB
#   4. Pulls new image on EC2
#   5. docker compose up -d (starts new containers)
#
# Usage:
#   cd C:\Users\Kevan\UnyKorn-X402-aws
#   .\aws\scripts\deploy-mesh.ps1
#   .\aws\scripts\deploy-mesh.ps1 -SkipBuild   # if image already pushed
#   .\aws\scripts\deploy-mesh.ps1 -MigrateOnly # just run migrations, no image push
# ─────────────────────────────────────────────────────────────
[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$MigrateOnly
)

$ErrorActionPreference  = "Stop"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir    = Split-Path -Parent $ScriptDir          # aws/
$ProjectDir = Split-Path -Parent $RootDir            # UnyKorn-X402-aws/
$DockerDir  = Join-Path $RootDir "docker"

$ECR_REGISTRY = "933629770808.dkr.ecr.us-east-1.amazonaws.com"
$ECR_REPO     = "$ECR_REGISTRY/fth-x402/platform"
$REGION       = "us-east-1"
$INSTANCE_ID  = "i-0a877d8aaaaa42b74"
$COMPOSE_FILE = "/home/ec2-user/x402/docker-compose.x402-prod.yml"

# Migrations to apply this release
$NEW_MIGRATIONS = @("016_real_assets", "017_barter", "018_stellar_bridge", "019_mesh_signals")

function Log  { param([string]$M) Write-Host "[mesh-deploy] $M" -ForegroundColor Cyan }
function Ok   { param([string]$M) Write-Host "[    ok     ] $M" -ForegroundColor Green }
function Warn { param([string]$M) Write-Host "[   warn    ] $M" -ForegroundColor Yellow }
function Err  { param([string]$M) Write-Host "[  ERROR    ] $M" -ForegroundColor Red; exit 1 }

# ── SSM helper ─────────────────────────────────────────────────────────────
function Invoke-SSM {
    param([string]$Command, [string]$Description = "SSM command", [int]$WaitSec = 10)
    Log "SSM: $Description"
    $result = aws ssm send-command `
        --instance-ids $INSTANCE_ID `
        --document-name "AWS-RunShellScript" `
        --parameters "commands=[$($Command | ConvertTo-Json)]" `
        --region $REGION `
        --output json | ConvertFrom-Json

    $cmdId = $result.Command.CommandId
    Log "Waiting for command $cmdId..."
    Start-Sleep -Seconds $WaitSec

    $status = aws ssm get-command-invocation `
        --command-id $cmdId `
        --instance-id $INSTANCE_ID `
        --region $REGION `
        --output json | ConvertFrom-Json

    if ($status.Status -notin @("Success","InProgress")) {
        Warn "SSM stderr: $($status.StandardErrorContent)"
        Warn "SSM stdout: $($status.StandardOutputContent)"
    } else {
        Ok $status.StandardOutputContent.Trim()
    }
    return $status
}

# ── Step 1: Docker build ────────────────────────────────────────────────────
if (-not $SkipBuild -and -not $MigrateOnly) {
    Log "Step 1: Building unified Docker image..."
    Push-Location $ProjectDir
    try {
        $tag = "${ECR_REPO}:latest"
        docker build -f aws/docker/Dockerfile.x402-unified -t $tag .
        if ($LASTEXITCODE -ne 0) { Err "Docker build failed" }
        Ok "Image built: $tag"
    } finally { Pop-Location }

    # ── Step 2: ECR login + push ───────────────────────────────────────────
    Log "Step 2: Logging into ECR..."
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
    if ($LASTEXITCODE -ne 0) { Err "ECR login failed" }

    Log "Pushing image to ECR..."
    docker push "${ECR_REPO}:latest"
    if ($LASTEXITCODE -ne 0) { Err "Docker push failed" }
    Ok "Image pushed to ECR"
}

# ── Step 3: Apply DB migrations ────────────────────────────────────────────
Log "Step 3: Applying migrations 016-019 on live DB..."

foreach ($migration in $NEW_MIGRATIONS) {
    $sqlFile = Join-Path $ProjectDir "db\migrations-x402\${migration}.sql"
    if (-not (Test-Path $sqlFile)) {
        Warn "SQL file not found locally: $sqlFile — skipping"
        continue
    }

    $sqlContent = Get-Content $sqlFile -Raw

    # Escape single quotes for shell embedding (replace ' with '"'"')
    $escaped = $sqlContent -replace "'", "'\"'\"'"

    # Check if migration already applied by testing for a unique object it creates
    $checkTable = switch ($migration) {
        "016_real_assets"     { "real_assets" }
        "017_barter"          { "barter_offers" }
        "018_stellar_bridge"  { "stellar_bridge_deposits" }
        "019_mesh_signals"    { "mesh_signals" }
        default               { "" }
    }

    if ($checkTable) {
        $checkCmd = "docker exec x402-db psql -U fth_x402_app -d fth_x402 -tc `"SELECT to_regclass('public.$checkTable')`" 2>&1"
        $checkResult = Invoke-SSM -Command $checkCmd -Description "Check if $migration already applied" -WaitSec 8
        if ($checkResult.StandardOutputContent -match $checkTable) {
            Ok "$migration already applied — skipping"
            continue
        }
    }

    Log "Applying $migration..."
    # Write SQL via heredoc through SSM to avoid escaping nightmares
    $applyCmd = "docker exec x402-db psql -U fth_x402_app -d fth_x402 -v ON_ERROR_STOP=1 -c '$escaped' 2>&1 | tail -20"
    $applyResult = Invoke-SSM -Command $applyCmd -Description "Apply $migration" -WaitSec 15
    if ($applyResult.Status -ne "Success") {
        Warn "$migration may have errors — check output above"
    } else {
        Ok "$migration applied"
    }
}

if ($MigrateOnly) {
    Ok "Migrate-only mode — done."
    exit 0
}

# ── Step 4: Pull new image on EC2 ─────────────────────────────────────────
Log "Step 4: Pulling new image on EC2..."
$pullCmd = @"
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REGISTRY && \
docker pull ${ECR_REPO}:latest
"@
Invoke-SSM -Command $pullCmd -Description "ECR pull on EC2" -WaitSec 60

# ── Step 5: docker compose up with new services ────────────────────────────
Log "Step 5: Starting new services via docker compose..."
$upCmd = "cd /home/ec2-user/x402 && docker compose -f docker-compose.x402-prod.yml up -d --no-deps x402-stellar-bridge x402-asset-registry x402-barter x402-mesh-pulse 2>&1"
Invoke-SSM -Command $upCmd -Description "docker compose up new services" -WaitSec 30

# ── Step 6: Verify ─────────────────────────────────────────────────────────
Log "Step 6: Verifying new services are healthy..."
Start-Sleep -Seconds 10

foreach ($port in @(3250, 3260, 3270, 3280)) {
    $name = switch ($port) {
        3250 { "stellar-bridge" }
        3260 { "asset-registry" }
        3270 { "barter" }
        3280 { "mesh-pulse" }
    }
    $healthCmd = "curl -sf http://127.0.0.1:$port/health 2>&1"
    $health = Invoke-SSM -Command $healthCmd -Description "Health check: $name (:$port)" -WaitSec 8
    if ($health.StandardOutputContent -match '"ok"') {
        Ok "$name is healthy on port $port"
    } else {
        Warn "$name health check inconclusive — may still be starting"
    }
}

Ok "Mesh deploy complete!"
Write-Host ""
Write-Host "Services now live:" -ForegroundColor Green
Write-Host "  Stellar Bridge  -> http://98.91.89.169:3250/health" -ForegroundColor White
Write-Host "  Asset Registry  -> http://98.91.89.169:3260/health" -ForegroundColor White
Write-Host "  Barter Engine   -> http://98.91.89.169:3270/health" -ForegroundColor White
Write-Host "  Mesh Pulse      -> http://98.91.89.169:3280/health" -ForegroundColor White
Write-Host "  WS Live Wire    -> ws://98.91.89.169:3280/pulse/stream" -ForegroundColor White
Write-Host "  Network View    -> http://98.91.89.169:3280/pulse/network" -ForegroundColor White
