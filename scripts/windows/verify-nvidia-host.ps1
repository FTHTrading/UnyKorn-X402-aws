# ===========================================================================
# verify-nvidia-host.ps1 — Windows pre-flight checks for RTX 5090 workstation
# ===========================================================================
# Usage:  .\scripts\windows\verify-nvidia-host.ps1
# Returns exit code 0 if all required checks pass, 1 otherwise.
# ===========================================================================

$ErrorActionPreference = 'SilentlyContinue'
$pass = 0; $fail = 0; $warn = 0

function Ok($label, $detail) {
    Write-Host "  [PASS] $label$(if ($detail) { " - $detail" })" -ForegroundColor Green
    $script:pass++
}
function Bad($label, $detail) {
    Write-Host "  [FAIL] $label$(if ($detail) { " - $detail" })" -ForegroundColor Red
    $script:fail++
}
function Warn($label, $detail) {
    Write-Host "  [WARN] $label$(if ($detail) { " - $detail" })" -ForegroundColor Yellow
    $script:warn++
}

Write-Host ""
Write-Host "=========================================================="
Write-Host " NVIDIA RTX 5090 Workstation - Windows Host Verification"
Write-Host "=========================================================="
Write-Host ""

# ── 1. NVIDIA Driver ─────────────────────────────────────────
Write-Host "[1/8] NVIDIA Driver"

$smi = & nvidia-smi --query-gpu=driver_version,name,memory.total --format=csv,noheader 2>$null
if ($LASTEXITCODE -eq 0 -and $smi) {
    $parts = $smi -split ',\s*'
    Ok "NVIDIA driver installed" "v$($parts[0])"
    Ok "GPU detected" "$($parts[1]) ($($parts[2]))"
} else {
    Bad "nvidia-smi not found or failed" "Install NVIDIA driver from https://www.nvidia.com/drivers"
}

# ── 2. CUDA Toolkit ──────────────────────────────────────────
Write-Host "`n[2/8] CUDA Toolkit"

$nvcc = & nvcc --version 2>$null | Select-String "release"
if ($nvcc) {
    $ver = ($nvcc -replace '.*release\s+', '') -replace ',.*', ''
    Ok "CUDA Toolkit installed" "v$ver"
} else {
    Bad "nvcc not found" "Install CUDA Toolkit from https://developer.nvidia.com/cuda-downloads"
}

$cudaPath = $env:CUDA_PATH
if ($cudaPath -and (Test-Path $cudaPath)) {
    Ok "CUDA_PATH set" $cudaPath
} else {
    Warn "CUDA_PATH not set or invalid" "Set after CUDA Toolkit install"
}

# ── 3. WSL2 ──────────────────────────────────────────────────
Write-Host "`n[3/8] WSL2"

$wslStatus = & wsl --status 2>$null | Out-String
if ($LASTEXITCODE -eq 0) {
    Ok "WSL2 enabled"
    $distros = (& wsl -l -q 2>$null) -replace "`0","" | Where-Object { $_ -match '\S' }
    if ($distros -match 'Ubuntu') {
        Ok "Ubuntu distro found"
    } else {
        Bad "No Ubuntu distro" "Run: wsl --install -d Ubuntu"
    }
} else {
    Bad "WSL2 not enabled" "Run: wsl --install"
}

$wslconfig = Join-Path $env:USERPROFILE ".wslconfig"
if (Test-Path $wslconfig) {
    $content = Get-Content $wslconfig -Raw
    if ($content -match 'memory\s*=\s*(\d+)') {
        $mem = [int]$Matches[1]
        if ($mem -ge 16) {
            Ok ".wslconfig memory" "${mem}GB (sufficient)"
        } else {
            Warn ".wslconfig memory" "${mem}GB (recommend 16GB+ for Triton + containers)"
        }
    }
} else {
    Warn ".wslconfig not found" "Create one with memory=16GB minimum"
}

# ── 4. Docker Desktop ────────────────────────────────────────
Write-Host "`n[4/8] Docker Desktop"

$dockerVer = & docker version --format '{{.Server.Version}}' 2>$null
if ($dockerVer) {
    Ok "Docker Desktop installed" "v$dockerVer"

    $dockerOS = & docker info --format '{{.OperatingSystem}}' 2>$null
    if ($dockerOS -match 'Docker Desktop|WSL') {
        Ok "Docker using WSL2 backend" $dockerOS
    } else {
        Warn "Docker backend unconfirmed" "Enable WSL2 integration in Docker Desktop settings"
    }

    # Check for GPU runtime
    $gpuTest = & docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi 2>$null | Select-String "RTX"
    if ($gpuTest) {
        Ok "Docker GPU passthrough working"
    } else {
        Warn "Docker GPU test inconclusive" "Ensure NVIDIA Container Toolkit is configured"
    }
} else {
    Bad "Docker not found" "Install Docker Desktop 4.33.0+ from https://docker.com"
}

# ── 5. Ollama ────────────────────────────────────────────────
Write-Host "`n[5/8] Ollama"

try {
    $ollamaHealth = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
    $modelCount = $ollamaHealth.models.Count
    Ok "Ollama running" "$modelCount models available"
} catch {
    Warn "Ollama not reachable at localhost:11434" "Start with: ollama serve"
}

# ── 6. OpenClaw Gateway ──────────────────────────────────────
Write-Host "`n[6/8] OpenClaw Gateway"

try {
    $gwHealth = Invoke-RestMethod -Uri "http://localhost:18789/health" -TimeoutSec 3
    Ok "OpenClaw Gateway healthy"
} catch {
    Warn "OpenClaw Gateway not reachable" "Start with: openclaw gateway --port 18789"
}

# ── 7. Optional: Nsight, Broadcast ───────────────────────────
Write-Host "`n[7/8] Optional NVIDIA Tools"

$nsightSys = Get-Command "nsys" -ErrorAction SilentlyContinue
if (-not $nsightSys) {
    $nsightSysPath = Get-ChildItem "C:\Program Files\NVIDIA Corporation\Nsight Systems*\target-windows-x64\nsys.exe" -ErrorAction SilentlyContinue | Sort-Object FullName | Select-Object -Last 1
    if ($nsightSysPath) { $nsightSys = $nsightSysPath }
}
if ($nsightSys) {
    $src = if ($nsightSys.Source) { $nsightSys.Source } else { $nsightSys.FullName }
    Ok "Nsight Systems available" $src
} else {
    Warn "Nsight Systems not in PATH" "Install from CUDA Toolkit or https://developer.nvidia.com/nsight-systems"
}

$nsightComp = Get-Command "ncu" -ErrorAction SilentlyContinue
if ($nsightComp) {
    Ok "Nsight Compute available" $nsightComp.Source
} else {
    Warn "Nsight Compute not in PATH" "Install from CUDA Toolkit or https://developer.nvidia.com/nsight-compute"
}

$broadcast = Get-ItemProperty "HKLM:\SOFTWARE\NVIDIA Corporation\NVIDIA Broadcast" -ErrorAction SilentlyContinue
if ($broadcast) {
    Ok "NVIDIA Broadcast installed"
} else {
    Warn "NVIDIA Broadcast not detected" "Optional: download from https://www.nvidia.com/broadcast"
}

# ── 8. Triton (container) ────────────────────────────────────
Write-Host "`n[8/8] Triton Inference Server"

try {
    $tritonHealth = Invoke-RestMethod -Uri "http://localhost:8000/v2/health/ready" -TimeoutSec 3
    Ok "Triton Inference Server running and ready"
} catch {
    Warn "Triton not reachable at localhost:8000" "Deploy with: docker compose -f docker/docker-compose.triton.yml up -d"
}

# ── Summary ───────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================================="
Write-Host " Results: $pass passed, $fail failed, $warn warnings"
Write-Host "=========================================================="
Write-Host ""

if ($fail -gt 0) {
    Write-Host "  VERIFICATION FAILED - fix required items above" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  HOST VERIFIED" -ForegroundColor Green
    exit 0
}
