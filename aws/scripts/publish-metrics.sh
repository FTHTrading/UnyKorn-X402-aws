#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# UnyKorn L1 — CloudWatch Custom Metric Publisher
#
# Publishes UnyKorn/L1 namespace metrics to CloudWatch:
#   BlockHeight, RegisteredAgents, MempoolSize, PeersConnected
#
# Deploy: copy to /opt/unykorn/scripts/publish-metrics.sh on each node
# Cron:   * * * * * /opt/unykorn/scripts/publish-metrics.sh >> /var/log/unykorn/metrics.log 2>&1
# ─────────────────────────────────────────────────────────────
set -euo pipefail

NODE_NAME="${NODE_NAME:-$(hostname -s)}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
CHAIN_PORT="${CHAIN_RPC_PORT:-7332}"
CHAIN_URL="http://localhost:${CHAIN_PORT}"

# ── Fetch chain status ─────────────────────────────────────
STATUS=$(curl -sf --max-time 5 "${CHAIN_URL}/status" 2>/dev/null || echo '{}')

HEIGHT=$(echo "$STATUS"  | jq -r '.height          // 0')
AGENTS=$(echo "$STATUS"  | jq -r '.agents          // 0')
MEMPOOL=$(echo "$STATUS" | jq -r '.mempool_size     // 0')
PEERS=$(echo "$STATUS"   | jq -r '.peers_connected  // 0')

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[${TIMESTAMP}] node=${NODE_NAME} height=${HEIGHT} agents=${AGENTS} mempool=${MEMPOOL} peers=${PEERS}"

# ── Publish to CloudWatch ──────────────────────────────────
aws cloudwatch put-metric-data \
  --region   "$REGION" \
  --namespace "UnyKorn/L1" \
  --metric-data \
    "MetricName=BlockHeight,Value=${HEIGHT},Unit=Count,Dimensions=[{Name=Node,Value=${NODE_NAME}}]" \
    "MetricName=RegisteredAgents,Value=${AGENTS},Unit=Count,Dimensions=[{Name=Node,Value=${NODE_NAME}}]" \
    "MetricName=MempoolSize,Value=${MEMPOOL},Unit=Count,Dimensions=[{Name=Node,Value=${NODE_NAME}}]" \
    "MetricName=PeersConnected,Value=${PEERS},Unit=Count,Dimensions=[{Name=Node,Value=${NODE_NAME}}]"

echo "[${TIMESTAMP}] metrics published"
