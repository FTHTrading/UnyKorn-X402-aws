// ---------------------------------------------------------------------------
// OpenClaw Hardening — Model & Provider Validation
// ---------------------------------------------------------------------------
// Validates that model references resolve to real configured providers,
// provider configs have required fields, and Ollama is structurally sound.
// ---------------------------------------------------------------------------

import {
  REQUIRED_MODEL_FIELDS,
  OLLAMA_DEFAULTS,
} from "./constants.mjs";

/**
 * Validate a model reference (e.g. "ollama/qwen2.5:7b") against provider config.
 * @param {string} modelRef     — "provider/modelName"
 * @param {object} providers    — models.providers from openclaw.json
 * @returns {{ valid: boolean, provider: string, modelName: string, error?: string }}
 */
export function validateModelReference(modelRef, providers) {
  if (!modelRef || typeof modelRef !== "string") {
    return { valid: false, provider: "", modelName: "", error: "Model reference is empty or not a string." };
  }

  const slash = modelRef.indexOf("/");
  if (slash <= 0) {
    return {
      valid: false,
      provider: "",
      modelName: modelRef,
      error: `Model "${modelRef}" has no provider prefix. Expected format: "provider/model-name".`,
    };
  }

  const provider = modelRef.substring(0, slash);
  const modelName = modelRef.substring(slash + 1);

  // Check provider exists
  if (!providers || !providers[provider]) {
    return {
      valid: false,
      provider,
      modelName,
      error: `Provider "${provider}" is not configured in models.providers. ` +
             `Available: ${providers ? Object.keys(providers).join(", ") || "(none)" : "(no providers section)"}.`,
    };
  }

  // Check provider has models array
  const providerCfg = providers[provider];
  if (!providerCfg.models || !Array.isArray(providerCfg.models)) {
    return {
      valid: false,
      provider,
      modelName,
      error: `Provider "${provider}" exists but has no "models" array configured.`,
    };
  }

  // Check model exists in provider's model list
  const match = providerCfg.models.find(
    m => m.id === modelName || m.name === modelName || m.id === modelRef || m.name === modelRef
  );
  if (!match) {
    const available = providerCfg.models.map(m => m.id || m.name).join(", ");
    return {
      valid: false,
      provider,
      modelName,
      error: `Model "${modelName}" not found in provider "${provider}" config. ` +
             `Available models: ${available || "(none)"}.`,
    };
  }

  return { valid: true, provider, modelName };
}

/**
 * Validate a single provider config entry.
 * @param {string} name       — provider name key
 * @param {object} providerCfg — the provider config object
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateProviderConfig(name, providerCfg) {
  const errors = [];
  const warnings = [];

  if (!providerCfg || typeof providerCfg !== "object") {
    errors.push(`Provider "${name}": config is not an object.`);
    return { valid: false, errors, warnings };
  }

  // Check baseUrl for local providers
  if (name === "ollama") {
    if (!providerCfg.baseUrl) {
      warnings.push(`Provider "ollama": no baseUrl set. Defaults to ${OLLAMA_DEFAULTS.baseUrl}.`);
    }
  }

  // Check models array
  if (!providerCfg.models || !Array.isArray(providerCfg.models)) {
    errors.push(`Provider "${name}": missing or invalid "models" array.`);
    return { valid: errors.length === 0, errors, warnings };
  }

  if (providerCfg.models.length === 0) {
    warnings.push(`Provider "${name}": models array is empty. No models will be available.`);
  }

  // Validate each model entry
  for (let i = 0; i < providerCfg.models.length; i++) {
    const model = providerCfg.models[i];
    if (!model || typeof model !== "object") {
      errors.push(`Provider "${name}": model[${i}] is not an object.`);
      continue;
    }

    for (const field of REQUIRED_MODEL_FIELDS) {
      if (!model[field]) {
        errors.push(
          `Provider "${name}": model[${i}] missing required field "${field}". ` +
          `Found keys: ${Object.keys(model).join(", ")}.`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate all provider configs.
 * @param {object} providers — models.providers from openclaw.json
 * @returns {{ valid: boolean, results: object[] }}
 */
export function validateAllProviders(providers) {
  if (!providers || typeof providers !== "object") {
    return {
      valid: false,
      results: [{ name: "(root)", valid: false, errors: ["models.providers is missing or not an object."], warnings: [] }],
    };
  }

  const results = [];
  let allValid = true;

  for (const [name, cfg] of Object.entries(providers)) {
    const result = validateProviderConfig(name, cfg);
    result.name = name;
    if (!result.valid) allValid = false;
    results.push(result);
  }

  return { valid: allValid, results };
}

/**
 * Test Ollama connectivity by hitting the tags endpoint.
 * @param {string} [baseUrl] — Ollama base URL
 * @param {number} [timeout] — request timeout in ms
 * @returns {Promise<{ reachable: boolean, models: string[], error?: string }>}
 */
export async function checkOllamaConnectivity(baseUrl, timeout) {
  const url = baseUrl || OLLAMA_DEFAULTS.baseUrl;
  const ms = timeout || OLLAMA_DEFAULTS.timeout;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return { reachable: false, models: [], error: `Ollama returned HTTP ${res.status}.` };
    }

    const data = await res.json();
    const models = (data.models || []).map(m => m.name || m.model);
    return { reachable: true, models };
  } catch (err) {
    return {
      reachable: false,
      models: [],
      error: `Cannot reach Ollama at ${url}: ${err.message}`,
    };
  }
}

/**
 * Test Ollama embedding endpoint with a probe string.
 * @param {string} [model]   — embedding model name
 * @param {string} [baseUrl] — Ollama base URL
 * @returns {Promise<{ ready: boolean, dims?: number, error?: string }>}
 */
export async function checkOllamaEmbedding(model, baseUrl) {
  const url = baseUrl || OLLAMA_DEFAULTS.baseUrl;
  const mdl = model || OLLAMA_DEFAULTS.embeddingModel;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_DEFAULTS.timeout);

    const res = await fetch(`${url}${OLLAMA_DEFAULTS.embeddingEndpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: mdl, prompt: "hardening probe" }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ready: false, error: `Ollama embedding returned HTTP ${res.status}.` };
    }

    const data = await res.json();
    const embedding = data.embedding || data.embeddings?.[0];
    if (!embedding || !Array.isArray(embedding)) {
      return { ready: false, error: "Ollama returned no embedding array." };
    }

    return { ready: true, dims: embedding.length };
  } catch (err) {
    return { ready: false, error: `Ollama embedding failed: ${err.message}` };
  }
}
