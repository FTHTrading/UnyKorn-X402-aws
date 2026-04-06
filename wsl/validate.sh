#!/usr/bin/env bash
# ===========================================================================
# validate.sh — Full WSL2 + GPU runtime validation
# ===========================================================================
# Usage: bash wsl/validate.sh
# ===========================================================================
set -uo pipefail

PASS=0; FAIL=0; WARN=0

ok()   { echo "  [PASS] $1${2:+ - $2}"; ((PASS++)); }
bad()  { echo "  [FAIL] $1${2:+ - $2}"; ((FAIL++)); }
warn() { echo "  [WARN] $1${2:+ - $2}"; ((WARN++)); }

echo ""
echo "=========================================================="
echo " WSL2 GPU Runtime Validation"
echo "=========================================================="

# ── 1. nvidia-smi ─────────────────────────────────────────────
echo ""
echo "[1/6] GPU Visibility"

if command -v nvidia-smi > /dev/null 2>&1; then
    GPU_INFO=$(nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>/dev/null)
    if [ -n "${GPU_INFO}" ]; then
        ok "GPU visible" "${GPU_INFO}"
    else
        bad "nvidia-smi returned empty"
    fi
else
    bad "nvidia-smi not found" "Ensure Windows NVIDIA driver is installed"
fi

# ── 2. CUDA libraries ────────────────────────────────────────
echo ""
echo "[2/6] CUDA Libraries"

if ldconfig -p 2>/dev/null | grep -q libcuda.so; then
    ok "libcuda.so found in linker cache"
else
    warn "libcuda.so not in ldconfig" "Normal for WSL — driver libs are in /usr/lib/wsl/"
fi

if [ -d /usr/lib/wsl/lib ]; then
    ok "WSL CUDA driver path exists" "/usr/lib/wsl/lib"
else
    warn "WSL CUDA path not found" "Check Windows NVIDIA driver version"
fi

# ── 3. Docker ────────────────────────────────────────────────
echo ""
echo "[3/6] Docker"

if command -v docker > /dev/null 2>&1; then
    DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "")
    if [ -n "${DOCKER_VER}" ]; then
        ok "Docker running" "v${DOCKER_VER}"
    else
        bad "Docker daemon not reachable"
    fi
else
    bad "Docker not installed"
fi

# ── 4. Docker GPU test ───────────────────────────────────────
echo ""
echo "[4/6] Docker GPU Passthrough"

if command -v docker > /dev/null 2>&1; then
    GPU_TEST=$(docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo "")
    if [ -n "${GPU_TEST}" ]; then
        ok "Docker GPU passthrough" "${GPU_TEST}"
    else
        bad "Docker GPU test failed" "Check NVIDIA Container Toolkit and docker runtime config"
    fi
else
    bad "Docker not available for GPU test"
fi

# ── 5. NVIDIA Container Toolkit ──────────────────────────────
echo ""
echo "[5/6] NVIDIA Container Toolkit"

if dpkg -l nvidia-container-toolkit 2>/dev/null | grep -q '^ii'; then
    NCT_VER=$(dpkg -l nvidia-container-toolkit 2>/dev/null | grep '^ii' | awk '{print $3}')
    ok "nvidia-container-toolkit installed" "v${NCT_VER}"
else
    bad "nvidia-container-toolkit not installed" "Run bootstrap.sh first"
fi

# ── 6. Triton reachability ────────────────────────────────────
echo ""
echo "[6/6] Triton Inference Server"

TRITON_READY=$(curl -sf http://localhost:8000/v2/health/ready 2>/dev/null || echo "")
if [ -n "${TRITON_READY}" ]; then
    ok "Triton is ready at localhost:8000"
else
    warn "Triton not reachable at localhost:8000" "Deploy with docker compose"
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "=========================================================="
echo " Results: ${PASS} passed, ${FAIL} failed, ${WARN} warnings"
echo "=========================================================="

if [ "${FAIL}" -gt 0 ]; then
    echo "  VALIDATION FAILED" >&2
    exit 1
else
    echo "  WSL GPU RUNTIME VERIFIED"
    exit 0
fi
