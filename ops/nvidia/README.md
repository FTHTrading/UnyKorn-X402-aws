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
│  │  │  │ Triton      │  │ TensorRT-LLM│  │ Riva         │ │   │   │
│  │  │  │ 8000/8001/  │  │ engine      │  │ ASR/TTS      │ │   │   │
│  │  │  │ 8002        │  │ builds      │  │ 50051        │ │   │   │
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
| Riva (optional) | Docker/WSL | 50051 | gRPC | ASR/TTS speech pipeline |
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
Mic Input ──→ Riva ASR (50051) ──→ Text ──→ Agent ──→ Riva TTS (50051)
                  │                                         │
                  └── fallback: Whisper (local)              └── fallback: Piper (local)
```

## Data Layout

| What | Where | Why |
|---|---|---|
| This repo | `C:\Users\Kevan\UnyKorn-X402-aws\` | Version-controlled config/scripts |
| Model cache (Ollama) | `C:\Users\Kevan\.ollama\models\` | Windows-native Ollama |
| Triton model repo | Docker volume `triton-models` | Persistent across restarts |
| Riva model cache | Docker volume `riva-models` | NGC-downloaded models |
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
  docker-compose.riva.yml                ← Riva ASR/TTS (optional)
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
  setup-riva.sh                          ← pull + launch Riva (optional)
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
