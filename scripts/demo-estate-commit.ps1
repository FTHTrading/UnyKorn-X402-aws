# AGAPE demo - Memorial Commitment proof bundle (no Anchor required)
# Simulates what commit_content would anchor on-chain.

param(
    [string]$EstateName = "kevan.fth.estate",
    [string]$IpfsCid = "QmDemoSportsMoment2026",
    [string]$ArweaveTx = "arweave-tx-demo-legacy-001",
    [string]$ContentType = "video/athletic-highlight",
    [int]$CreatorBps = 6000,
    [int]$InfraBps = 2000,
    [int]$FamilyBps = 2000
)

$ErrorActionPreference = "Stop"

function Get-Sha256Hex {
    param([byte[]]$Bytes)
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($Bytes)
    -join ($hash | ForEach-Object { $_.ToString("x2") })
}

function Get-EstateId {
    param([string]$Name)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Name)
    $h = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    [BitConverter]::ToUInt64($h, 0)
}

$l1 = [System.Text.Encoding]::UTF8.GetBytes($IpfsCid)
$l2 = [System.Text.Encoding]::UTF8.GetBytes($ArweaveTx)
$concat = New-Object byte[] ($l1.Length + $l2.Length)
[Array]::Copy($l1, 0, $concat, 0, $l1.Length)
[Array]::Copy($l2, 0, $concat, $l1.Length, $l2.Length)
$rootHash = Get-Sha256Hex -Bytes $concat
$estateId = Get-EstateId -Name $EstateName

$bundle = [ordered]@{
    manifest        = "AGAPE Manifest of Authority - Memorial Commitment"
    estate_name     = $EstateName
    estate_id       = $estateId
    proof_bundle    = [ordered]@{
        ipfs_cid          = $IpfsCid
        arweave_tx        = $ArweaveTx
        content_type      = $ContentType
        rights_split_bps  = @($CreatorBps, $InfraBps, $FamilyBps)
    }
    l3_root_hash    = $rootHash
    pdas_would_init = [ordered]@{
        creator_estate     = "seeds: [estate, creator, estate_name]"
        content_commitment = "seeds: [commitment, estate, commitment_index]"
        creator_vault      = "seeds: [vault, estate]; run initialize_vault first"
        estate_anchor      = "seeds: [estate_anchor, estate]"
    }
    access_lease_demo = [ordered]@{
        experience_id = $estateId
        holder        = "<viewer-pubkey>"
        expires_at    = (Get-Date).AddDays(90).ToUniversalTime().ToString("o")
        note          = "Sovereign Proof of Access - non-transferable; not an NFT"
    }
    instruction     = "commit_content"
    program_id      = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
}

$outDir = Join-Path (Join-Path $PSScriptRoot "..") "demo-output"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$outFile = Join-Path $outDir "memorial-commitment-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
$bundle | ConvertTo-Json -Depth 6 | Set-Content -Path $outFile -Encoding utf8

Write-Host ""
Write-Host "=== AGAPE Memorial Commitment (demo) ===" -ForegroundColor Cyan
Write-Host "Estate:       $EstateName"
Write-Host "Estate ID:    $estateId"
Write-Host "L3 root_hash: $rootHash"
Write-Host "Rights bps:   $CreatorBps / $InfraBps / $FamilyBps"
Write-Host ""
Write-Host "Would call:   commit_content(proof_bundle)" -ForegroundColor Yellow
Write-Host "Saved:        $outFile" -ForegroundColor Green
Write-Host ""
Write-Host "Next on-chain steps (after anchor deploy):" -ForegroundColor DarkGray
Write-Host "  1. register_identity"
Write-Host "  2. initialize_vault (family_trust pubkey)"
Write-Host "  3. commit_content (this bundle)"
Write-Host "  4. record_access_lease (holder, expires_at)"
Write-Host ""
