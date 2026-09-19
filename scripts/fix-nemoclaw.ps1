# fix-nemoclaw.ps1 — repair nemoclaw venv (chromadb / opentelemetry) and smoke-test RAG
$ErrorActionPreference = "Stop"
$Root = "C:\Users\Kevan\UnyKorn-X402-aws\packages\nemoclaw"
$Venv = Join-Path $Root ".venv"

if (-not (Test-Path $Venv)) {
    Write-Host "Creating venv..."
    python -m venv $Venv
}

$Py = Join-Path $Venv "Scripts\python.exe"
$Pip = Join-Path $Venv "Scripts\pip.exe"

& $Pip install -U pip wheel | Out-Null
& $Pip install -r (Join-Path $Root "requirements.txt")
# Pin opentelemetry stack when chromadb import breaks (AttributeError on trace API)
& $Pip install "opentelemetry-api>=1.27.0" "opentelemetry-sdk>=1.27.0" "opentelemetry-exporter-otlp-proto-grpc>=1.27.0"

Write-Host "Smoke: chromadb import..."
& $Py -c "import chromadb; print('chromadb OK', chromadb.__version__)"

Write-Host "Smoke: VectorStore..."
Push-Location $Root
& $Py -c "from rag.store import VectorStore; print('VectorStore OK')"
Pop-Location

Write-Host ""
Write-Host "Embedder backends (optional for quality RAG):"
Write-Host "  INFERENCE_ROUTER_URL=http://localhost:8100"
Write-Host "  CLAWDBOT_URL=http://localhost:8089"
Write-Host "Without these, nemoclaw runs but uses zero-vector embeddings."
Write-Host ""
Write-Host "Start: cd $Root; .\venv\Scripts\python.exe start.py"
Write-Host "PM2:  pm2 start ecosystem.config.js --only nemoclaw  (if configured)"
