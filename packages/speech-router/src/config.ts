/** Environment configuration for speech router. */

export interface Config {
  port: number;
  host: string;

  // Riva NIM endpoints
  rivaAsrUrl: string;    // HTTP API, e.g. http://localhost:9010
  rivaTtsUrl: string;    // HTTP API, e.g. http://localhost:9020

  // TTS defaults
  defaultVoice: string;
  defaultSampleRate: number;

  // Circuit breaker
  healthIntervalMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export function loadConfig(): Config {
  return {
    port: int(process.env.SPEECH_ROUTER_PORT, 8200),
    host: process.env.SPEECH_ROUTER_HOST ?? "0.0.0.0",

    rivaAsrUrl: process.env.RIVA_ASR_URL ?? "http://localhost:9010",
    rivaTtsUrl: process.env.RIVA_TTS_URL ?? "http://localhost:9020",

    defaultVoice: process.env.RIVA_TTS_VOICE ?? "English-US.Male-1",
    defaultSampleRate: int(process.env.RIVA_TTS_SAMPLE_RATE, 22050),

    healthIntervalMs: int(process.env.HEALTH_INTERVAL_MS, 10_000),
    circuitBreakerThreshold: int(process.env.CB_THRESHOLD, 3),
    circuitBreakerResetMs: int(process.env.CB_RESET_MS, 30_000),
  };
}

function int(val: string | undefined, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}
