# Phase 4 — Riva NIMs Speech Infrastructure (2026-08-03)

## Architecture

Riva SDK is **Jetson/ARM64 only** starting 2025. x86 deployments use **NVIDIA NIMs** (Inference Microservices).

```
┌─────────────────────────────────────────────────────────────────────┐
│  Speech Router (:8200) — OpenAI-compatible speech proxy             │
│                                                                     │
│  POST /v1/audio/transcriptions  ──→  Riva ASR NIM (:9010)          │
│  POST /v1/audio/speech          ──→  Riva TTS NIM (:9020)          │
│  GET  /health                                                       │
│  GET  /v1/backends                                                  │
│                                                                     │
│  Circuit breaker: 3 failures → open, 30s reset window               │
└─────────────────────────────────────────────────────────────────────┘
```

## NIM Containers

| Service | Image | HTTP | gRPC | Model |
|---|---|---|---|---|
| ASR | `nvcr.io/nim/nvidia/parakeet-1-1b-ctc-en-us:latest` | 9010 | 50051 | Parakeet CTC 1.1B |
| TTS | `nvcr.io/nim/nvidia/magpie-tts-multilingual:latest` | 9020 | 50052 | Magpie Multilingual |

## Setup Prerequisites

1. **NGC API Key**: https://org.ngc.nvidia.com/setup/api-keys (select "NGC Catalog")
2. **Docker login**: `echo $NGC_API_KEY | docker login nvcr.io -u '$oauthtoken' --password-stdin`
3. Set `NGC_API_KEY` env var

## Commands

```bash
# Start NIMs
npm run nvidia:riva:up

# Check status
npm run nvidia:riva:logs

# Stop
npm run nvidia:riva:down

# Start speech router (dev mode)
npm run nvidia:speech:dev

# Start speech router (production)
npm run nvidia:speech:start
```

## Files Changed

| File | Change |
|---|---|
| `docker/docker-compose.riva.yml` | Rewritten for NIM (was old Riva SDK) |
| `scripts/wsl/setup-riva.sh` | Updated for NIM login + dual-service health |
| `profiles/riva-speech.env` | NIM HTTP/gRPC endpoints |
| `profiles/finn-voice-riva.env` | NIM URL vars + fallback config |
| `ops/nvidia/.env.template` | NIM images + ports |
| `ops/nvidia/README.md` | Architecture diagram + service table updated |
| `packages/speech-router/` | **NEW** — Fastify speech proxy (port 8200) |
| `package.json` | Updated npm scripts for NIM + speech-router |

## Speech Router Smoke Test

```
# Health: OK (optimistic start)
GET http://localhost:8200/health  →  { "status": "ok", "backends": 2 }

# Backends show circuit breaker state
GET http://localhost:8200/v1/backends  →  { "backends": [...] }

# TTS (returns 500 when NIM not running — circuit breaker increments)
POST http://localhost:8200/v1/audio/speech  →  500 "fetch failed"

# After 3 failures → circuit opens, returns error immediately
```

## Blocker

**NGC_API_KEY not configured.** NIMs cannot be pulled/started until key is generated.
All infrastructure code is committed and tested. Deployment happens when key arrives.

## Next: Phase 5 — TensorRT-LLM
