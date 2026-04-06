/**
 * Riva NIM TTS client — Magpie Multilingual
 *
 * HTTP API at RIVA_TTS_URL (default http://localhost:9020).
 * Health: GET /v1/health/ready
 *
 * Magpie TTS NIM exposes an OpenAI-compatible TTS endpoint:
 *   POST /v1/audio/speech
 *   Body: { model, input, voice, response_format, speed }
 *   Returns: audio binary (wav, pcm, mp3, etc.)
 */

import type { Config } from "./config.js";

export interface SynthesisResult {
  audio: Buffer;
  contentType: string;
  latencyMs: number;
}

/** Check if TTS NIM is healthy. */
export async function ttsHealthy(ttsUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${ttsUrl}/v1/health/ready`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Synthesize speech via Riva TTS NIM.
 *
 * Magpie TTS voices (en-US): English-US.Male-1, English-US.Female-1, etc.
 * Formats: wav, pcm, mp3
 */
export async function ttsSynthesize(
  cfg: Config,
  text: string,
  voice?: string,
  responseFormat?: string,
  speed?: number,
): Promise<SynthesisResult> {
  const t0 = performance.now();

  const payload = {
    model: "magpie-tts-multilingual",
    input: text,
    voice: voice ?? cfg.defaultVoice,
    response_format: responseFormat ?? "wav",
    speed: speed ?? 1.0,
  };

  const res = await fetch(`${cfg.rivaTtsUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TTS NIM error ${res.status}: ${body}`);
  }

  const contentType = res.headers.get("content-type") ?? "audio/wav";
  const arrayBuf = await res.arrayBuffer();

  return {
    audio: Buffer.from(arrayBuf),
    contentType,
    latencyMs: performance.now() - t0,
  };
}
