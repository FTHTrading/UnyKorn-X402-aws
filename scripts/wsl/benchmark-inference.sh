#!/usr/bin/env bash
# ===========================================================================
# benchmark-inference.sh — Compare Ollama vs Triton response times
# ===========================================================================
# Usage: bash scripts/wsl/benchmark-inference.sh
#
# Requires: curl, jq
# Ollama at localhost:11434, Triton at localhost:8000
# ===========================================================================
set -uo pipefail

PROMPT="Explain what an embedding model does in three sentences."
OLLAMA_MODEL="${OLLAMA_DEFAULT_MODEL:-qwen2.5:7b}"
TRITON_MODEL="${TRITON_BENCHMARK_MODEL:-bge_small_en}"
RUNS=3

echo ""
echo "========================================================================="
echo " Inference Benchmark — Ollama vs Triton"
echo "========================================================================="
echo ""

# ── Ollama (generative) ──────────────────────────────────────
echo "── Ollama (${OLLAMA_MODEL}) ──"
OLLAMA_UP=$(curl -sf http://localhost:11434/api/tags > /dev/null 2>&1 && echo "yes" || echo "no")

if [ "${OLLAMA_UP}" = "yes" ]; then
    OLLAMA_TOTAL=0
    for i in $(seq 1 "${RUNS}"); do
        START=$(date +%s%N)
        RESP=$(curl -sf http://localhost:11434/api/generate \
            -d "{\"model\": \"${OLLAMA_MODEL}\", \"prompt\": \"${PROMPT}\", \"stream\": false}" \
            2>/dev/null)
        END=$(date +%s%N)
        ELAPSED=$(( (END - START) / 1000000 ))
        OLLAMA_TOTAL=$(( OLLAMA_TOTAL + ELAPSED ))
        TOKENS=$(echo "${RESP}" | jq -r '.eval_count // 0' 2>/dev/null || echo "?")
        echo "  Run ${i}: ${ELAPSED}ms (${TOKENS} tokens)"
    done
    OLLAMA_AVG=$(( OLLAMA_TOTAL / RUNS ))
    echo "  Average: ${OLLAMA_AVG}ms"
else
    echo "  SKIP — Ollama not running"
    OLLAMA_AVG="N/A"
fi

echo ""

# ── Triton (embedding) ───────────────────────────────────────
echo "── Triton (${TRITON_MODEL}) ──"
TRITON_UP=$(curl -sf http://localhost:8000/v2/health/ready > /dev/null 2>&1 && echo "yes" || echo "no")

if [ "${TRITON_UP}" = "yes" ]; then
    # Check if model is loaded
    MODEL_READY=$(curl -sf "http://localhost:8000/v2/models/${TRITON_MODEL}/ready" > /dev/null 2>&1 && echo "yes" || echo "no")

    if [ "${MODEL_READY}" = "yes" ]; then
        TRITON_TOTAL=0
        # Simple inference request — adjust payload per model
        PAYLOAD='{
            "inputs": [{
                "name": "input_ids",
                "shape": [1, 8],
                "datatype": "INT64",
                "data": [[101, 2054, 2003, 2019, 7861, 8270, 4667, 102]]
            }, {
                "name": "attention_mask",
                "shape": [1, 8],
                "datatype": "INT64",
                "data": [[1, 1, 1, 1, 1, 1, 1, 1]]
            }, {
                "name": "token_type_ids",
                "shape": [1, 8],
                "datatype": "INT64",
                "data": [[0, 0, 0, 0, 0, 0, 0, 0]]
            }]
        }'

        for i in $(seq 1 "${RUNS}"); do
            START=$(date +%s%N)
            curl -sf "http://localhost:8000/v2/models/${TRITON_MODEL}/infer" \
                -H "Content-Type: application/json" \
                -d "${PAYLOAD}" > /dev/null 2>&1
            END=$(date +%s%N)
            ELAPSED=$(( (END - START) / 1000000 ))
            TRITON_TOTAL=$(( TRITON_TOTAL + ELAPSED ))
            echo "  Run ${i}: ${ELAPSED}ms"
        done
        TRITON_AVG=$(( TRITON_TOTAL / RUNS ))
        echo "  Average: ${TRITON_AVG}ms"
    else
        echo "  SKIP — Model '${TRITON_MODEL}' not loaded in Triton"
        TRITON_AVG="N/A"
    fi
else
    echo "  SKIP — Triton not running"
    TRITON_AVG="N/A"
fi

echo ""
echo "========================================================================="
echo " Summary"
echo "========================================================================="
echo "  Ollama (${OLLAMA_MODEL}, generative): ${OLLAMA_AVG}ms avg"
echo "  Triton (${TRITON_MODEL}, embedding):  ${TRITON_AVG}ms avg"
echo ""
echo "  Note: These are different workloads (generative vs embedding)."
echo "  For apples-to-apples on the same model, deploy the same ONNX"
echo "  model to both and compare."
echo "========================================================================="
