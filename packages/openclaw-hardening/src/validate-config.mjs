// ---------------------------------------------------------------------------
// OpenClaw Hardening — Full Config Validation
// ---------------------------------------------------------------------------
// Master validation that runs all sub-validators against openclaw.json
// and jobs.json. Exits nonzero on failure with precise remediation hints.
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { OPENCLAW_PATHS } from "./constants.mjs";
import { validateAllCronJobs } from "./validate-cron.mjs";
import { validateAllProviders } from "./validate-models.mjs";
import { validateMemoryConfig } from "./validate-memory.mjs";
import { validatePluginConfig } from "./validate-plugins.mjs";
import { auditDeliveryQueue } from "./delivery-recovery.mjs";

/**
 * Load and parse a JSON file safely.
 * @param {string} path
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
async function loadJson(path) {
  try {
    const raw = await readFile(path, "utf-8");
    return { data: JSON.parse(raw), error: null };
  } catch (err) {
    return { data: null, error: `Cannot load ${path}: ${err.message}` };
  }
}

/**
 * Run full config validation.
 * @param {string} [home] — user home directory override
 * @returns {Promise<{ valid: boolean, sections: object }>}
 */
export async function validateFullConfig(home) {
  const h = home || homedir();
  const sections = {};
  let allValid = true;

  // 1. Load config
  const configPath = OPENCLAW_PATHS.config(h);
  const { data: config, error: configError } = await loadJson(configPath);
  if (configError) {
    sections.config = { valid: false, errors: [configError], warnings: [] };
    return { valid: false, sections };
  }
  sections.config = { valid: true, errors: [], warnings: [] };

  // 2. Provider validation
  const providers = config?.models?.providers || {};
  const providerResult = validateAllProviders(providers);
  sections.providers = providerResult;
  if (!providerResult.valid) allValid = false;

  // 3. Plugin validation
  const pluginResult = validatePluginConfig(config);
  sections.plugins = pluginResult;
  if (!pluginResult.valid) allValid = false;

  // 4. Memory validation
  const memoryResult = validateMemoryConfig(config);
  sections.memory = memoryResult;
  if (!memoryResult.valid) allValid = false;

  // 5. Cron job validation
  const jobsPath = OPENCLAW_PATHS.cronJobs(h);
  const { data: jobsData, error: jobsError } = await loadJson(jobsPath);
  if (jobsError) {
    sections.cron = { valid: true, errors: [], warnings: [`Cron jobs not loaded: ${jobsError}`] };
  } else {
    const cronResult = validateAllCronJobs(jobsData, config);
    sections.cron = cronResult;
    if (!cronResult.valid) allValid = false;
  }

  // 6. Delivery queue audit
  const queueDir = OPENCLAW_PATHS.deliveryQueue(h);
  const failedDir = OPENCLAW_PATHS.failedQueue(h);
  try {
    const queueResult = await auditDeliveryQueue(queueDir, failedDir, jobsData || []);
    sections.deliveryQueue = {
      valid: queueResult.purge.length === 0,
      keep: queueResult.keep.length,
      purge: queueResult.purge.length,
      skip: queueResult.skip.length,
      errors: queueResult.errors,
      purgeDetails: queueResult.purge.map(e => ({
        file: e.file,
        reasons: e.classification?.reasons || [],
      })),
    };
    if (queueResult.purge.length > 0) {
      sections.deliveryQueue.warnings = [
        `${queueResult.purge.length} stale/invalid queue entries found. ` +
        `Run purge to clean: node packages/openclaw-hardening/src/delivery-recovery.mjs --purge`,
      ];
    }
  } catch (err) {
    sections.deliveryQueue = { valid: true, errors: [], warnings: [`Queue audit skipped: ${err.message}`] };
  }

  return { valid: allValid, sections };
}

/**
 * Format validation results for operator output.
 * @param {{ valid: boolean, sections: object }} result
 * @returns {string}
 */
export function formatValidationReport(result) {
  const lines = [];
  lines.push("╔═══════════════════════════════════════════╗");
  lines.push("║   OpenClaw Config Validation Report       ║");
  lines.push("╚═══════════════════════════════════════════╝");
  lines.push("");

  for (const [name, section] of Object.entries(result.sections)) {
    const status = section.valid !== false ? "PASS" : "FAIL";
    const icon = section.valid !== false ? "✓" : "✗";
    lines.push(`  ${icon} ${name.toUpperCase()}: ${status}`);

    // Errors
    const errors = section.errors || [];
    for (const err of errors) {
      lines.push(`    ✗ ${err}`);
    }

    // Warnings
    const warnings = section.warnings || [];
    for (const w of warnings) {
      lines.push(`    ⚠ ${w}`);
    }

    // Sub-results (providers, cron jobs)
    if (section.results) {
      for (const sub of section.results) {
        if (sub.valid === false) {
          const label = sub.name || sub.diagnostics?.jobName || sub.jobName || "entry";
          lines.push(`    ✗ ${label}:`);
          for (const e of (sub.errors || [])) lines.push(`      ${e}`);
        }
      }
    }

    // Delivery queue specifics
    if (name === "deliveryQueue" && section.purge > 0) {
      lines.push(`    Pending purge: ${section.purge} entries`);
      for (const d of (section.purgeDetails || [])) {
        lines.push(`      ${d.file}: ${d.reasons.join("; ")}`);
      }
    }
  }

  lines.push("");
  lines.push(result.valid
    ? "  ══ ALL CHECKS PASSED ══"
    : "  ══ VALIDATION FAILED — see errors above ══"
  );
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI entry point: node packages/openclaw-hardening/src/validate-config.mjs
// ---------------------------------------------------------------------------
const isMain = process.argv[1]?.endsWith("validate-config.mjs");
if (isMain) {
  const result = await validateFullConfig();
  console.log(formatValidationReport(result));
  process.exit(result.valid ? 0 : 1);
}
