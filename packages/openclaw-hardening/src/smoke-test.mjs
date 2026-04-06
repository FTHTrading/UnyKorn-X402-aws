// ---------------------------------------------------------------------------
// OpenClaw Hardening — Full Smoke Test
// ---------------------------------------------------------------------------
// Single command that verifies the entire OpenClaw stack is operational.
// Exits nonzero on failure with precise remediation hints.
//
// Usage: node packages/openclaw-hardening/src/smoke-test.mjs
// ---------------------------------------------------------------------------

import { homedir } from "node:os";
import { readFile, access } from "node:fs/promises";
import { OPENCLAW_PATHS, GATEWAY_DEFAULTS, OLLAMA_DEFAULTS } from "./constants.mjs";
import { validateFullConfig } from "./validate-config.mjs";
import { checkGatewayHealth, buildStartupSummary, validatePluginConfig } from "./validate-plugins.mjs";
import { checkOllamaConnectivity, checkOllamaEmbedding } from "./validate-models.mjs";
import { checkMemoryReadiness } from "./validate-memory.mjs";

const HOME = homedir();

let pass = 0;
let fail = 0;
let warn = 0;

function ok(label, detail) {
  console.log(`  [PASS] ${label}${detail ? ` — ${detail}` : ""}`);
  pass++;
}

function bad(label, detail) {
  console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
  fail++;
}

function warning(label, detail) {
  console.log(`  [WARN] ${label}${detail ? ` — ${detail}` : ""}`);
  warn++;
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function loadJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log(" OpenClaw Hardening — Full Smoke Test");
console.log("═══════════════════════════════════════════════════\n");

// ── 1. Config Exists & Parses ────────────────────────────────
console.log("[1/8] Config Validation");

const configPath = OPENCLAW_PATHS.config(HOME);
if (await fileExists(configPath)) {
  ok("openclaw.json exists", configPath);
} else {
  bad("openclaw.json missing", `Expected at ${configPath}`);
}

const config = await loadJson(configPath);
if (config) {
  ok("openclaw.json parses as valid JSON");
} else {
  bad("openclaw.json parse failure", "Cannot continue smoke test without config");
  console.log(`\n  ══ SMOKE TEST ABORTED — ${fail} failures ══\n`);
  process.exit(1);
}

// Full validation
const validationResult = await validateFullConfig(HOME);
if (validationResult.valid) {
  ok("Full config validation passed");
} else {
  bad("Config validation has errors");
  for (const [name, section] of Object.entries(validationResult.sections)) {
    for (const err of (section.errors || [])) {
      console.log(`    ✗ [${name}] ${err}`);
    }
  }
}

// ── 2. Gateway Health ────────────────────────────────────────
console.log("\n[2/8] Gateway Health");

const gwResult = await checkGatewayHealth();
if (gwResult.healthy) {
  ok("Gateway is healthy", `${gwResult.latency}ms`);
} else {
  bad("Gateway not reachable", gwResult.error);
  console.log("    Remediation: Start gateway with `openclaw gateway --port 18789`");
}

// ── 3. Plugin Startup ────────────────────────────────────────
console.log("\n[3/8] Plugin Health");

const pluginResult = validatePluginConfig(config);
if (pluginResult.valid) {
  ok("All enabled plugins are safe");
} else {
  for (const err of pluginResult.errors) bad("Plugin issue", err);
}
for (const w of pluginResult.warnings) warning("Plugin note", w);

const plugEnabled = pluginResult.plugins.filter(p => p.enabled).length;
const plugDisabled = pluginResult.plugins.filter(p => !p.enabled).length;
console.log(`    ${plugEnabled} enabled, ${plugDisabled} disabled`);

// ── 4. Ollama / Inference Dependency ─────────────────────────
console.log("\n[4/8] Ollama / Inference Provider");

const ollamaConfig = config?.models?.providers?.ollama;
if (ollamaConfig) {
  ok("Ollama provider configured");
  const ollamaUrl = ollamaConfig.baseUrl || OLLAMA_DEFAULTS.baseUrl;
  const ollamaCheck = await checkOllamaConnectivity(ollamaUrl);

  if (ollamaCheck.reachable) {
    ok("Ollama reachable", `${ollamaCheck.models.length} models available`);
  } else {
    bad("Ollama not reachable", ollamaCheck.error);
    console.log("    Remediation: Start Ollama with `ollama serve`");
  }
} else {
  warning("No Ollama provider configured", "Cron jobs may fail if they depend on Ollama models");
}

// ── 5. Cron Subsystem ────────────────────────────────────────
console.log("\n[5/8] Cron Job Validation");

const jobsPath = OPENCLAW_PATHS.cronJobs(HOME);
const jobsData = await loadJson(jobsPath);

if (!jobsData) {
  warning("No cron jobs loaded", `${jobsPath} not found or unparseable`);
} else {
  const cronSection = validationResult.sections.cron;
  if (cronSection?.valid) {
    ok("All cron jobs validated");
  } else if (cronSection?.results) {
    for (const r of cronSection.results) {
      if (r.valid) {
        ok(`Job ${r.diagnostics.jobName}`, `model=${r.diagnostics.resolvedModel} (${r.diagnostics.modelSource}), delivery=${r.diagnostics.deliveryMode}`);
      } else {
        bad(`Job ${r.diagnostics.jobName}`);
        for (const err of r.errors) console.log(`      ${err}`);
      }
      for (const w of r.warnings) warning(`Job ${r.diagnostics.jobName}`, w);
    }
  }
}

// ── 6. Delivery Queue ────────────────────────────────────────
console.log("\n[6/8] Delivery Queue");

const queueSection = validationResult.sections.deliveryQueue;
if (queueSection) {
  if (queueSection.valid) {
    ok("Delivery queue clean", `${queueSection.keep || 0} valid entries`);
  } else {
    bad("Stale delivery queue entries found", `${queueSection.purge || 0} need purging`);
    console.log("    Remediation: Run `.\\scripts\\ops\\openclaw-queue-purge.ps1`");
    console.log("    Or use scripts/ops/openclaw-queue-purge.ps1");
  }
}

// ── 7. Memory Embedding ──────────────────────────────────────
console.log("\n[7/8] Memory Embedding Provider");

const memoryResult = await checkMemoryReadiness(config);
if (memoryResult.valid) {
  ok("Memory provider ready");
  if (memoryResult.diagnostics.embeddingDims) {
    ok("Ollama embedding verified", `${memoryResult.diagnostics.embeddingDims} dimensions`);
  }
  if (!memoryResult.diagnostics.enabled) {
    warning("Memory is disabled", "Set agents.defaults.memorySearch.enabled=true to enable");
  }
} else {
  for (const err of memoryResult.errors) bad("Memory", err);
}

// ── 8. Startup Summary ──────────────────────────────────────
console.log("\n[8/8] Startup Summary");
console.log(buildStartupSummary(config, pluginResult, gwResult));

// ── Final ────────────────────────────────────────────────────
console.log(`\n  Results: ${pass} passed, ${fail} failed, ${warn} warnings\n`);

if (fail > 0) {
  console.log("  ══ SMOKE TEST FAILED — see errors above ══\n");
  process.exit(1);
} else {
  console.log("  ══ SMOKE TEST PASSED ══\n");
  process.exit(0);
}
