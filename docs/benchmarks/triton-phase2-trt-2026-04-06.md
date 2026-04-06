# Phase 2 Benchmark: TensorRT FP16 vs ONNX Runtime vs Ollama

**Date:** 2026-04-06  
**GPU:** NVIDIA GeForce RTX 5090 Laptop GPU, 24 GB VRAM, Compute 12.0, 82 SMs  
**Driver:** 581.95  
**TensorRT:** v10.9.0 (v100900, build 34)  
**Triton Server:** v2.56.0 (`nvcr.io/nvidia/tritonserver:25.03-py3`)  
**Model:** BGE-small-en-v1.5 (33M params, 384-dim embeddings)  
**Test input:** "hello world" tokenized to `[CLS] hello world [SEP]` + PAD to 128 tokens  
**Methodology:** 3 warm-up calls, then 20 timed calls per backend via `curl.exe` from host  

## Results

| Backend | Avg (ms) | Min (ms) | P50 (ms) | P95 (ms) | Max (ms) |
|---|---|---|---|---|---|
| **TRT FP16 (Triton)** | **7.88** | **4.92** | **5.83** | **12.09** | 30.87 |
| ONNX Runtime (Triton) | 13.33 | 8.53 | 10.36 | 21.84 | 30.79 |
| Ollama nomic-embed-text | 17.94 | 14.49 | 17.20 | 22.74 | 26.82 |

## Speedup (P50)

- TRT FP16 vs ONNX RT: **1.78x faster**
- TRT FP16 vs Ollama: **2.95x faster**
- ONNX RT vs Ollama: **1.66x faster**

## trtexec Built-in Benchmark (pure GPU, no HTTP overhead)

From the engine build process (separate from Triton serving):

| Metric | Value |
|---|---|
| Throughput | 736 qps |
| Latency (median) | 0.887 ms |
| Latency (P95) | 2.78 ms |
| Latency (P99) | 6.65 ms |

## Notes

- **Fixed shapes (1x128):** The TRT engine is built with fixed input shapes (batch=1, seq_len=128).
  Triton's TRT backend v2.56.0 had issues initializing execution contexts for engines with dynamic
  shape optimization profiles — "failed to specify the dimensions of all input tensors". Fixed shapes
  eliminate the need for optimization profiles entirely.
- **FP16 precision:** Engine uses FP16 throughout. Output embeddings are FP32 (TRT auto-casts on output).
- **Engine size:** 67 MiB (TRT FP16) vs 128 MiB (ONNX model.onnx.data).
- **Phase 1 comparison:** Phase 1 ONNX measured 114ms avg warm with a different test methodology
  (fewer warm-up iterations). The Phase 2 ONNX measurement of 13.33ms better represents warm steady-state
  after the CUDA context and model are fully loaded.
- **Pure GPU latency vs end-to-end:** The trtexec built-in benchmark shows 0.887ms median GPU compute.
  The 5.83ms P50 via Triton HTTP includes serialization, HTTP overhead, and Triton scheduling.
- **TRT v10 quirks:** Uses single-letter unit suffixes for `--memPoolSize` (e.g., `4G` not `4096MiB`).
  The engine preserves INT64 bindings from ONNX (must use TYPE_INT64 in config, not TYPE_INT32).
- **Docker stability:** ~55 containers running. Docker Desktop v4.57.0 crashed twice under GPU workloads
  during the build process. Recovery: kill Docker Desktop, terminate WSL, relaunch.

## Build Command

```bash
docker run --rm --gpus all -v infra_triton-models:/models \
  nvcr.io/nvidia/tritonserver:25.03-py3 bash -c \
  "/usr/src/tensorrt/bin/trtexec \
    --onnx=/models/bge-small/1/model.onnx \
    --saveEngine=/models/bge-small-trt/1/model.plan \
    --fp16 \
    --shapes=input_ids:1x128,attention_mask:1x128,token_type_ids:1x128 \
    --memPoolSize=workspace:4G"
```

## Triton Model Status

```
+---------------+---------+--------+
| Model         | Version | Status |
+---------------+---------+--------+
| bge-small     | 1       | READY  |  ← ONNX Runtime
| bge-small-trt | 1       | READY  |  ← TensorRT FP16
+---------------+---------+--------+
```
