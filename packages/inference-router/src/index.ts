/**
 * Inference Router — OpenAI-compatible embedding API
 *
 * Routes: Triton TRT → Triton ONNX → Ollama with circuit-breaker failover.
 * Port: 8100 (configurable via ROUTER_PORT)
 *
 * Endpoints:
 *   POST /v1/embeddings   — OpenAI-compatible embedding API
 *   GET  /health           — Service health
 *   GET  /v1/backends      — Backend status with circuit breaker state
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config.js";
import { EmbeddingRouter } from "./router.js";

const cfg = loadConfig();
const router = new EmbeddingRouter(cfg);

const app = Fastify({ logger: true });
await app.register(cors);

// ── Health ──────────────────────────────────────────────────────────────────

app.get("/health", async () => {
  const backends = router.getStatus();
  const anyHealthy = backends.some((b) => !b.circuitOpen);
  return { status: anyHealthy ? "ok" : "degraded", backends: backends.length };
});

// ── Backend Status ──────────────────────────────────────────────────────────

app.get("/v1/backends", async () => {
  return { backends: router.getStatus() };
});

// ── OpenAI-Compatible Embeddings ────────────────────────────────────────────

interface EmbeddingRequest {
  input: string | string[];
  model?: string;
  encoding_format?: "float" | "base64";
}

app.post<{ Body: EmbeddingRequest }>("/v1/embeddings", async (request, reply) => {
  const { input, model } = request.body ?? {};

  if (!input) {
    reply.status(400);
    return { error: { message: "Missing required field: input", type: "invalid_request_error" } };
  }

  const texts = Array.isArray(input) ? input : [input];
  if (texts.length === 0 || texts.some((t) => typeof t !== "string")) {
    reply.status(400);
    return { error: { message: "input must be a non-empty string or array of strings", type: "invalid_request_error" } };
  }

  const result = await router.embed(texts);

  // OpenAI-compatible response
  return {
    object: "list",
    data: result.embeddings.map((embedding, index) => ({
      object: "embedding",
      index,
      embedding,
    })),
    model: model ?? result.model,
    usage: {
      prompt_tokens: result.tokenCount,
      total_tokens: result.tokenCount,
    },
    // Extra metadata (non-standard but useful)
    _backend: result.backend,
    _latency_ms: Math.round(result.latencyMs * 100) / 100,
  };
});

// ── Start ───────────────────────────────────────────────────────────────────

router.startHealthChecks();

try {
  await app.listen({ port: cfg.port, host: cfg.host });
  app.log.info(`Inference router listening on ${cfg.host}:${cfg.port}`);
  app.log.info(`Backends: TRT=${cfg.tritonTrtModel} ONNX=${cfg.tritonOnnxModel} Ollama=${cfg.ollamaModel}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    router.stopHealthChecks();
    await app.close();
    process.exit(0);
  });
}
