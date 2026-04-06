# NVIDIA RTX 5090 Workstation Platform

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  WINDOWS 11 HOST — Control Plane                                    │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐ │
│  │ NVIDIA   │ │ CUDA     │ │ Nsight    │ │ NVIDIA   │ │ VS Code │ │
│  │ Driver   │ │ Toolkit  │ │ Sys/Comp  │ │ Broadcast│ │ + WSL   │ │
│  │ (Studio) │ │ (native) │ │ profiling │ │ mic/cam  │ │ remote  │ │
│  └──────────┘ └──────────┘ └───────────┘ └──────────┘ └─────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  OpenClaw Gateway (18789) │ Ollama (11434) │ Open WebUI      │   │
│  │  Telegram Bot             │ Finn Agent     │ Dashboards      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ══════════════════ WSL2 Boundary ═══════════════════════════════   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  WSL2 Ubuntu — GPU Runtime Plane                             │   │
│  │                                                               │   │
│  │  ┌───────────────────────────────────────────────────────┐   │   │
│  │  │  Docker Desktop (WSL2 backend)                        │   │   │
│  │  │                                                       │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │   │   │
│  │  │  │ Triton      │  │ TensorRT-LLM│  │ Riva NIMs   │ │   │   │
│  │  │  │ 8000/8002/  │  │ engine      │  │ ASR: 9010   │ │   │   │
│  │  │  │ 8003        │  │ builds      │  │ TTS: 9020   │ │   │   │
│  │  │  └─────────────┘  └─────────────┘  └──────────────┘ │   │   │
│  │  │                                                       │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐                   │   │   │
│  │  │  │ Model Cache │  │ Vector/     │                   │   │   │
│  │  │  │ (volumes)   │  │ Embed Svc   │                   │   │   │
│  │  │  └─────────────┘  └─────────────┘                   │   │   │
│  │  └───────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  GPU: NVIDIA GeForce RTX 5090 — Blackwell, 24 GB GDDR7             │
│  Compute: 12.0 — 82 SMs — Driver 581.95                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Service Endpoints

| Service | Host | Port | Protocol | Purpose |
|---|---|---|---|---|
| OpenClaw Gateway | Windows | 18789 | HTTP | Agent orchestration |
| Ollama | Windows | 11434 | HTTP | Fast local dev inference |
| Triton HTTP | Docker/WSL | 8000 | HTTP/REST | Optimized model serving |
| Triton gRPC | Docker/WSL | 8001 | gRPC | High-perf model serving |
| Triton Metrics | Docker/WSL | 8002 | HTTP | Prometheus metrics |
| Riva ASR NIM | Docker/WSL | 9010 | HTTP | Parakeet CTC 1.1B (STT) |
| Riva TTS NIM | Docker/WSL | 9020 | HTTP | Magpie Multilingual (TTS) |
| Riva ASR gRPC | Docker/WSL | 50051 | gRPC | Streaming ASR |
| Riva TTS gRPC | Docker/WSL | 50052 | gRPC | Streaming TTS |
| Speech Router | Windows | 8200 | HTTP | OpenAI-compatible speech proxy |
| Open WebUI | Windows | 3000 | HTTP | Chat/dashboard UI |
| Telegram | Windows | — | outbound | Finn control surface |

## Inference Routing

```
User / Agent Request
       │
       ├── Fast path (dev/iteration) ──→ Ollama (localhost:11434)
       │     qwen2.5:7b, llama3.2, etc.
       │
       └── Optimized path (pinned models) ──→ Triton (localhost:8000)
             TensorRT-LLM engines, ONNX optimized
```

## Speech Routing (Finn)

```
Mic Input ──→ Speech Router (:8200) ──→ Riva ASR NIM (:9010) ──→ Text
                                              │
                                              └── fallback: Whisper (local)

Agent Response ──→ Speech Router (:8200) ──→ Riva TTS NIM (:9020) ──→ Audio
                                                   │
                                                   └── fallback: Piper (local)
```

**Note:** Riva SDK is Jetson/ARM64 only. x86 deployments use NVIDIA NIMs (Inference Microservices).
ASR NIM: Parakeet CTC 1.1B (`nvcr.io/nim/nvidia/parakeet-1-1b-ctc-en-us`)
TTS NIM: Magpie Multilingual (`nvcr.io/nim/nvidia/magpie-tts-multilingual`)
Both require NGC API key.

## Data Layout

| What | Where | Why |
|---|---|---|
| This repo | `C:\Users\Kevan\UnyKorn-X402-aws\` | Version-controlled config/scripts |
| Model cache (Ollama) | `C:\Users\Kevan\.ollama\models\` | Windows-native Ollama |
| Triton model repo | Docker volume `triton-models` | Persistent across restarts |
| Riva NIM cache | Docker volume `nim-cache` | NIM model downloads |
| WSL project workspace | `/home/kevan/projects/` | Heavy AI work (WSL perf) |
| Profiling output | `C:\Users\Kevan\nsight-reports\` | Nsight traces (Windows tool) |

## Critical Rules

1. **Do NOT install Linux NVIDIA drivers inside WSL2.** CUDA is exposed from the Windows driver.
2. **Docker Desktop ≥ 4.33.0** for reliable CUDA passthrough on Windows.
3. **`.wslconfig`** must allocate enough memory: `memory=16GB` minimum (set).
4. **Model files go in Docker volumes or WSL filesystem**, not under `C:\`, for performance.
5. **Ollama stays alive** as the dev runtime. Triton is the optimized second lane, not a replacement.

## File Map

```
ops/nvidia/
  README.md                              ← this file
  .env.template                          ← master env vars

docker/
  docker-compose.triton.yml              ← Triton Inference Server
  docker-compose.riva.yml                ← Riva NIMs: ASR (Parakeet) + TTS (Magpie)
  triton-models/
    README.md                            ← model repo instructions
    bge_small_en/config.pbtxt            ← example: embedding model

wsl/
  bootstrap.sh                           ← Ubuntu WSL first-time setup
  validate.sh                            ← full WSL + GPU validation

scripts/windows/
  verify-nvidia-host.ps1                 ← Windows pre-flight checks

scripts/wsl/
  setup-triton.sh                        ← pull + launch Triton
  setup-riva.sh                          ← pull + launch Riva NIMs (requires NGC key)
  validate-gpu.sh                        ← GPU runtime validation
  benchmark-inference.sh                 ← Ollama vs Triton comparison

profiles/
  ollama-dev.env                         ← Ollama fast-path config
  triton-serve.env                       ← Triton optimized-path config
  riva-speech.env                        ← Riva ASR/TTS config
  finn-voice-riva.env                    ← Finn speech wiring

docs/runbooks/
  NVIDIA-5090-WORKSTATION.md             ← install / validate / rollback / troubleshoot / profile
```
