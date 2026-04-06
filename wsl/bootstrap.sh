#!/usr/bin/env bash
# ===========================================================================
# bootstrap.sh — First-time WSL2 Ubuntu setup for RTX 5090 GPU workstation
# ===========================================================================
# Run once after installing Ubuntu on WSL2.
# Do NOT install NVIDIA Linux drivers — CUDA comes from the Windows driver.
#
# Usage: bash wsl/bootstrap.sh
# ===========================================================================
set -euo pipefail

echo ""
echo "=========================================================="
echo " WSL2 Ubuntu Bootstrap — RTX 5090 Workstation"
echo "=========================================================="
echo ""

# ── System packages ──────────────────────────────────────────
echo "[1/5] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
    build-essential \
    python3 python3-pip python3-venv \
    git curl wget jq unzip \
    ca-certificates gnupg lsb-release \
    htop nvtop \
    > /dev/null 2>&1
echo "  Done."

# ── NVIDIA Container Toolkit ─────────────────────────────────
echo ""
echo "[2/5] Installing NVIDIA Container Toolkit..."

# Add NVIDIA package repository if not present
if [ ! -f /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg ]; then
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
        | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

    distribution=$(. /etc/os-release; echo "${ID}${VERSION_ID}")
    curl -fsSL "https://nvidia.github.io/libnvidia-container/${distribution}/libnvidia-container.list" \
        | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

    sudo apt-get update -qq
fi

sudo apt-get install -y -qq nvidia-container-toolkit > /dev/null 2>&1
echo "  Done."

# ── Docker runtime config ────────────────────────────────────
echo ""
echo "[3/5] Configuring Docker daemon for NVIDIA runtime..."

# Docker Desktop manages its own daemon; only configure if using standalone dockerd
if command -v dockerd > /dev/null 2>&1 && [ ! -S /var/run/docker.sock ]; then
    sudo nvidia-ctk runtime configure --runtime=docker 2>/dev/null || true
    echo "  Configured standalone Docker daemon."
else
    echo "  Docker Desktop detected — WSL integration handles GPU runtime."
fi

# ── Project directory ─────────────────────────────────────────
echo ""
echo "[4/5] Creating project workspace..."

PROJECT_DIR="${HOME}/projects"
mkdir -p "${PROJECT_DIR}"
echo "  Workspace: ${PROJECT_DIR}"

# ── Validation ────────────────────────────────────────────────
echo ""
echo "[5/5] Quick validation..."

if command -v nvidia-smi > /dev/null 2>&1; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo "unknown")
    echo "  GPU visible from WSL: ${GPU_NAME}"
else
    echo "  WARNING: nvidia-smi not found. Ensure Windows NVIDIA driver is installed."
fi

if command -v docker > /dev/null 2>&1; then
    DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "not running")
    echo "  Docker: v${DOCKER_VER}"
else
    echo "  WARNING: docker not in PATH. Enable Docker Desktop WSL integration."
fi

echo ""
echo "=========================================================="
echo " Bootstrap complete."
echo " Next: bash wsl/validate.sh"
echo "=========================================================="
