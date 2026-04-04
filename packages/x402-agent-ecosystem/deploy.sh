#!/usr/bin/env bash
# deploy.sh — Build, SCP, and launch x402-agent-ecosystem on EC2
# Run from: packages/x402-agent-ecosystem/
#
# Usage:
#   bash deploy.sh [--bootstrap]   # --bootstrap re-airdrops all agents (first time)
#   bash deploy.sh                  # Deploy/restart agent-runner + digital-twin only

set -e

EC2_HOST="ec2-user@98.91.89.169"
EC2_KEY="${HOME}/.ssh/unykorn-devnet-key.pem"
REMOTE_DIR="${HOME}/x402/x402-agent-ecosystem"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DO_BOOTSTRAP=0
[[ "${1}" == "--bootstrap" ]] && DO_BOOTSTRAP=1

SSH="ssh -i ${EC2_KEY} -o StrictHostKeyChecking=no ${EC2_HOST}"
SCP="scp -i ${EC2_KEY} -o StrictHostKeyChecking=no"

echo "==> Syncing package to EC2..."
# rsync src/, static/, registry/, requirements.txt (NOT keys/ or __pycache__)
rsync -avz --delete \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude 'keys/' \
  -e "ssh -i ${EC2_KEY} -o StrictHostKeyChecking=no" \
  "${SCRIPT_DIR}/" \
  "${EC2_HOST}:${REMOTE_DIR}/"

echo "==> Installing Python deps on EC2..."
${SSH} "cd ${REMOTE_DIR} && pip3 install --quiet -r requirements.txt"

if [[ ${DO_BOOTSTRAP} -eq 1 ]]; then
  echo "==> Running bootstrap (re-airdrop all agents)..."
  ${SSH} "cd ${REMOTE_DIR} && mkdir -p keys && APOSTLE_URL=http://localhost:7332 python3 src/bootstrap.py"
  echo "==> Pulling generated keys back to local keys/agents.json..."
  mkdir -p "${SCRIPT_DIR}/keys"
  ${SCP} "${EC2_HOST}:${REMOTE_DIR}/keys/agents.json" "${SCRIPT_DIR}/keys/agents.json"
  echo "==> keys/agents.json saved locally (KEEP SECURE — contains private keys)"
fi

echo "==> Stopping old processes (if any)..."
${SSH} "pkill -f 'python3 src/agent_runner.py' 2>/dev/null; pkill -f 'python3 src/digital_twin_server.py' 2>/dev/null; true"
sleep 2

echo "==> Launching agent-runner in background..."
${SSH} "cd ${REMOTE_DIR} && APOSTLE_URL=http://localhost:7332 PULSE_WS_URL=ws://localhost:3280/pulse/stream nohup python3 src/agent_runner.py > logs/agent_runner.log 2>&1 &" || true

echo "==> Launching digital-twin server in background..."
${SSH} "cd ${REMOTE_DIR} && APOSTLE_URL=http://localhost:7332 PULSE_WS_URL=ws://localhost:3280/pulse/stream TWIN_PORT=8402 nohup python3 src/digital_twin_server.py > logs/digital_twin.log 2>&1 &" || true

echo ""
echo "==> Deploy complete!"
echo "    Digital Twin UI: http://98.91.89.169:8402"
echo "    Agent logs:      ${REMOTE_DIR}/logs/agent_runner.log"
echo "    Twin logs:       ${REMOTE_DIR}/logs/digital_twin.log"
echo ""
echo "    Tail logs:"
echo "    ssh -i ${EC2_KEY} ${EC2_HOST} 'tail -f ${REMOTE_DIR}/logs/agent_runner.log'"
