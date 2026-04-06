#!/usr/bin/env bash
# ===========================================================================
# setup-riva.sh — Pull and launch NVIDIA Riva Speech AI (optional)
# ===========================================================================
# Requires NGC_API_KEY environment variable.
# Usage: NGC_API_KEY=<key> bash scripts/wsl/setup-riva.sh
# ===========================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker/docker-compose.riva.yml"

echo ""
echo "=========================================================="
echo " NVIDIA Riva Speech AI — Setup"
echo "=========================================================="
echo ""

if [ -z "${NGC_API_KEY:-}" ]; then
    echo "ERROR: NGC_API_KEY not set."
    echo "  1. Create an NGC account at https://ngc.nvidia.com"
    echo "  2. Generate an API key"
    echo "  3. Run: NGC_API_KEY=<key> bash scripts/wsl/setup-riva.sh"
    exit 1
fi

# Check Docker + GPU
if ! docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi > /dev/null 2>&1; then
    echo "ERROR: Docker GPU passthrough not working."
    exit 1
fi

echo "[1/3] Downloading Riva models (this may take 10-30 minutes)..."
docker compose -f "${COMPOSE_FILE}" run --rm riva-init
echo "  Done."

echo ""
echo "[2/3] Starting Riva speech server..."
docker compose -f "${COMPOSE_FILE}" up -d riva-speech
echo "  Done."

echo ""
echo "[3/3] Waiting for Riva to be ready..."
for i in $(seq 1 60); do
    if docker exec riva-speech curl -sf http://localhost:8000/v2/health/ready > /dev/null 2>&1; then
        echo "  Riva is ready."
        echo ""
        echo "=========================================================="
        echo " Riva running at:"
        echo "   gRPC: grpc://localhost:50051"
        echo ""
        echo " Finn integration:"
        echo "   Set FINN_SPEECH_BACKEND=riva"
        echo "   Set FINN_RIVA_ENDPOINT=localhost:50051"
        echo "=========================================================="
        exit 0
    fi
    sleep 5
done

echo "  WARNING: Riva did not become ready within 5 minutes."
echo "  Check logs: docker compose -f ${COMPOSE_FILE} logs riva-speech"
exit 1
