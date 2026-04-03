#!/bin/bash
# publish-custom-metrics.sh — Publish UnyKorn L1 chain metrics to CloudWatch
# Runs on alpha EC2 or locally. Deploy to cron: */1 * * * * /opt/unykorn/scripts/publish-custom-metrics.sh
#
# Publishes to namespace: UnyKorn/L1
#   - BlockHeight (from Genesis Ledger /health)
#   - TransactionsPerSecond (computed from ledger entries delta)

set -euo pipefail

NAMESPACE="UnyKorn/L1"
NODE="alpha"
GENESIS_URL="${GENESIS_URL:-http://localhost:4030}"
APOSTLE_URL="${APOSTLE_URL:-http://localhost:7332}"
REGION="${AWS_REGION:-us-east-1}"
STATE_FILE="/tmp/unykorn-metrics-state.json"

log() { echo "[$(date -Iseconds)] $*"; }

# ─── Fetch Genesis Ledger Metrics ──────────────────────────
genesis_health=$(curl -sf "${GENESIS_URL}/health" 2>/dev/null || echo '{}')
ledger_entries=$(echo "$genesis_health" | jq -r '.entries // 0')
genesis_uptime=$(echo "$genesis_health" | jq -r '.uptime_secs // 0')

# ─── Fetch Apostle Chain Status ────────────────────────────
apostle_status=$(curl -sf "${APOSTLE_URL}/status" 2>/dev/null || echo '{}')
block_height=$(echo "$apostle_status" | jq -r '.height // 0')

# ─── Compute TPS ──────────────────────────────────────────
tps=0
if [ -f "$STATE_FILE" ]; then
  prev_entries=$(jq -r '.entries // 0' "$STATE_FILE")
  prev_time=$(jq -r '.timestamp // 0' "$STATE_FILE")
  now=$(date +%s)
  delta_entries=$((ledger_entries - prev_entries))
  delta_time=$((now - prev_time))
  if [ "$delta_time" -gt 0 ] && [ "$delta_entries" -ge 0 ]; then
    tps=$(echo "scale=2; $delta_entries / $delta_time" | bc -l 2>/dev/null || echo "0")
  fi
fi

# Save state for next run
echo "{\"entries\":$ledger_entries,\"timestamp\":$(date +%s)}" > "$STATE_FILE"

# ─── Publish to CloudWatch ─────────────────────────────────
log "BlockHeight=$block_height LedgerEntries=$ledger_entries TPS=$tps"

aws cloudwatch put-metric-data \
  --namespace "$NAMESPACE" \
  --region "$REGION" \
  --metric-data \
    "MetricName=BlockHeight,Dimensions=[{Name=Node,Value=$NODE}],Value=$block_height,Unit=Count" \
    "MetricName=TransactionsPerSecond,Dimensions=[{Name=Node,Value=$NODE}],Value=$tps,Unit=Count/Second" \
    "MetricName=LedgerEntries,Dimensions=[{Name=Node,Value=$NODE}],Value=$ledger_entries,Unit=Count"

log "Published 3 metrics to $NAMESPACE"
