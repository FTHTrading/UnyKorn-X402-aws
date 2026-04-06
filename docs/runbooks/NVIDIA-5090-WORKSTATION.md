# NVIDIA RTX 5090 Workstation — Operations Runbook

**Machine**: Windows 11 + RTX 5090 (Blackwell, 24 GB GDDR7, Compute 12.0)  
**Architecture**: Windows host (control plane) + WSL2/Docker (GPU runtime)  
**Driver**: 581.95 (Studio Driver)

---

## Table of Contents

1. [Base Install](#1-base-install)
2. [WSL2 + Docker Setup](#2-wsl2--docker-setup)
3. [Triton Inference Server](#3-triton-inference-server)
4. [TensorRT / TensorRT-LLM](#4-tensorrt--tensorrt-llm)
5. [Riva Speech AI (Optional)](#5-riva-speech-ai-optional)
6. [Validation](#6-validation)
7. [Finn Voice Integration](#7-finn-voice-integration)
8. [Profiling with Nsight](#8-profiling-with-nsight)
9. [Rollback](#9-rollback)
10. [Troubleshooting](#10-troubleshooting)
11. [Smoke Test Checklist](#11-smoke-test-checklist)

---

## 1. Base Install

### 1.1 NVIDIA Driver

The driver is already installed (581.95). To update:

```powershell
# Check current driver
nvidia-smi
# Update via NVIDIA App or download from https://www.nvidia.com/drivers
# Choose Studio Driver for AI/creator workloads
```

**Decision**: Studio Driver vs Game Ready
- **Studio Driver** (recommended): optimized for creator/AI workloads, ISV-tested
- **Game Ready**: launch-day game support, same CUDA capability

### 1.2 CUDA Toolkit (Windows)

Already installed (13.2). For native Windows CUDA development:

```powershell
# Verify
nvcc --version
echo $env:CUDA_PATH
# Should show C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.2 or similar
```

### 1.3 Nsight Tools

Already installed:
- Nsight Systems 2025.6.3
- Nsight Compute 2026.1.0

```powershell
# Verify
nsys --version
ncu --version
```

### 1.4 NVIDIA Broadcast (Optional)

For webcam/mic cleanup on Windows:
- Download from https://www.nvidia.com/broadcast
- Provides noise removal, virtual background, auto-frame for mic/camera

---

## 2. WSL2 + Docker Setup

### 2.1 WSL2

```powershell
# Check status
wsl --status
wsl -l -v
# Should show Ubuntu running on WSL2
```

### 2.2 .wslconfig

Current config (`C:\Users\Kevan\.wslconfig`):

```ini
[wsl2]
memory=16GB
processors=8
swap=4GB
pageReporting=true
```

**Minimum for Triton + containers**: `memory=16GB`. Increase if running Riva simultaneously.

After changing `.wslconfig`:
```powershell
wsl --shutdown
# Restart Docker Desktop
```

### 2.3 Docker Desktop

**Requirement**: Docker Desktop ≥ 4.33.0 for reliable CUDA on Windows.

```powershell
docker version
# Settings → Resources → WSL Integration → Enable for Ubuntu
```

### 2.4 WSL Bootstrap

Run once after fresh Ubuntu install:

```bash
# From WSL terminal
cd /mnt/c/Users/Kevan/UnyKorn-X402-aws
bash wsl/bootstrap.sh
```

This installs:
- Build tools, Python, git, curl, jq
- NVIDIA Container Toolkit
- Creates `~/projects/` workspace

### 2.5 Critical Rule

**Do NOT install Linux NVIDIA drivers inside WSL2.**

CUDA is exposed into WSL from the Windows driver layer. The Windows driver provides:
- `/usr/lib/wsl/lib/libcuda.so` inside WSL
- Full GPU access for containers via `--gpus all`

Installing a Linux driver will break this.

---

## 3. Triton Inference Server

### 3.1 Deploy

```bash
# From repo root (WSL or Windows terminal)
docker compose -f docker/docker-compose.triton.yml up -d
```

Or use the setup script:
```bash
bash scripts/wsl/setup-triton.sh
```

### 3.2 Verify

```bash
# Health
curl http://localhost:8000/v2/health/ready
# → returns empty 200 if ready

# List models
curl -s http://localhost:8000/v2/models | jq .

# Server metadata
curl -s http://localhost:8000/v2 | jq .
```

### 3.3 Add a Model

1. Export model to ONNX:
```bash
pip install optimum[exporters]
optimum-cli export onnx --model BAAI/bge-small-en-v1.5 ./bge_small_en_onnx/
```

2. Copy into Triton volume:
```bash
# Create model directory structure
docker exec triton-inference mkdir -p /models/bge_small_en/1

# Copy model file
docker cp ./bge_small_en_onnx/model.onnx triton-inference:/models/bge_small_en/1/model.onnx

# Copy config
docker cp docker/triton-models/bge_small_en/config.pbtxt triton-inference:/models/bge_small_en/config.pbtxt
```

3. Restart Triton to pick up the new model:
```bash
docker compose -f docker/docker-compose.triton.yml restart triton
```

4. Verify model loaded:
```bash
curl -s http://localhost:8000/v2/models/bge_small_en/ready
```

### 3.4 Endpoints

| Protocol | URL | Use |
|---|---|---|
| HTTP/REST | `http://localhost:8000` | General inference |
| gRPC | `grpc://localhost:8001` | High-throughput inference |
| Metrics | `http://localhost:8002/metrics` | Prometheus scraping |

### 3.5 Logs

```bash
docker compose -f docker/docker-compose.triton.yml logs -f triton
```

---

## 4. TensorRT / TensorRT-LLM

### 4.1 TensorRT Engine Build

Convert ONNX to TensorRT for maximum RTX 5090 performance:

```bash
# Use the TensorRT container
docker run --rm --gpus all \
    -v $(pwd)/models:/models \
    nvcr.io/nvidia/tensorrt:25.01-py3 \
    trtexec \
        --onnx=/models/model.onnx \
        --saveEngine=/models/model.plan \
        --fp16 \
        --workspace=4096
```

### 4.2 TensorRT-LLM (for LLMs)

For LLM serving with TensorRT-LLM:

1. Build the engine:
```bash
docker run --rm --gpus all \
    -v $(pwd)/engines:/engines \
    nvcr.io/nvidia/tritonserver:25.01-trtllm-python-py3 \
    python3 /app/tensorrt_llm/examples/llama/convert_checkpoint.py \
        --model_dir /models/llama-7b \
        --output_dir /engines/llama-7b \
        --dtype float16
```

2. Uncomment the `triton-trtllm` service in `docker/docker-compose.triton.yml`

3. Deploy:
```bash
docker compose -f docker/docker-compose.triton.yml up -d triton-trtllm
```

### 4.3 When to Use What

| Runtime | Best For | Latency | Setup Effort |
|---|---|---|---|
| Ollama | Dev iteration, quick testing | Moderate | Zero |
| Triton + ONNX | Embedding models, small models | Low | Low |
| Triton + TensorRT | Production models, max throughput | Lowest | Medium |
| Triton + TensorRT-LLM | LLM serving, batched inference | Lowest for LLMs | High |

---

## 5. Riva Speech AI (Optional)

### 5.1 Prerequisites

- NGC API key from https://ngc.nvidia.com
- At least 8 GB VRAM free (ASR + TTS models)

### 5.2 Deploy

```bash
# Set NGC key
export NGC_API_KEY=<your-key>

# Run setup (downloads models, starts server)
bash scripts/wsl/setup-riva.sh
```

Or manually:
```bash
# Download models (once, takes 10-30 min)
docker compose -f docker/docker-compose.riva.yml run --rm riva-init

# Start server
docker compose -f docker/docker-compose.riva.yml up -d riva-speech
```

### 5.3 Test

```bash
# Install Riva client
pip install nvidia-riva-client

# Test ASR
python3 -c "
import riva.client
auth = riva.client.Auth(uri='localhost:50051')
asr = riva.client.ASRService(auth)
print('ASR service connected')
"

# Test TTS
python3 -c "
import riva.client
auth = riva.client.Auth(uri='localhost:50051')
tts = riva.client.SpeechSynthesisService(auth)
resp = tts.synthesize('Hello from Riva', language_code='en-US')
print(f'TTS: {len(resp.audio)} bytes generated')
"
```

### 5.4 VRAM Budget

| Service | Approx VRAM |
|---|---|
| Ollama (qwen2.5:7b) | ~5 GB |
| Triton (bge_small_en) | ~0.5 GB |
| Riva ASR (Conformer) | ~2 GB |
| Riva TTS (FastPitch+HiFiGAN) | ~1 GB |
| **Total** | **~8.5 GB** |

With 24 GB VRAM, there's headroom for additional models or larger LLMs.

---

## 6. Validation

### 6.1 Windows Host

```powershell
.\scripts\windows\verify-nvidia-host.ps1
```

Expected: All required checks PASS (NVIDIA driver, GPU, CUDA, WSL2, Docker).

### 6.2 WSL GPU Runtime

```bash
bash wsl/validate.sh
```

Expected: GPU visible, Docker GPU passthrough working, container toolkit installed.

### 6.3 Quick GPU Check

```bash
bash scripts/wsl/validate-gpu.sh
```

Shows GPU status, processes, and service reachability.

### 6.4 Inference Benchmark

```bash
bash scripts/wsl/benchmark-inference.sh
```

Compares Ollama and Triton response times.

---

## 7. Finn Voice Integration

### 7.1 Architecture

```
                  ┌─── Riva ASR ──→ text ──→ Agent ──→ Riva TTS ───┐
Mic ──→ Finn ─────┤                                                  ├──→ Speaker
                  └─── Whisper ──→ text ──→ Agent ──→ Piper ────────┘
                       (fallback)                     (fallback)
```

### 7.2 Configuration

Use the `profiles/finn-voice-riva.env` profile:

```env
FINN_SPEECH_BACKEND=riva
FINN_RIVA_ENDPOINT=localhost:50051
FINN_SPEECH_FALLBACK=whisper+piper
```

### 7.3 Routing Logic

Finn should attempt Riva first, fall back to local:

```python
# Pseudocode for speech routing
async def recognize_speech(audio):
    if riva_available():
        return await riva_asr(audio, endpoint=FINN_RIVA_ENDPOINT)
    else:
        return await whisper_recognize(audio, model=FINN_WHISPER_MODEL)

async def synthesize_speech(text):
    if riva_available():
        return await riva_tts(text, endpoint=FINN_RIVA_ENDPOINT)
    else:
        return piper_synthesize(text, model=FINN_PIPER_MODEL)
```

### 7.4 Existing Fallback Path

Current Finn voice pipeline (unchanged):
- STT: openai-whisper `base` model on `cuda:0`
- TTS: Piper `en_US-ryan-high.onnx` (115 MB, single speaker, 22050 Hz)
- Tuning: length_scale=0.92, noise_scale=0.667, noise_w=0.8

---

## 8. Profiling with Nsight

### 8.1 When to Profile

Profile **after** the stack is stable and you have a specific performance question:
- Why is inference slow?
- Where is the GPU bottleneck?
- Is the model memory-bound or compute-bound?

### 8.2 Nsight Systems (System-Level)

Full system trace — CPU/GPU activity, CUDA API calls, memory transfers:

```powershell
# Profile a Python script
nsys profile --output $env:NSIGHT_REPORT_DIR\trace_001 python my_inference.py

# Profile a running container (from Windows)
nsys profile --target-processes-filter=tritonserver --duration=30 --output $env:NSIGHT_REPORT_DIR\triton_trace
```

Open the `.nsys-rep` file in Nsight Systems GUI to analyze.

### 8.3 Nsight Compute (Kernel-Level)

Deep-dive into individual CUDA kernels:

```powershell
# Profile specific kernel
ncu --target-processes all --set full --output $env:NSIGHT_REPORT_DIR\kernel_001 python my_inference.py
```

Open the `.ncu-rep` file in Nsight Compute GUI.

### 8.4 Quick GPU Monitoring

```powershell
# Live GPU usage (Windows)
nvidia-smi dmon -d 1

# From WSL
watch -n 1 nvidia-smi
```

---

## 9. Rollback

### 9.1 Stop All GPU Services

```bash
# Triton
docker compose -f docker/docker-compose.triton.yml down

# Riva (if running)
docker compose -f docker/docker-compose.riva.yml down
```

### 9.2 Remove Containers and Volumes

```bash
# Remove containers only (keeps model data)
docker compose -f docker/docker-compose.triton.yml down

# Remove containers AND volumes (deletes model data)
docker compose -f docker/docker-compose.triton.yml down -v
docker compose -f docker/docker-compose.riva.yml down -v
```

### 9.3 Revert to Ollama-only

1. Stop Triton and Riva (above)
2. Finn: set `FINN_SPEECH_BACKEND=whisper+piper` (no Riva)
3. OpenClaw/Open WebUI: already point at Ollama by default
4. No NVIDIA driver changes needed

### 9.4 WSL Reset (Nuclear Option)

```powershell
# Unregister distro (destroys all data inside WSL)
wsl --unregister Ubuntu

# Reinstall
wsl --install -d Ubuntu
```

### 9.5 Docker Desktop Reset

Settings → Troubleshoot → Reset to factory defaults.

---

## 10. Troubleshooting

### Docker GPU not working

```
docker: Error response from daemon: could not select device driver "" with capabilities: [[gpu]]
```

**Fix**:
1. Ensure Windows NVIDIA driver is installed (not Linux driver in WSL)
2. Install nvidia-container-toolkit in WSL: `bash wsl/bootstrap.sh`
3. Restart Docker Desktop
4. Test: `docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi`

### Triton won't start

```
docker compose -f docker/docker-compose.triton.yml logs triton
```

Common issues:
- **No models**: Triton starts but logs "no models loaded" — add models to the volume
- **OOM**: Reduce `instance_group.count` in config.pbtxt or use smaller batch sizes
- **Image pull fails**: Login to NGC first: `docker login nvcr.io`

### Triton first inference timeout

Triton's first inference after cold start can take 30+ seconds due to:
- GPU warm-up
- ONNX external data loading
- TensorRT optimization at load time

Set client timeout to ≥ 30s for first request.

### WSL memory exhaustion

If containers crash or WSL becomes unresponsive:

```powershell
# Check WSL memory
wsl -- free -h

# If needed, increase in .wslconfig
# Then restart
wsl --shutdown
```

### CUDA version mismatch

The RTX 5090 with driver 581.95 supports CUDA 13.0. The CUDA Toolkit 13.2 PTX
may be incompatible. If you see PTX compilation errors:
- Use CUDA 12.8 toolkit containers (widely compatible)
- Or wait for a driver update supporting CUDA 13.2

### Path performance

Operations on `/mnt/c/` from WSL are slow (9p filesystem). Keep:
- Heavy model files in WSL filesystem (`~/projects/`) or Docker volumes
- Source code in WSL for build performance
- Repo config/scripts on Windows side (shared via `/mnt/c/`)

### libuv assertion crash on Windows

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

This is a known Node.js/Windows race condition during `process.exit()`.
Does not affect actual results. Fixed in `smoke-test.mjs` by draining
HTTP sockets before exit.

---

## 11. Smoke Test Checklist

Run after initial setup or after any infrastructure changes.

### Windows Host

```powershell
.\scripts\windows\verify-nvidia-host.ps1
```

| Check | Expected |
|---|---|
| nvidia-smi runs | PASS — driver version, GPU name, VRAM |
| CUDA Toolkit | PASS — nvcc version |
| WSL2 enabled | PASS — Ubuntu running |
| .wslconfig memory ≥ 16GB | PASS |
| Docker Desktop | PASS — version ≥ 4.33.0 |
| Docker GPU passthrough | PASS |
| Ollama reachable | PASS — models listed |
| OpenClaw Gateway | PASS — healthy |

### WSL GPU Runtime

```bash
bash wsl/validate.sh
```

| Check | Expected |
|---|---|
| GPU visible (nvidia-smi) | PASS — RTX 5090 |
| CUDA driver libs exist | PASS — /usr/lib/wsl/lib |
| Docker running | PASS |
| Docker GPU passthrough | PASS |
| nvidia-container-toolkit | PASS |

### Inference Services

| Check | Command | Expected |
|---|---|---|
| Ollama health | `curl http://localhost:11434/api/tags` | 200 + models |
| Triton health | `curl http://localhost:8000/v2/health/ready` | 200 |
| Triton models | `curl http://localhost:8000/v2/models` | Model list |
| OpenClaw validate | `npm run openclaw:validate` | ALL CHECKS PASSED |
| OpenClaw smoke | `npm run openclaw:smoke` | SMOKE TEST PASSED |

### Optional Services

| Check | Command | Expected |
|---|---|---|
| Riva gRPC | `grpcurl -plaintext localhost:50051 list` | Service list |
| Benchmark | `bash scripts/wsl/benchmark-inference.sh` | Timing output |
