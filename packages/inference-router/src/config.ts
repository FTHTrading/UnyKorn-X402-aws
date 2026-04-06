/** Environment configuration for inference router. */

export interface Config {
  port: number;
  host: string;

  tritonUrl: string;      // e.g. http://localhost:8000
  tritonTrtModel: string;  // e.g. bge-small-trt
  tritonOnnxModel: string; // e.g. bge-small
  ollamaUrl: string;       // e.g. http://localhost:11434
  ollamaModel: string;     // e.g. nomic-embed-text

  // Tokenizer model ID for HuggingFace (downloads vocab on first run)
  tokenizerModel: string;
  maxSeqLen: number;

  // Health check
  healthIntervalMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export function loadConfig(): Config {
  return {
    port: int(process.env.ROUTER_PORT, 8100),
    host: process.env.ROUTER_HOST ?? "0.0.0.0",

    tritonUrl: process.env.TRITON_URL ?? "http://localhost:8000",
    tritonTrtModel: process.env.TRITON_TRT_MODEL ?? "bge-small-trt",
    tritonOnnxModel: process.env.TRITON_ONNX_MODEL ?? "bge-small",
    ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "nomic-embed-text",

    tokenizerModel: process.env.TOKENIZER_MODEL ?? "BAAI/bge-small-en-v1.5",
    maxSeqLen: int(process.env.MAX_SEQ_LEN, 128),

    healthIntervalMs: int(process.env.HEALTH_INTERVAL_MS, 10_000),
    circuitBreakerThreshold: int(process.env.CB_THRESHOLD, 3),
    circuitBreakerResetMs: int(process.env.CB_RESET_MS, 30_000),
  };
}

function int(val: string | undefined, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}
