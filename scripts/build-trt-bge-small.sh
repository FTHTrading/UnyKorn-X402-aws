#!/usr/bin/env bash
# ===========================================================================
# Build TensorRT FP16 engine for BGE-small-en-v1.5
# ===========================================================================
# Prerequisites:
#   - Docker with NVIDIA GPU support
#   - ONNX model at /models/bge-small/1/model.onnx (in triton-models volume)
#   - Triton container image nvcr.io/nvidia/tritonserver:25.03-py3
#
# This script runs trtexec inside a one-shot container (no active Triton
# needed). Stop finn-triton first to avoid GPU contention:
#   docker stop finn-triton
#
# After build, restart Triton:
#   docker restart finn-triton
# ===========================================================================
set -euo pipefail

IMAGE="nvcr.io/nvidia/tritonserver:25.03-py3"
VOLUME="infra_triton-models"
ONNX_PATH="/models/bge-small/1/model.onnx"
ENGINE_DIR="/models/bge-small-trt/1"
ENGINE_PATH="${ENGINE_DIR}/model.plan"

# Fixed shapes: batch=1, seq_len=128
# For variable-length inputs, pad/truncate to 128 tokens client-side.
SHAPES="input_ids:1x128,attention_mask:1x128,token_type_ids:1x128"

echo "=== Building TensorRT FP16 engine for BGE-small ==="
echo "Image:  ${IMAGE}"
echo "Volume: ${VOLUME}"
echo "Shapes: ${SHAPES}"
echo ""

docker run --rm --gpus all \
  -v "${VOLUME}:/models" \
  "${IMAGE}" \
  bash -c "
    mkdir -p ${ENGINE_DIR} && \
    /usr/src/tensorrt/bin/trtexec \
      --onnx=${ONNX_PATH} \
      --saveEngine=${ENGINE_PATH} \
      --fp16 \
      --shapes=${SHAPES} \
      --memPoolSize=workspace:4G \
      2>&1
  "

echo ""
echo "=== Engine built: ${ENGINE_PATH} ==="
docker run --rm -v "${VOLUME}:/models" "${IMAGE}" ls -lh "${ENGINE_PATH}"
