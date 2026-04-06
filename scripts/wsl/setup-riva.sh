#!/usr/bin/env bash
# ===========================================================================
# setup-riva.sh — Pull and launch NVIDIA Riva Speech NIMs (ASR + TTS)
# ===========================================================================
# Riva SDK is Jetson-only. x86 deployments use NVIDIA NIMs.
# Requires NGC_API_KEY environment variable.
# Usage: NGC_API_KEY=<key> bash scripts/wsl/setup-riva.sh
# ===========================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker/docker-compose.riva.yml"

echo ""
echo "=========================================================="
echo " NVIDIA Riva Speech NIMs — Setup"
echo "=========================================================="
echo ""

# ── Check NGC_API_KEY ─────────────────────────────────────────
if [ -z "${NGC_API_KEY:-}" ]; then
    echo "ERROR: NGC_API_KEY not set."
    echo ""
    echo "  1. Create an NGC account at https://ngc.nvidia.com"
    echo "  2. Go to https://org.ngc.nvidia.com/setup/api-keys"
    echo "  3. Generate a key (select 'NGC Catalog' scope)"
    echo "  4. Run: NGC_API_KEY=<key> bash scripts/wsl/setup-riva.sh"
    echo ""
    echo "  Or add NGC_API_KEY=<key> to your .env file."
    exit 1
fi

# ── Docker login to NGC ──────────────────────────────────────
echo "[1/4] Authenticating with NGC registry..."
echo "${NGC_API_KEY}" | docker login nvcr.io -u '$oauthtoken' --password-stdin
echo "  Done."

# ── Check Docker + GPU ───────────────────────────────────────
echo ""
echo "[2/4] Verifying Docker GPU passthrough..."
if ! docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi > /dev/null 2>&1; then
    echo "ERROR: Docker GPU passthrough not working."
    echo "  Ensure NVIDIA Container Toolkit is installed."
    exit 1
fi
echo "  Done."

# ── Start NIMs ───────────────────────────────────────────────
echo ""
echo "[3/4] Starting Riva NIMs (first run downloads models, may take 10-30 min)..."
export NGC_API_KEY
docker compose -f "${COMPOSE_FILE}" up -d
echo "  Containers launched."

# ── Wait for health ──────────────────────────────────────────
echo ""
echo "[4/4] Waiting for NIMs to be ready (up to 10 minutes)..."
ASR_READY=false
TTS_READY=false
for i in $(seq 1 120); do
    if [ "$ASR_READY" = false ]; then
        if curl -sf http://localhost:9010/v1/health/ready > /dev/null 2>&1; then
            echo "  ASR NIM: READY"
            ASR_READY=true
        fi
    fi
    if [ "$TTS_READY" = false ]; then
        if curl -sf http://localhost:9020/v1/health/ready > /dev/null 2>&1; then
            echo "  TTS NIM: READY"
            TTS_READY=true
        fi
    fi
    if [ "$ASR_READY" = true ] && [ "$TTS_READY" = true ]; then
        echo ""
        echo "=========================================================="
        echo " Riva NIMs running:"
        echo "   ASR (Parakeet CTC 1.1B):  http://localhost:9010"
        echo "   TTS (Magpie Multilingual): http://localhost:9020"
        echo "   ASR gRPC:                  localhost:50051"
        echo "   TTS gRPC:                  localhost:50052"
        echo ""
        echo " Finn integration:"
        echo "   FINN_SPEECH_BACKEND=riva"
        echo "   RIVA_ASR_URL=http://localhost:9010"
        echo "   RIVA_TTS_URL=http://localhost:9020"
        echo "=========================================================="
        exit 0
    fi
    sleep 5
done

echo ""
if [ "$ASR_READY" = false ]; then
    echo "  WARNING: ASR NIM did not become ready."
    echo "  Logs: docker compose -f ${COMPOSE_FILE} logs riva-asr"
fi
if [ "$TTS_READY" = false ]; then
    echo "  WARNING: TTS NIM did not become ready."
    echo "  Logs: docker compose -f ${COMPOSE_FILE} logs riva-tts"
fi
exit 1
