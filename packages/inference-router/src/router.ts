/**
 * Smart embedding router with health-aware failover.
 *
 * Priority: Triton TRT (fastest) → Triton ONNX (fallback) → Ollama (last resort)
 *
 * Each backend has a circuit breaker: after N consecutive failures it is
 * marked DOWN and skipped until the reset timer expires and a probe succeeds.
 */

import type { Config } from "./config.js";
import { tritonEmbed, tritonHealthy } from "./triton.js";
import { ollamaEmbed, ollamaHealthy } from "./ollama.js";

export type BackendId = "triton-trt" | "triton-onnx" | "ollama";

interface BackendState {
  id: BackendId;
  healthy: boolean;
  consecutiveFailures: number;
  lastFailure: number;
  lastSuccess: number;
  totalRequests: number;
  totalErrors: number;
}

export interface EmbedResult {
  embeddings: number[][];
  model: string;
  backend: BackendId;
  tokenCount: number;
  latencyMs: number;
}

export class EmbeddingRouter {
  private states: Map<BackendId, BackendState>;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private cfg: Config) {
    this.states = new Map([
      ["triton-trt", this.freshState("triton-trt")],
      ["triton-onnx", this.freshState("triton-onnx")],
      ["ollama", this.freshState("ollama")],
    ]);
  }

  private freshState(id: BackendId): BackendState {
    return {
      id,
      healthy: true, // optimistic start
      consecutiveFailures: 0,
      lastFailure: 0,
      lastSuccess: 0,
      totalRequests: 0,
      totalErrors: 0,
    };
  }

  /** Start periodic health probes. */
  startHealthChecks(): void {
    if (this.healthTimer) return;
    // Fire immediately, then on interval
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
    const [trt, onnx, ollama] = await Promise.allSettled([
      tritonHealthy(this.cfg.tritonUrl, this.cfg.tritonTrtModel),
      tritonHealthy(this.cfg.tritonUrl, this.cfg.tritonOnnxModel),
      ollamaHealthy(this.cfg.ollamaUrl),
    ]);

    this.applyProbe("triton-trt", trt.status === "fulfilled" && trt.value);
    this.applyProbe("triton-onnx", onnx.status === "fulfilled" && onnx.value);
    this.applyProbe("ollama", ollama.status === "fulfilled" && ollama.value);
  }

  private applyProbe(id: BackendId, up: boolean): void {
    const s = this.states.get(id)!;
    if (up) {
      s.healthy = true;
      s.consecutiveFailures = 0;
      s.lastSuccess = Date.now();
    }
    // Don't mark healthy→unhealthy from probes alone;
    // circuit breaker handles request failures.
  }

  /** Return ordered list of backends to try. */
  private candidates(): BackendId[] {
    const order: BackendId[] = ["triton-trt", "triton-onnx", "ollama"];
    const now = Date.now();
    return order.filter((id) => {
      const s = this.states.get(id)!;
      if (s.healthy) return true;
      // Allow retry after reset window
      if (now - s.lastFailure > this.cfg.circuitBreakerResetMs) return true;
      return false;
    });
  }

  /** Route an embedding request with automatic failover. */
  async embed(texts: string[]): Promise<EmbedResult> {
    const backends = this.candidates();
    if (backends.length === 0) {
      throw new Error("All embedding backends are DOWN");
    }

    let lastError: Error | null = null;

    for (const id of backends) {
      const s = this.states.get(id)!;
      s.totalRequests++;

      try {
        const result = await this.callBackend(id, texts);
        s.healthy = true;
        s.consecutiveFailures = 0;
        s.lastSuccess = Date.now();
        return { ...result, backend: id };
      } catch (err) {
        lastError = err as Error;
        s.totalErrors++;
        s.consecutiveFailures++;
        s.lastFailure = Date.now();
        if (s.consecutiveFailures >= this.cfg.circuitBreakerThreshold) {
          s.healthy = false;
        }
        const next = backends[backends.indexOf(id) + 1];
        console.warn(
          `[router] ${id} failed (${s.consecutiveFailures}/${this.cfg.circuitBreakerThreshold}): ${(err as Error).message}` +
          (next ? ` → trying ${next}` : " → no more backends"),
        );
      }
    }

    throw lastError ?? new Error("All embedding backends failed");
  }

  private async callBackend(
    id: BackendId,
    texts: string[],
  ): Promise<Omit<EmbedResult, "backend">> {
    switch (id) {
      case "triton-trt": {
        const r = await tritonEmbed(texts, this.cfg.tritonTrtModel, this.cfg);
        return { embeddings: r.embeddings, model: r.model, tokenCount: r.tokenCount, latencyMs: r.latencyMs };
      }
      case "triton-onnx": {
        const r = await tritonEmbed(texts, this.cfg.tritonOnnxModel, this.cfg);
        return { embeddings: r.embeddings, model: r.model, tokenCount: r.tokenCount, latencyMs: r.latencyMs };
      }
      case "ollama": {
        const r = await ollamaEmbed(texts, this.cfg);
        return { embeddings: r.embeddings, model: r.model, tokenCount: r.tokenCount, latencyMs: r.latencyMs };
      }
    }
  }

  /** Snapshot of all backend states for the status endpoint. */
  getStatus(): Array<BackendState & { circuitOpen: boolean }> {
    const now = Date.now();
    return [...this.states.values()].map((s) => ({
      ...s,
      circuitOpen: !s.healthy && (now - s.lastFailure <= this.cfg.circuitBreakerResetMs),
    }));
  }
}
