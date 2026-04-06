/**
 * Speech router with health-aware failover.
 *
 * ASR: Riva ASR NIM → error (no local fallback wired yet)
 * TTS: Riva TTS NIM → error (Piper fallback can be added later)
 *
 * Each backend has a circuit breaker: after N consecutive failures it is
 * marked DOWN and skipped until the reset timer expires and a probe succeeds.
 */

import type { Config } from "./config.js";
import { asrHealthy, asrTranscribe, type TranscriptionResult } from "./asr.js";
import { ttsHealthy, ttsSynthesize, type SynthesisResult } from "./tts.js";

export type AsrBackendId = "riva-asr";
export type TtsBackendId = "riva-tts";

interface BackendState {
  id: string;
  healthy: boolean;
  consecutiveFailures: number;
  lastFailure: number;
  lastSuccess: number;
  totalRequests: number;
  totalErrors: number;
}

export class SpeechRouter {
  private asrState: BackendState;
  private ttsState: BackendState;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private cfg: Config) {
    this.asrState = this.freshState("riva-asr");
    this.ttsState = this.freshState("riva-tts");
  }

  private freshState(id: string): BackendState {
    return {
      id,
      healthy: true, // optimistic
      consecutiveFailures: 0,
      lastFailure: 0,
      lastSuccess: 0,
      totalRequests: 0,
      totalErrors: 0,
    };
  }

  startHealthChecks(): void {
    if (this.healthTimer) return;
    this.probeAll();
    this.healthTimer = setInterval(() => this.probeAll(), this.cfg.healthIntervalMs);
  }

  stopHealthChecks(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private async probeAll(): Promise<void> {
    const [asr, tts] = await Promise.allSettled([
      asrHealthy(this.cfg.rivaAsrUrl),
      ttsHealthy(this.cfg.rivaTtsUrl),
    ]);

    this.applyProbe(this.asrState, asr.status === "fulfilled" && asr.value);
    this.applyProbe(this.ttsState, tts.status === "fulfilled" && tts.value);
  }

  private applyProbe(s: BackendState, up: boolean): void {
    if (up) {
      s.healthy = true;
      s.consecutiveFailures = 0;
      s.lastSuccess = Date.now();
    }
  }

  private isAvailable(s: BackendState): boolean {
    if (s.healthy) return true;
    return Date.now() - s.lastFailure > this.cfg.circuitBreakerResetMs;
  }

  private markSuccess(s: BackendState): void {
    s.healthy = true;
    s.consecutiveFailures = 0;
    s.lastSuccess = Date.now();
  }

  private markFailure(s: BackendState): void {
    s.consecutiveFailures++;
    s.totalErrors++;
    s.lastFailure = Date.now();
    if (s.consecutiveFailures >= this.cfg.circuitBreakerThreshold) {
      s.healthy = false;
      console.warn(`[speech-router] Circuit OPEN for ${s.id} after ${s.consecutiveFailures} failures`);
    }
  }

  /** Transcribe audio. */
  async transcribe(
    audioBuffer: Buffer,
    filename: string,
    language?: string,
  ): Promise<TranscriptionResult & { backend: AsrBackendId }> {
    this.asrState.totalRequests++;

    if (!this.isAvailable(this.asrState)) {
      throw new Error("ASR backend is DOWN (circuit open)");
    }

    try {
      const result = await asrTranscribe(this.cfg, audioBuffer, filename, language);
      this.markSuccess(this.asrState);
      return { ...result, backend: "riva-asr" };
    } catch (err) {
      this.markFailure(this.asrState);
      throw err;
    }
  }

  /** Synthesize speech. */
  async synthesize(
    text: string,
    voice?: string,
    responseFormat?: string,
    speed?: number,
  ): Promise<SynthesisResult & { backend: TtsBackendId }> {
    this.ttsState.totalRequests++;

    if (!this.isAvailable(this.ttsState)) {
      throw new Error("TTS backend is DOWN (circuit open)");
    }

    try {
      const result = await ttsSynthesize(this.cfg, text, voice, responseFormat, speed);
      this.markSuccess(this.ttsState);
      return { ...result, backend: "riva-tts" };
    } catch (err) {
      this.markFailure(this.ttsState);
      throw err;
    }
  }

  getStatus() {
    return [this.asrState, this.ttsState].map((s) => ({
      id: s.id,
      healthy: s.healthy,
      circuitOpen: !this.isAvailable(s),
      totalRequests: s.totalRequests,
      totalErrors: s.totalErrors,
      consecutiveFailures: s.consecutiveFailures,
    }));
  }
}
