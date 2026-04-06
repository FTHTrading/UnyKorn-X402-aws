#!/usr/bin/env bash
# ===========================================================================
# setup-triton.sh — Pull and launch Triton Inference Server
# ===========================================================================
# Usage: bash scripts/wsl/setup-triton.sh
# ===========================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker/docker-compose.triton.yml"

echo ""
echo "=========================================================="
echo " Triton Inference Server — Setup"
echo "=========================================================="
echo ""

# Check Docker
if ! command -v docker > /dev/null 2>&1; then
    echo "ERROR: docker not found. Install Docker Desktop with WSL integration."
    exit 1
fi

# Check GPU
if ! docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi > /dev/null 2>&1; then
    echo "ERROR: Docker GPU passthrough not working."
    echo "  1. Check NVIDIA driver is installed on Windows"
    echo "  2. Check Docker Desktop has WSL integration enabled"
    echo "  3. Check nvidia-container-toolkit is installed in WSL"
    exit 1
fi

echo "[1/3] Pulling Triton image..."
docker compose -f "${COMPOSE_FILE}" pull triton
echo "  Done."

echo ""
echo "[2/3] Starting Triton..."
docker compose -f "${COMPOSE_FILE}" up -d triton
echo "  Done."

echo ""
echo "[3/3] Waiting for Triton to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/v2/health/ready > /dev/null 2>&1; then
        echo "  Triton is ready."
        echo ""

        # Show loaded models
        echo "Loaded models:"
        curl -s http://localhost:8000/v2/models | python3 -m json.tool 2>/dev/null || \
            curl -s http://localhost:8000/v2/models
        echo ""
        echo "=========================================================="
        echo " Triton running at:"
        echo "   HTTP:    http://localhost:8000"
        echo "   gRPC:    grpc://localhost:8001"
        echo "   Metrics: http://localhost:8002/metrics"
        echo "=========================================================="
        exit 0
    fi
    sleep 2
done

echo "  WARNING: Triton did not become ready within 60s."
echo "  Check logs: docker compose -f ${COMPOSE_FILE} logs triton"
exit 1
