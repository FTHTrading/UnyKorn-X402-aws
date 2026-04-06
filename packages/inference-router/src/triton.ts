/**
 * Triton Inference Server client for BGE-small embedding models.
 * Handles tokenization via @huggingface/transformers and calls
 * Triton's V2 HTTP inference API.
 */

import type { Config } from "./config.js";

// Lazy-loaded tokenizer from @huggingface/transformers
let _tokenizer: any = null;

async function getTokenizer(modelId: string) {
  if (_tokenizer) return _tokenizer;
  const { AutoTokenizer } = await import("@huggingface/transformers");
  _tokenizer = await AutoTokenizer.from_pretrained(modelId);
  return _tokenizer;
}

export interface TritonEmbeddingResult {
  embeddings: number[][];
  model: string;
  tokenCount: number;
  latencyMs: number;
}

/**
 * Call a Triton embedding model (TRT or ONNX).
 * Tokenizes input text → sends token IDs to Triton → returns embeddings.
 */
export async function tritonEmbed(
  texts: string[],
  modelName: string,
  cfg: Config,
): Promise<TritonEmbeddingResult> {
  const tokenizer = await getTokenizer(cfg.tokenizerModel);
  const start = performance.now();
  const allEmbeddings: number[][] = [];
  let totalTokens = 0;

  // Process one text at a time (fixed shape 1×maxSeqLen)
  for (const text of texts) {
    const encoded = await tokenizer(text, {
      padding: "max_length",
      truncation: true,
      max_length: cfg.maxSeqLen,
      return_tensors: "js",
    });

    // Extract flat arrays from tokenizer output
    const inputIds = Array.from(encoded.input_ids.data as BigInt64Array, Number);
    const attentionMask = Array.from(encoded.attention_mask.data as BigInt64Array, Number);
    const tokenTypeIds = encoded.token_type_ids
      ? Array.from(encoded.token_type_ids.data as BigInt64Array, Number)
      : new Array(cfg.maxSeqLen).fill(0);

    // Count real tokens (non-padding)
    totalTokens += attentionMask.filter((v: number) => v === 1).length;

    const payload = {
      inputs: [
        { name: "input_ids", shape: [1, cfg.maxSeqLen], datatype: "INT64", data: inputIds },
        { name: "attention_mask", shape: [1, cfg.maxSeqLen], datatype: "INT64", data: attentionMask },
        { name: "token_type_ids", shape: [1, cfg.maxSeqLen], datatype: "INT64", data: tokenTypeIds },
      ],
      outputs: [{ name: "pooler_output" }],
    };

    const resp = await fetch(
      `${cfg.tritonUrl}/v2/models/${modelName}/infer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Triton ${modelName} returned ${resp.status}: ${body}`);
    }

    const result = await resp.json() as {
      outputs: Array<{ name: string; data: number[]; shape: number[] }>;
    };

    const poolerOutput = result.outputs.find((o) => o.name === "pooler_output");
    if (!poolerOutput) throw new Error(`Triton ${modelName}: missing pooler_output`);

    allEmbeddings.push(poolerOutput.data);
  }

  return {
    embeddings: allEmbeddings,
    model: modelName,
    tokenCount: totalTokens,
    latencyMs: performance.now() - start,
  };
}

/** Health check: GET /v2/models/{model}/ready */
export async function tritonHealthy(
  baseUrl: string,
  modelName: string,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `${baseUrl}/v2/models/${modelName}/ready`,
      { signal: AbortSignal.timeout(3_000) },
    );
    return resp.ok;
  } catch {
    return false;
  }
}
