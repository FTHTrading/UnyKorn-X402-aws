/**
 * Riva NIM ASR client — Parakeet CTC 1.1B
 *
 * HTTP API at RIVA_ASR_URL (default http://localhost:9010).
 * Endpoint: POST /asr/transcribe (multipart/form-data with audio file)
 * Health:   GET  /v1/health/ready
 */

import type { Config } from "./config.js";

export interface TranscriptionResult {
  text: string;
  language: string;
  latencyMs: number;
}

/** Check if ASR NIM is healthy. */
export async function asrHealthy(asrUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${asrUrl}/v1/health/ready`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Transcribe audio via Riva ASR NIM HTTP API.
 *
 * The Parakeet NIM accepts audio as multipart form data:
 *   - file: audio binary (wav, flac, mp3, etc.)
 *   - response_format: "json" | "text" | "verbose_json"
 *   - language: "en" (default)
 */
export async function asrTranscribe(
  cfg: Config,
  audioBuffer: Buffer,
  filename: string,
  language?: string,
): Promise<TranscriptionResult> {
  const t0 = performance.now();

  const form = new FormData();
  form.append("file", new Blob([audioBuffer]), filename);
  form.append("response_format", "verbose_json");
  if (language) form.append("language", language);

  const res = await fetch(`${cfg.rivaAsrUrl}/v1/audio/transcriptions`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ASR NIM error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { text: string; language?: string };
  return {
    text: data.text,
    language: data.language ?? language ?? "en",
    latencyMs: performance.now() - t0,
  };
}
