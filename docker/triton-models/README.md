# Triton Model Repository

This directory contains Triton model configurations. The actual model files
live in the `triton-models` Docker volume — not committed to git.

## Structure

Triton expects this layout in the model repository:

```
/models/
  <model_name>/
    config.pbtxt          # model configuration
    1/                    # version directory
      model.onnx          # model file (or model.plan for TensorRT)
```

## Adding a Model

### 1. Copy config.pbtxt into the volume

```bash
# From WSL, copy config into the running Triton container's model dir
docker cp docker/triton-models/bge_small_en/config.pbtxt triton-inference:/models/bge_small_en/config.pbtxt
```

### 2. Copy the model file

```bash
# Example: ONNX model
docker exec triton-inference mkdir -p /models/bge_small_en/1
docker cp /path/to/model.onnx triton-inference:/models/bge_small_en/1/model.onnx
```

### 3. Reload Triton

Triton polls for changes if `--model-control-mode=poll` is set, or you can restart:

```bash
docker compose -f docker/docker-compose.triton.yml restart triton
```

### 4. Verify

```bash
# Check model is loaded
curl -s http://localhost:8000/v2/models | jq .

# Check specific model
curl -s http://localhost:8000/v2/models/bge_small_en/ready
```

## Included Configs

| Model | Type | Purpose |
|---|---|---|
| `bge_small_en` | ONNX | BGE-small-en-v1.5 embedding (384 dims) |

## Building TensorRT Engines

For maximum performance on RTX 5090, convert ONNX models to TensorRT engines:

```bash
# Inside a TensorRT container
trtexec --onnx=model.onnx \
        --saveEngine=model.plan \
        --fp16 \
        --workspace=4096 \
        --minShapes=input_ids:1x1,attention_mask:1x1 \
        --optShapes=input_ids:1x128,attention_mask:1x128 \
        --maxShapes=input_ids:8x512,attention_mask:8x512
```

Then place `model.plan` in the version directory and update `config.pbtxt`
to use `platform: "tensorrt_plan"`.
