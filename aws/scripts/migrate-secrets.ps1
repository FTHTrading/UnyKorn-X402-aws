<#
.SYNOPSIS
  Populates AWS Secrets Manager with real values from local .env files.
  Secret VALUES are written via temp file (never appear as CLI args or in stdout).

.DESCRIPTION
  Reads two .env files:
    - UnyKorn-X402-aws/.env      (x402 monorepo)
    - projects/fth-pay/packages/api/.env  (FTH Pay API)

  Groups variables into categorized secrets and calls
  `aws secretsmanager put-secret-value` for each.

.PREREQUISITES
  - AWS CLI configured with appropriate permissions (secretsmanager:PutSecretValue,
    secretsmanager:CreateSecret, kms:GenerateDataKey)
  - Both .env files exist at the expected paths
  - Terraform secrets module already applied (secret containers exist)

.USAGE
  cd C:\Users\Kevan\UnyKorn-X402-aws
  .\aws\scripts\migrate-secrets.ps1

  To dry-run (show secret IDs and key counts, no write):
  .\aws\scripts\migrate-secrets.ps1 -DryRun
#>
param(
  [switch]$DryRun
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ??? Paths ????????????????????????????????????????????????????????????????????
$X402EnvPath  = Join-Path $PSScriptRoot "..\..\.env" | Resolve-Path
$FthPayEnvPath = "C:\Users\Kevan\projects\fth-pay\packages\api\.env"

if (-not (Test-Path $X402EnvPath))   { throw "x402 .env not found: $X402EnvPath" }
if (-not (Test-Path $FthPayEnvPath)) { throw "fth-pay .env not found: $FthPayEnvPath" }

# ??? Helper: parse .env file ? hashtable ??????????????????????????????????????
function Read-EnvFile {
  param([string]$Path)
  $env = @{}
  Get-Content $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line -match '=') {
      $idx   = $line.IndexOf('=')
      $key   = $line.Substring(0, $idx).Trim()
      $value = $line.Substring($idx + 1).Trim()
      # Strip surrounding quotes if present
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $env[$key] = $value
    }
  }
  return $env
}

# ??? Helper: write a secret safely (via temp file) ????????????????????????????
function Write-Secret {
  param(
    [string]$SecretId,
    [hashtable]$Keys,
    [hashtable]$EnvData,
    [switch]$DryRun
  )

  # Build JSON from the requested keys; skip missing ones
  $obj = [ordered]@{}
  foreach ($key in $Keys.Keys) {
    $alias = $Keys[$key]   # allow remapping; alias = SM key name
    if ($EnvData.ContainsKey($key)) {
      $obj[$alias] = $EnvData[$key]
    }
  }

  if ($obj.Count -eq 0) {
    Write-Warning "  [$SecretId] No matching keys found -- skipping."
    return
  }

  $json = $obj | ConvertTo-Json -Compress -Depth 1

  if ($DryRun) {
    Write-Host "  [DRY-RUN] $SecretId -- would write $($obj.Count) key(s): $($obj.Keys -join ', ')" -ForegroundColor Cyan
    return
  }

  # Write via temp file to avoid secret appearing in process args
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.Encoding]::UTF8)
    $result = aws secretsmanager put-secret-value `
      --secret-id $SecretId `
      --secret-string "file://$tmp" 2>&1

    # The AWS CLI output here contains only metadata (ARN, version) -- safe to print
    $parsed = $result | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "  [$SecretId] AWS CLI returned non-zero: $result"
    } else {
      Write-Host "  [OK] $SecretId -- $($obj.Count) key(s) written (version: $($parsed.VersionId))" -ForegroundColor Green
    }
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

# ??? Load env files ???????????????????????????????????????????????????????????
Write-Host "Loading .env files..." -ForegroundColor Yellow
$x402  = Read-EnvFile $X402EnvPath
$fth   = Read-EnvFile $FthPayEnvPath
Write-Host "  x402 vars loaded: $($x402.Count)"
Write-Host "  fth-pay vars loaded: $($fth.Count)"
Write-Host ""

if ($DryRun) {
  Write-Host "=== DRY RUN -- no changes will be made ===" -ForegroundColor Yellow
  Write-Host ""
}

# ??? x402 Application Credentials ????????????????????????????????????????????
Write-Host "[1/8] x402 application credentials..." -ForegroundColor Yellow
Write-Secret -SecretId "unykorn/x402/app" -DryRun:$DryRun -EnvData $x402 -Keys @{
  ADMIN_API_TOKEN        = 'ADMIN_API_TOKEN'
  FTH_SERVICE_SECRET     = 'FTH_SERVICE_SECRET'
  FTH_SIGNING_KEY        = 'FTH_SIGNING_KEY'
  TREASURY_MASTER_KEY    = 'TREASURY_MASTER_KEY'
  OPERATOR_WEBHOOK_SECRET = 'OPERATOR_WEBHOOK_SECRET'
}

# ??? FTH Pay Core App Credentials ????????????????????????????????????????????
Write-Host "[2/8] FTH Pay core app credentials..." -ForegroundColor Yellow
Write-Secret -SecretId "unykorn/fth-pay/app" -DryRun:$DryRun -EnvData $fth -Keys @{
  JWT_SECRET           = 'JWT_SECRET'
  JWT_REFRESH_SECRET   = 'JWT_REFRESH_SECRET'
  ENCRYPTION_KEY       = 'ENCRYPTION_KEY'
  ENCRYPTION_IV        = 'ENCRYPTION_IV'
  VAULT_MASTER_PASSWORD = 'VAULT_MASTER_PASSWORD'
  KEYSTORE_PASSWORD    = 'KEYSTORE_PASSWORD'
}

# ??? FTH Pay EVM Treasury Keys ????????????????????????????????????????????????
Write-Host "[3/8] FTH Pay EVM treasury keys..." -ForegroundColor Yellow
Write-Secret -SecretId "unykorn/fth-pay/blockchain-evm" -DryRun:$DryRun -EnvData $fth -Keys @{
  ETHEREUM_TREASURY_PRIVATE_KEY = 'ETHEREUM_TREASURY_PRIVATE_KEY'
  ETHEREUM_TREASURY_ADDRESS     = 'ETHEREUM_TREASURY_ADDRESS'
  EVM_TREASURY_PRIVATE_KEY      = 'EVM_TREASURY_PRIVATE_KEY'
  EVM_TREASURY_ADDRESS          = 'EVM_TREASURY_ADDRESS'
  POLYGON_TREASURY_PRIVATE_KEY  = 'POLYGON_TREASURY_PRIVATE_KEY'
  POLYGON_TREASURY_ADDRESS      = 'POLYGON_TREASURY_ADDRESS'
}

# ??? FTH Pay XRPL Keys ????????????????????????????????????????????????????????
Write-Host "[4/8] FTH Pay XRPL keys..." -ForegroundColor Yellow
Write-Secret -SecretId "unykorn/fth-pay/blockchain-xrpl" -DryRun:$DryRun -EnvData $fth -Keys @{
  XRPL_TREASURY_ADDRESS       = 'XRPL_TREASURY_ADDRESS'
  XRPL_TREASURY_SECRET        = 'XRPL_TREASURY_SECRET'
  XRPL_UNY_ISSUER_ADDRESS     = 'XRPL_UNY_ISSUER_ADDRESS'
  XRPL_UNY_ISSUER_SECRET      = 'XRPL_UNY_ISSUER_SECRET'
  XRPL_USDF_ISSUER_ADDRESS    = 'XRPL_USDF_ISSUER_ADDRESS'
  XRPL_USDF_ISSUER_SECRET     = 'XRPL_USDF_ISSUER_SECRET'
  XRPL_USDF_DISTRIBUTOR_ADDRESS = 'XRPL_USDF_DISTRIBUTOR_ADDRESS'
}

# ??? FTH Pay Stellar Keys ?????????????????????????????????????????????????????
Write-Host "[5/8] FTH Pay Stellar keys..." -ForegroundColor Yellow
Write-Secret -SecretId "unykorn/fth-pay/blockchain-stellar" -DryRun:$DryRun -EnvData $fth -Keys @{
  STELLAR_TREASURY_ADDRESS      = 'STELLAR_TREASURY_ADDRESS'
  STELLAR_TREASURY_SECRET       = 'STELLAR_TREASURY_SECRET'
  STELLAR_FTH_ISSUER            = 'STELLAR_FTH_ISSUER'
  STELLAR_FTH_ISSUER_SECRET     = 'STELLAR_FTH_ISSUER_SECRET'
  STELLAR_OPTKAS_ANCHOR         = 'STELLAR_OPTKAS_ANCHOR'
  STELLAR_OPTKAS_ANCHOR_SECRET  = 'STELLAR_OPTKAS_ANCHOR_SECRET'
  STELLAR_OPTKAS_DISTRIB        = 'STELLAR_OPTKAS_DISTRIB'
  STELLAR_OPTKAS_DISTRIB_SECRET = 'STELLAR_OPTKAS_DISTRIB_SECRET'
  STELLAR_OPTKAS_ISSUER         = 'STELLAR_OPTKAS_ISSUER'
  STELLAR_OPTKAS_ISSUER_SECRET  = 'STELLAR_OPTKAS_ISSUER_SECRET'
  STELLAR_USDF_ISSUER           = 'STELLAR_USDF_ISSUER'
  STELLAR_USDF_ISSUER_SECRET    = 'STELLAR_USDF_ISSUER_SECRET'
}

# ??? FTH Pay Bitcoin / Solana / Tron Keys ????????????????????????????????????
Write-Host "[6/8] FTH Pay Bitcoin / Solana / Tron keys..." -ForegroundColor Yellow
Write-Secret -SecretId "unykorn/fth-pay/blockchain-other" -DryRun:$DryRun -EnvData $fth -Keys @{
  BITCOIN_TREASURY_ADDRESS   = 'BITCOIN_TREASURY_ADDRESS'
  BITCOIN_TREASURY_WIF       = 'BITCOIN_TREASURY_WIF'
  SOLANA_TREASURY_ADDRESS    = 'SOLANA_TREASURY_ADDRESS'
  SOLANA_TREASURY_SECRET_KEY = 'SOLANA_TREASURY_SECRET_KEY'
  TRON_TREASURY_ADDRESS      = 'TRON_TREASURY_ADDRESS'
  TRON_TREASURY_PRIVATE_KEY  = 'TRON_TREASURY_PRIVATE_KEY'
}

# ??? FTH Pay Third-Party API Keys ????????????????????????????????????????????
Write-Host "[7/8] FTH Pay third-party API keys..." -ForegroundColor Yellow
Write-Secret -SecretId "unykorn/fth-pay/api-keys" -DryRun:$DryRun -EnvData $fth -Keys @{
  OPENAI_API_KEY            = 'OPENAI_API_KEY'
  OPENAI_API_KEY_SECONDARY  = 'OPENAI_API_KEY_SECONDARY'
  ELEVENLABS_API_KEY        = 'ELEVENLABS_API_KEY'
  TELNYX_API_KEY            = 'TELNYX_API_KEY'
  TELNYX_WEBHOOK_SECRET     = 'TELNYX_WEBHOOK_SECRET'
  STRIPE_SECRET_KEY         = 'STRIPE_SECRET_KEY'
  STRIPE_WEBHOOK_SECRET     = 'STRIPE_WEBHOOK_SECRET'
  CLOUDFLARE_API_TOKEN      = 'CLOUDFLARE_API_TOKEN'
  TRON_API_KEY              = 'TRON_API_KEY'
}

# ??? FTH Pay Email (Zoho) Credentials ????????????????????????????????????????
Write-Host "[8/8] FTH Pay Zoho email credentials..." -ForegroundColor Yellow
Write-Secret -SecretId "unykorn/fth-pay/email" -DryRun:$DryRun -EnvData $fth -Keys @{
  ZOHO_CLIENT_ID      = 'ZOHO_CLIENT_ID'
  ZOHO_CLIENT_SECRET  = 'ZOHO_CLIENT_SECRET'
  ZOHO_REFRESH_TOKEN  = 'ZOHO_REFRESH_TOKEN'
  ZOHO_ACCOUNT_ID     = 'ZOHO_ACCOUNT_ID'
  ZOHO_FROM_ADDRESS   = 'ZOHO_FROM_ADDRESS'
}

Write-Host ""
if ($DryRun) {
  Write-Host "Dry run complete. Run without -DryRun to apply changes." -ForegroundColor Cyan
} else {
  Write-Host "Migration complete. Verify in AWS Console ? Secrets Manager." -ForegroundColor Green
  Write-Host "Next step: remove plaintext secrets from .env files and reference SM ARNs instead." -ForegroundColor Yellow
}
