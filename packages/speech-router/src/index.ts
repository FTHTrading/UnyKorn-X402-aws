/**
 * Speech Router — OpenAI-compatible Speech API
 *
 * Routes ASR/TTS through Riva NIMs with circuit-breaker failover.
 * Port: 8200 (configurable via SPEECH_ROUTER_PORT)
 *
 * Endpoints:
 *   POST /v1/audio/transcriptions  — OpenAI-compatible STT (multipart)
 *   POST /v1/audio/speech           — OpenAI-compatible TTS (JSON → audio)
 *   GET  /health                    — Service health
 *   GET  /v1/backends               — Backend status with circuit breaker state
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { loadConfig } from "./config.js";
import { SpeechRouter } from "./router.js";

const cfg = loadConfig();
const router = new SpeechRouter(cfg);

const app = Fastify({
  logger: true,
  bodyLimit: 25 * 1024 * 1024, // 25 MB for audio uploads
});
await app.register(cors);
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

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

// ── OpenAI-Compatible Speech-to-Text ────────────────────────────────────────

app.post("/v1/audio/transcriptions", async (request, reply) => {
  const data = await request.file();
  if (!data) {
    reply.status(400);
    return {
      error: {
        message: "Missing audio file. Send multipart/form-data with a 'file' field.",
        type: "invalid_request_error",
      },
    };
  }

  const audioBuffer = await data.toBuffer();
  const filename = data.filename ?? "audio.wav";

  // Extract optional fields from multipart
  const fields = data.fields as Record<string, { value?: string } | undefined>;
  const language = fields?.language?.value;

  const result = await router.transcribe(audioBuffer, filename, language);

  return {
    text: result.text,
    language: result.language,
    _backend: result.backend,
    _latency_ms: Math.round(result.latencyMs * 100) / 100,
  };
});

// ── OpenAI-Compatible Text-to-Speech ────────────────────────────────────────

interface TtsRequest {
  model?: string;
  input: string;
  voice?: string;
  response_format?: string;
  speed?: number;
}

app.post<{ Body: TtsRequest }>("/v1/audio/speech", async (request, reply) => {
  const { input, voice, response_format, speed } = request.body ?? {};

  if (!input || typeof input !== "string") {
    reply.status(400);
    return {
      error: {
        message: "Missing required field: input (string)",
        type: "invalid_request_error",
      },
    };
  }

  if (input.length > 4096) {
    reply.status(400);
    return {
      error: {
        message: "input exceeds maximum length of 4096 characters",
        type: "invalid_request_error",
      },
    };
  }

  const result = await router.synthesize(input, voice, response_format, speed);

  reply.header("Content-Type", result.contentType);
  reply.header("X-Backend", result.backend);
  reply.header("X-Latency-Ms", Math.round(result.latencyMs * 100) / 100);
  return reply.send(result.audio);
});

// ── Start ───────────────────────────────────────────────────────────────────

router.startHealthChecks();

try {
  await app.listen({ port: cfg.port, host: cfg.host });
  app.log.info(`Speech router listening on ${cfg.host}:${cfg.port}`);
  app.log.info(`ASR: ${cfg.rivaAsrUrl}  TTS: ${cfg.rivaTtsUrl}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    router.stopHealthChecks();
    await app.close();
    process.exit(0);
  });
}
