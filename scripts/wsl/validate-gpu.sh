#!/usr/bin/env bash
# ===========================================================================
# validate-gpu.sh — GPU runtime validation from WSL
# ===========================================================================
# Usage: bash scripts/wsl/validate-gpu.sh
# ===========================================================================
set -uo pipefail

echo ""
echo "=========================================================="
echo " GPU Runtime Quick Check"
echo "=========================================================="
echo ""

echo "── nvidia-smi ─────────────────────────────"
nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free,temperature.gpu,utilization.gpu \
    --format=csv,noheader 2>/dev/null || echo "  nvidia-smi not available"

echo ""
echo "── CUDA version ─────────────────────────────"
nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1
nvcc --version 2>/dev/null | grep "release" || echo "  nvcc not installed (expected in WSL — CUDA comes from Windows driver)"

echo ""
echo "── Docker GPU ─────────────────────────────"
docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 \
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null \
    || echo "  Docker GPU test failed"

echo ""
echo "── GPU processes ─────────────────────────────"
nvidia-smi --query-compute-apps=pid,process_name,used_memory \
    --format=csv,noheader 2>/dev/null || echo "  No GPU processes or nvidia-smi unavailable"

echo ""
echo "── Triton ─────────────────────────────────"
curl -sf http://localhost:8000/v2/health/ready > /dev/null 2>&1 \
    && echo "  Triton: READY" \
    || echo "  Triton: NOT RUNNING"

echo ""
echo "── Ollama ─────────────────────────────────"
curl -sf http://localhost:11434/api/tags > /dev/null 2>&1 \
    && echo "  Ollama: RUNNING" \
    || echo "  Ollama: NOT RUNNING"

echo ""
