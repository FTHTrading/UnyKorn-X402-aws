#!/bin/bash
pkill -f agent_runner.py 2>/dev/null
pkill -f digital_twin_server.py 2>/dev/null
sleep 1

cd ~/apps/x402-agent-ecosystem

APOSTLE_URL=http://localhost:7332 \
PULSE_WS_URL=ws://localhost:3280/pulse/stream \
PYTHONUNBUFFERED=1 \
nohup python3 -u src/agent_runner.py >> logs/agent_runner.log 2>&1 &
echo "agent_runner pid=$!"

APOSTLE_URL=http://localhost:7332 \
PULSE_WS_URL=ws://localhost:3280/pulse/stream \
TWIN_PORT=8402 \
PYTHONUNBUFFERED=1 \
nohup python3 -u src/digital_twin_server.py >> logs/digital_twin.log 2>&1 &
echo "digital_twin pid=$!"

sleep 5
echo "=== agent_runner.log ==="
tail -20 logs/agent_runner.log
echo "=== digital_twin.log ==="
tail -15 logs/digital_twin.log
