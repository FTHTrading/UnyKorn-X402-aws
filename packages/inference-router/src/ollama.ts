/**
 * Ollama embedding client.
 * Uses POST /api/embeddings — Ollama's native embedding API.
 */

import type { Config } from "./config.js";

export interface OllamaEmbeddingResult {
  embeddings: number[][];
  model: string;
  tokenCount: number;
  latencyMs: number;
}

/**
 * Call Ollama's embedding endpoint for one or more texts.
 * Ollama processes one text at a time via /api/embeddings.
 */
export async function ollamaEmbed(
  texts: string[],
  cfg: Config,
): Promise<OllamaEmbeddingResult> {
  const start = performance.now();
  const allEmbeddings: number[][] = [];
  let totalTokens = 0;

  for (const text of texts) {
    const resp = await fetch(`${cfg.ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.ollamaModel, prompt: text }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Ollama returned ${resp.status}: ${body}`);
    }

    const result = await resp.json() as { embedding: number[] };
    if (!result.embedding) throw new Error("Ollama: missing embedding in response");

    allEmbeddings.push(result.embedding);
    // Rough token estimate: ~4 chars per token for English
    totalTokens += Math.ceil(text.length / 4);
  }

  return {
    embeddings: allEmbeddings,
    model: cfg.ollamaModel,
    tokenCount: totalTokens,
    latencyMs: performance.now() - start,
  };
}

/** Health check: GET /api/tags */
export async function ollamaHealthy(baseUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
