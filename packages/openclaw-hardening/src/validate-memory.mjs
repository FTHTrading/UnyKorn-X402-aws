// ---------------------------------------------------------------------------
// OpenClaw Hardening — Memory Provider Validation
// ---------------------------------------------------------------------------
// Validates that memory embedding provider is correctly configured,
// reachable, and not silently falling back to "none" due to auto-selection
// skipping the Ollama adapter (the known root cause).
// ---------------------------------------------------------------------------

import { OLLAMA_DEFAULTS } from "./constants.mjs";
import { checkOllamaEmbedding } from "./validate-models.mjs";

/**
 * Validate memory search configuration from openclaw.json.
 *
 * ROOT CAUSE NOTE:
 * The Ollama embedding adapter does NOT set `autoSelectPriority`.
 * The auto-selection logic filters adapters by `typeof autoSelectPriority === "number"`,
 * which skips Ollama. When all builtin providers fail (no API keys), the result is
 * provider=null. Setting `memorySearch.provider = "ollama"` explicitly bypasses auto-mode.
 *
 * @param {object} config — full parsed openclaw.json
 * @returns {{ valid: boolean, errors: string[], warnings: string[], diagnostics: object }}
 */
export function validateMemoryConfig(config) {
  const errors = [];
  const warnings = [];
  const ms = config?.agents?.defaults?.memorySearch || {};

  const diagnostics = {
    enabled: ms.enabled ?? false,
    provider: ms.provider ?? "auto",
    sources: ms.sources ?? [],
    extraPaths: ms.extraPaths ?? [],
  };

  // 1. Check if memory is enabled at all
  if (!ms.enabled) {
    warnings.push(
      "memorySearch.enabled is false or not set. " +
      "Memory indexing and semantic search are disabled."
    );
    return { valid: true, errors, warnings, diagnostics };
  }

  // 2. Check provider is explicitly set (not "auto")
  if (!ms.provider || ms.provider === "auto") {
    errors.push(
      'memorySearch.provider is "auto" or not set. ' +
      "This is a KNOWN BUG: the Ollama embedding adapter lacks autoSelectPriority " +
      "and will be skipped during auto-selection. " +
      "All builtin providers (local, openai, gemini, voyage, mistral) also fail without API keys. " +
      "Result: provider = none, vector search disabled. " +
      'FIX: Run `openclaw config set agents.defaults.memorySearch.provider ollama`.'
    );
    return { valid: false, errors, warnings, diagnostics };
  }

  // 3. If provider is ollama, check Ollama provider config exists
  if (ms.provider === "ollama") {
    const ollamaConfig = config?.models?.providers?.ollama;
    if (!ollamaConfig) {
      errors.push(
        'memorySearch.provider is "ollama" but no Ollama provider is configured in models.providers. ' +
        "Add Ollama provider configuration to openclaw.json."
      );
    }

    // Check that nomic-embed-text (or configured embedding model) is in the model list
    const models = ollamaConfig?.models || [];
    const hasEmbeddingModel = models.some(
      m => (m.id || m.name || "").includes("nomic-embed-text") ||
           (m.id || m.name || "").includes("embed")
    );
    if (!hasEmbeddingModel) {
      warnings.push(
        "No embedding model (e.g. nomic-embed-text) found in Ollama model config. " +
        "Memory vector search may not work. " +
        'FIX: Pull the model with `ollama pull nomic-embed-text` and add it to config.'
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings, diagnostics };
}

/**
 * Full memory readiness check — config + live connectivity.
 * @param {object} config — parsed openclaw.json
 * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[], diagnostics: object }>}
 */
export async function checkMemoryReadiness(config) {
  const configResult = validateMemoryConfig(config);
  if (!configResult.valid) return configResult;

  const ms = config?.agents?.defaults?.memorySearch || {};
  if (!ms.enabled) return configResult;

  // Live check: Ollama embedding endpoint
  if (ms.provider === "ollama") {
    const baseUrl = config?.models?.providers?.ollama?.baseUrl || OLLAMA_DEFAULTS.baseUrl;
    const embResult = await checkOllamaEmbedding(OLLAMA_DEFAULTS.embeddingModel, baseUrl);

    configResult.diagnostics.embeddingReachable = embResult.ready;
    configResult.diagnostics.embeddingDims = embResult.dims || null;

    if (!embResult.ready) {
      configResult.errors.push(
        `Memory embedding provider "ollama" is not responding: ${embResult.error}. ` +
        "Ensure Ollama is running and nomic-embed-text is pulled."
      );
      configResult.valid = false;
    }
  }

  return configResult;
}
