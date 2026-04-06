# Phase 1 — Triton Inference Server: BGE-small Embedding Benchmark

**Date:** 2026-04-06
**GPU:** NVIDIA GeForce RTX 5090 Laptop GPU (24 GB VRAM, Compute 12.0, 82 SMs)
**Driver:** 581.95 | **CUDA:** 12.9

---

## Setup

| Component | Detail |
|-----------|--------|
| Triton Server | `nvcr.io/nvidia/tritonserver:25.03-py3` (v2.56.0) |
| Container | `finn-triton` |
| Backend | ONNX Runtime (`onnxruntime_onnx`) on GPU |
| Model | BAAI/bge-small-en-v1.5 (33M params, ONNX) |
| Output | `pooler_output` 384-dim FP32 |
| Ports | HTTP :8000, gRPC :8002, Metrics :8003 |

## Triton — BGE-small-en-v1.5 (384-dim, ONNX)

| Run | Latency (ms) |
|-----|-------------|
| 1 (cold) | 391 |
| 2 | 116 |
| 3 | 149 |
| 4 | 65 |
| 5 | 127 |
| **Warm avg** | **114 ms** |
| **Min** | **65 ms** |

## Ollama — nomic-embed-text (768-dim, llama.cpp GGUF)

| Run | Latency (ms) |
|-----|-------------|
| 1 (cold) | 1913 |
| 2 | 22 |
| 3 | 23 |
| 4 | 22 |
| 5 | 23 |
| **Warm avg** | **23 ms** |
| **Min** | **22 ms** |

## Analysis

- **Cold start:** Triton 391ms vs Ollama 1913ms — Triton wins cold start by **5x**
- **Warm throughput:** Ollama 23ms vs Triton 114ms — Ollama faster by **5x** warm
- **Why Ollama is faster warm:** llama.cpp uses fused CUDA kernels optimized for GGUF
  quantized models. Triton ONNX Runtime has scheduling overhead for small models.
- **Triton advantages:** Dynamic batching, concurrent model serving, Prometheus metrics,
  gRPC, model versioning, multi-model orchestration, Kubernetes-ready.

## Phase 2 Target (TensorRT)

Converting BGE-small to a TensorRT FP16 engine should bring Triton warm latency
to **5-15ms** range, matching or beating Ollama while retaining all Triton
infrastructure advantages.
