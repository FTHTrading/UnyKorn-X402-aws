# Phase 3 — Inference Router Benchmark

**Date:** 2026-04-06
**Component:** `packages/inference-router` (Fastify OpenAI-compatible proxy)
**GPU:** RTX 5090 Laptop, 24 GB VRAM, Compute 12.0, Driver 581.95

## Architecture

```
Client (OpenAI SDK / curl)
   │
   ▼
┌──────────────────────────────┐
│   Inference Router (:8100)   │
│   POST /v1/embeddings        │
│   Circuit-breaker failover   │
│   @huggingface/transformers  │
│   tokenizer (BERT WordPiece) │
└──────────┬───────────────────┘
           │ priority order
           ▼
  ┌─────────────────┐
  │ 1. Triton TRT   │ ← FP16, fixed 1×128, ~5ms
  │ 2. Triton ONNX  │ ← FP32, dynamic shapes, ~10ms
  │ 3. Ollama       │ ← nomic-embed-text, ~17ms
  └─────────────────┘
```

## End-to-End Benchmark (20 calls, warm)

| Metric | E2E (client→router→backend) | Server (tokenize+infer) |
|--------|----:|----:|
| Avg    | 7.81 ms | 5.10 ms |
| Min    | 4.83 ms | 3.47 ms |
| Max    | 20.91 ms | 9.39 ms |
| P50    | 6.82 ms | 4.91 ms |
| P95    | 20.91 ms | 9.39 ms |

**Backend:** `triton-trt` (TensorRT FP16) selected for all 20 calls.
**Dimensions:** 384 (BGE-small-en-v1.5)

## Failover Test

| Scenario | Backend Used | Latency | Dims |
|----------|-------------|---------|------|
| All backends healthy | triton-trt | 8.24 ms | 384 |
| Triton stopped | ollama | 21.05 ms | 768 |
| Triton restarted | triton-trt | 20.63 ms | 384 |

Failover is seamless — the circuit breaker tries TRT first, fails over to ONNX
(also down since same container), then falls to Ollama. After restart, the
router's health probe detects recovery within 10s and re-promotes TRT.

## Comparison to Raw Backends (Phase 2)

| Backend | Raw P50 | Through Router P50 | Overhead |
|---------|---------|-------------------|----------|
| TRT FP16 | 5.83 ms | 4.91 ms server / 6.82 ms E2E | ~1 ms server |
| ONNX RT | 10.36 ms | — | — |
| Ollama | 17.20 ms | 21.05 ms (failover) | ~4 ms |

Server-side overhead (tokenizer + HTTP to Triton) is ~1 ms — negligible.
