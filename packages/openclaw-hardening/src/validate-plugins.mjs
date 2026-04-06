// ---------------------------------------------------------------------------
// OpenClaw Hardening — Plugin Health Validation
// ---------------------------------------------------------------------------
// Validates that gateway plugins loaded cleanly and surfaces degraded/failed
// plugins without cascading hangs.
// ---------------------------------------------------------------------------

import { GATEWAY_DEFAULTS } from "./constants.mjs";

/** Known-problematic plugins that cause stack overflow from ajv schema compilation. */
export const KNOWN_PROBLEMATIC_PLUGINS = Object.freeze(["google", "minimax"]);

/**
 * Parse a plugin entry from openclaw.json config.
 * @param {object} entry — plugin config entry
 * @returns {{ name: string, enabled: boolean, problematic: boolean }}
 */
export function classifyPlugin(entry) {
  const name = entry?.name || entry?.id || "unknown";
  const enabled = entry?.enabled !== false; // default true unless explicitly false
  const problematic = KNOWN_PROBLEMATIC_PLUGINS.includes(name.toLowerCase());

  return { name, enabled, problematic };
}

/**
 * Validate all plugin configs from openclaw.json.
 * @param {object} config — full parsed openclaw.json
 * @returns {{ valid: boolean, errors: string[], warnings: string[], plugins: object[] }}
 */
export function validatePluginConfig(config) {
  const errors = [];
  const warnings = [];

  const entries = config?.plugins?.entries || [];
  if (!entries.length) {
    warnings.push("No plugins configured in plugins.entries.");
    return { valid: true, errors, warnings, plugins: [] };
  }

  const plugins = entries.map(classifyPlugin);

  for (const p of plugins) {
    if (p.enabled && p.problematic) {
      errors.push(
        `Plugin "${p.name}" is enabled but KNOWN PROBLEMATIC. ` +
        `It causes RangeError: Maximum call stack size exceeded (ajv schema compilation). ` +
        `This will poison gateway startup and cause CLI hangs. ` +
        `FIX: Disable it in openclaw.json → plugins.entries → set enabled: false.`
      );
    }
    if (!p.enabled && p.problematic) {
      // Good — it's disabled
      warnings.push(
        `Plugin "${p.name}" is correctly disabled (known problematic).`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    plugins,
  };
}

/**
 * Check gateway health via its HTTP endpoint.
 * @param {number} [port]    — gateway port
 * @param {number} [timeout] — timeout ms
 * @returns {Promise<{ healthy: boolean, latency: number, error?: string, details?: object }>}
 */
export async function checkGatewayHealth(port, timeout) {
  const p = port || GATEWAY_DEFAULTS.port;
  const ms = timeout || GATEWAY_DEFAULTS.healthTimeout;
  const url = `http://127.0.0.1:${p}${GATEWAY_DEFAULTS.healthEndpoint}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const latency = Date.now() - start;

    if (!res.ok) {
      return { healthy: false, latency, error: `Gateway returned HTTP ${res.status}.` };
    }

    let details = {};
    try { details = await res.json(); } catch { /* non-JSON OK */ }

    return { healthy: true, latency, details };
  } catch (err) {
    return {
      healthy: false,
      latency: Date.now() - start,
      error: `Gateway not reachable at ${url}: ${err.message}`,
    };
  }
}

/**
 * Build a startup summary for operator visibility.
 * @param {object} config       — parsed openclaw.json
 * @param {object} pluginResult — from validatePluginConfig()
 * @param {object} gatewayResult — from checkGatewayHealth()
 * @returns {string} — formatted summary
 */
export function buildStartupSummary(config, pluginResult, gatewayResult) {
  const lines = [];
  lines.push("═══════════════════════════════════════════");
  lines.push(" OpenClaw Gateway — Startup Summary");
  lines.push("═══════════════════════════════════════════");

  // Gateway
  if (gatewayResult) {
    const status = gatewayResult.healthy ? "HEALTHY" : "UNHEALTHY";
    lines.push(`  Gateway:  ${status} (${gatewayResult.latency}ms)`);
    if (gatewayResult.error) lines.push(`            ${gatewayResult.error}`);
  }

  // Plugins
  if (pluginResult) {
    const loaded = pluginResult.plugins.filter(p => p.enabled).length;
    const disabled = pluginResult.plugins.filter(p => !p.enabled).length;
    const problematic = pluginResult.plugins.filter(p => p.enabled && p.problematic).length;
    lines.push(`  Plugins:  ${loaded} loaded, ${disabled} disabled, ${problematic} problematic`);
    for (const p of pluginResult.plugins) {
      const flag = p.problematic ? (p.enabled ? " ⚠ DANGEROUS" : " (disabled, safe)") : "";
      lines.push(`            ${p.enabled ? "●" : "○"} ${p.name}${flag}`);
    }
  }

  // Model
  const defaultModel = config?.agents?.defaults?.model?.primary || "(not set)";
  const agentModel = config?.agents?.list?.[0]?.model || "(inherits default)";
  lines.push(`  Default model:  ${defaultModel}`);
  lines.push(`  Agent model:    ${agentModel}`);

  // Channels
  const telegram = config?.channels?.telegram;
  if (telegram) {
    lines.push(`  Telegram:  ${telegram.enabled !== false ? "enabled" : "disabled"}`);
  }

  // Memory
  const ms = config?.agents?.defaults?.memorySearch || {};
  lines.push(`  Memory:    ${ms.enabled ? `enabled (provider: ${ms.provider || "auto"})` : "disabled"}`);

  lines.push("═══════════════════════════════════════════");
  return lines.join("\n");
}
