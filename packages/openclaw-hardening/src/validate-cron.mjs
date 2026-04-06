// ---------------------------------------------------------------------------
// OpenClaw Hardening — Cron Job Validation & Model Resolution
// ---------------------------------------------------------------------------
// Validates cron jobs: delivery modes, model resolution chain, provider auth,
// and produces clear diagnostics with exact remediation instructions.
// ---------------------------------------------------------------------------

import {
  NON_CRON_SAFE_PROVIDERS,
  CRON_SAFE_PROVIDERS,
} from "./constants.mjs";
import { validateDeliveryMode, isNoDelivery } from "./validate-delivery.mjs";
import { validateModelReference } from "./validate-models.mjs";

/**
 * Resolve the effective model for a cron job, showing the full inheritance chain.
 *
 * Precedence (highest to lowest):
 *   1. Job-level model override (jobs.json → job.model)
 *   2. Agent-level model override (openclaw.json → agents.list[].model)
 *   3. Global default model (openclaw.json → agents.defaults.model.primary)
 *
 * @param {object} job         — parsed job entry from jobs.json
 * @param {object} agentConfig — the resolved agent entry from agents.list[]
 * @param {object} globalConfig — full openclaw.json parsed config
 * @returns {{ model: string|null, source: string, chain: string[] }}
 */
export function resolveJobModel(job, agentConfig, globalConfig) {
  const chain = [];

  // 1. Job-level override
  if (job.model) {
    chain.push(`job.model = "${job.model}" [SELECTED]`);
    return { model: job.model, source: "job-override", chain };
  }
  chain.push("job.model = (not set)");

  // 2. Agent-level override
  const agentModel = agentConfig?.model;
  if (agentModel) {
    chain.push(`agent.model = "${agentModel}" [SELECTED]`);
    return { model: agentModel, source: "agent-override", chain };
  }
  chain.push("agent.model = (not set)");

  // 3. Global default
  const globalModel = globalConfig?.agents?.defaults?.model?.primary;
  if (globalModel) {
    chain.push(`agents.defaults.model.primary = "${globalModel}" [SELECTED]`);
    return { model: globalModel, source: "global-default", chain };
  }
  chain.push("agents.defaults.model.primary = (not set)");

  return { model: null, source: "none", chain };
}

/**
 * Extract provider name from a model string like "ollama/qwen2.5:7b" → "ollama".
 * @param {string} model
 * @returns {string|null}
 */
export function extractProvider(model) {
  if (!model || typeof model !== "string") return null;
  const slash = model.indexOf("/");
  return slash > 0 ? model.substring(0, slash) : null;
}

/**
 * Check if a provider is safe for cron (can run without external API keys).
 * @param {string} provider
 * @returns {{ safe: boolean, reason: string }}
 */
export function checkProviderCronSafety(provider) {
  if (!provider) {
    return { safe: false, reason: "No provider could be extracted from model string." };
  }

  const lower = provider.toLowerCase();

  if (NON_CRON_SAFE_PROVIDERS.includes(lower)) {
    return {
      safe: false,
      reason: `Provider "${provider}" requires VS Code auth or external API keys ` +
              `that are not available in isolated cron sessions. ` +
              `Use a local provider: ${CRON_SAFE_PROVIDERS.join(", ")}.`,
    };
  }

  if (CRON_SAFE_PROVIDERS.includes(lower)) {
    return { safe: true, reason: `Provider "${provider}" is local and cron-safe.` };
  }

  // Unknown provider — warn but don't block
  return {
    safe: true,
    reason: `Provider "${provider}" is not in the known-safe or known-unsafe list. ` +
            `Verify it has valid auth for cron contexts.`,
  };
}

/**
 * Validate a single cron job fully: delivery mode + model resolution + provider safety.
 * @param {object} job
 * @param {object} agentConfig
 * @param {object} globalConfig
 * @param {object} [providerConfigs] — models.providers from openclaw.json
 * @returns {{ valid: boolean, errors: string[], warnings: string[], diagnostics: object }}
 */
export function validateCronJob(job, agentConfig, globalConfig, providerConfigs) {
  const errors = [];
  const warnings = [];

  // 1. Delivery mode
  const deliveryMode = job?.delivery?.mode;
  const dmResult = validateDeliveryMode(deliveryMode);
  if (!dmResult.valid) {
    errors.push(`[delivery] ${dmResult.error}`);
  }

  // 2. Model resolution
  const resolution = resolveJobModel(job, agentConfig, globalConfig);
  if (!resolution.model) {
    errors.push(
      "[model] No model resolved for this job. " +
      "Set job.model, agent.model, or agents.defaults.model.primary in openclaw.json."
    );
  }

  // 3. Provider safety
  let providerCheck = null;
  if (resolution.model) {
    const provider = extractProvider(resolution.model);
    providerCheck = checkProviderCronSafety(provider);
    if (!providerCheck.safe) {
      errors.push(`[provider] ${providerCheck.reason}`);
    }

    // 4. Validate model is actually registered in config
    if (provider && providerConfigs) {
      const modelResult = validateModelReference(resolution.model, providerConfigs);
      if (!modelResult.valid) {
        warnings.push(`[model-config] ${modelResult.error}`);
      }
    }
  }

  // 5. Warn about no-delivery jobs that might still enqueue
  if (dmResult.valid && isNoDelivery(dmResult.mode)) {
    if (job?.delivery?.target || job?.delivery?.recipient) {
      warnings.push(
        '[delivery] Job has delivery.mode="none" but also has a target/recipient configured. ' +
        "The target will be ignored, but consider removing it to avoid confusion."
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    diagnostics: {
      jobId: job.id,
      jobName: job.name || job.label || job.id,
      resolvedModel: resolution.model,
      modelSource: resolution.source,
      resolutionChain: resolution.chain,
      deliveryMode: dmResult.valid ? dmResult.mode : `INVALID(${deliveryMode})`,
      providerSafe: providerCheck?.safe ?? null,
    },
  };
}

/**
 * Validate all cron jobs from a parsed jobs.json.
 * @param {object} jobsData — parsed jobs.json (could be array or object with jobs)
 * @param {object} config   — full parsed openclaw.json
 * @returns {{ valid: boolean, results: object[] }}
 */
export function validateAllCronJobs(jobsData, config) {
  // jobs.json can be an array or a {jobs: [...]} object or even keyed by ID
  let jobs = [];
  if (Array.isArray(jobsData)) {
    jobs = jobsData;
  } else if (jobsData && typeof jobsData === "object") {
    // Keyed by ID or has a jobs array
    if (Array.isArray(jobsData.jobs)) {
      jobs = jobsData.jobs;
    } else {
      // Object keyed by job ID
      jobs = Object.entries(jobsData).map(([id, v]) => ({ id, ...v }));
    }
  }

  const agentConfig = config?.agents?.list?.[0] || {};
  const providerConfigs = config?.models?.providers || {};
  const results = [];
  let allValid = true;

  for (const job of jobs) {
    const result = validateCronJob(job, agentConfig, config, providerConfigs);
    if (!result.valid) allValid = false;
    results.push(result);
  }

  return { valid: allValid, results };
}
