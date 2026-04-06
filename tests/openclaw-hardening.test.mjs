// ---------------------------------------------------------------------------
// OpenClaw Hardening — Comprehensive Test Suite
// ---------------------------------------------------------------------------
// Run: node --test tests/openclaw-hardening.test.mjs   (from repo root)
//
// Tests all hardening modules: delivery mode validation, cron model
// resolution, provider safety, memory config, plugin classification,
// delivery queue recovery, and smoke-test preconditions.
//
// Uses node:test + node:assert — zero external test dependencies.
// ---------------------------------------------------------------------------

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// ── constants ────────────────────────────────────────────────────────────
import {
  VALID_DELIVERY_MODES,
  NO_DELIVERY_MODE,
  KNOWN_INVALID_MODES,
  NON_CRON_SAFE_PROVIDERS,
  CRON_SAFE_PROVIDERS,
  REQUIRED_MODEL_FIELDS,
  OPENCLAW_PATHS,
  GATEWAY_DEFAULTS,
  OLLAMA_DEFAULTS,
} from "../packages/openclaw-hardening/src/constants.mjs";

// ── delivery ─────────────────────────────────────────────────────────────
import {
  normalizeDeliveryMode,
  validateDeliveryMode,
  isNoDelivery,
  validateAllJobDeliveryModes,
} from "../packages/openclaw-hardening/src/validate-delivery.mjs";

// ── cron ─────────────────────────────────────────────────────────────────
import {
  resolveJobModel,
  extractProvider,
  checkProviderCronSafety,
  validateCronJob,
  validateAllCronJobs,
} from "../packages/openclaw-hardening/src/validate-cron.mjs";

// ── models ───────────────────────────────────────────────────────────────
import {
  validateModelReference,
  validateProviderConfig,
  validateAllProviders,
} from "../packages/openclaw-hardening/src/validate-models.mjs";

// ── memory ───────────────────────────────────────────────────────────────
import {
  validateMemoryConfig,
} from "../packages/openclaw-hardening/src/validate-memory.mjs";

// ── plugins ──────────────────────────────────────────────────────────────
import {
  KNOWN_PROBLEMATIC_PLUGINS,
  classifyPlugin,
  validatePluginConfig,
  buildStartupSummary,
} from "../packages/openclaw-hardening/src/validate-plugins.mjs";

// ── delivery recovery ────────────────────────────────────────────────────
import {
  classifyQueueEntry,
} from "../packages/openclaw-hardening/src/delivery-recovery.mjs";


// =========================================================================
// §1  Constants — frozen enums, no surprises
// =========================================================================
describe("Constants", () => {
  it("VALID_DELIVERY_MODES is frozen and contains expected values", () => {
    assert.ok(Object.isFrozen(VALID_DELIVERY_MODES));
    assert.deepStrictEqual([...VALID_DELIVERY_MODES].sort(), ["announce", "deliver", "none", "webhook"]);
  });

  it("NO_DELIVERY_MODE is 'none'", () => {
    assert.equal(NO_DELIVERY_MODE, "none");
  });

  it("KNOWN_INVALID_MODES includes 'silent'", () => {
    assert.ok(KNOWN_INVALID_MODES.includes("silent"));
  });

  it("NON_CRON_SAFE_PROVIDERS includes 'github-copilot'", () => {
    assert.ok(NON_CRON_SAFE_PROVIDERS.includes("github-copilot"));
  });

  it("CRON_SAFE_PROVIDERS includes 'ollama'", () => {
    assert.ok(CRON_SAFE_PROVIDERS.includes("ollama"));
  });

  it("Cron-safe and non-cron-safe provider lists are disjoint", () => {
    for (const p of CRON_SAFE_PROVIDERS) {
      assert.ok(!NON_CRON_SAFE_PROVIDERS.includes(p), `${p} appears in both lists`);
    }
  });

  it("OPENCLAW_PATHS generates correct config path", () => {
    const p = OPENCLAW_PATHS.config("/home/user");
    assert.equal(p, "/home/user/.openclaw/openclaw.json");
  });

  it("GATEWAY_DEFAULTS has port 18789", () => {
    assert.equal(GATEWAY_DEFAULTS.port, 18789);
  });

  it("OLLAMA_DEFAULTS has localhost:11434", () => {
    assert.equal(OLLAMA_DEFAULTS.baseUrl, "http://localhost:11434");
  });
});


// =========================================================================
// §2  Delivery Mode Validation
// =========================================================================
describe("Delivery mode validation", () => {
  // ── §2a  Valid modes accepted ──────────────────────────────────────────
  describe("accepts valid modes", () => {
    for (const mode of VALID_DELIVERY_MODES) {
      it(`accepts "${mode}"`, () => {
        const r = validateDeliveryMode(mode);
        assert.ok(r.valid, `expected "${mode}" to be valid`);
        assert.equal(r.mode, mode);
        assert.equal(r.error, undefined);
      });
    }
  });

  // ── §2b  Case-insensitive and whitespace-tolerant ─────────────────────
  describe("normalizes case and whitespace", () => {
    it("trims and lowercases", () => {
      assert.equal(normalizeDeliveryMode("  Announce  "), "announce");
    });

    it("accepts 'NONE' (uppercase)", () => {
      const r = validateDeliveryMode("NONE");
      assert.ok(r.valid);
      assert.equal(r.mode, "none");
    });

    it("accepts '  webhook  ' with whitespace", () => {
      const r = validateDeliveryMode("  webhook  ");
      assert.ok(r.valid);
      assert.equal(r.mode, "webhook");
    });
  });

  // ── §2c  "silent" explicitly rejected ─────────────────────────────────
  describe("rejects 'silent' explicitly", () => {
    it('"silent" is invalid', () => {
      const r = validateDeliveryMode("silent");
      assert.ok(!r.valid);
      assert.ok(r.error.includes("NOT a valid delivery mode"));
      assert.ok(r.error.includes("known bug"));
    });

    it('"Silent" (capitalized) is also invalid', () => {
      const r = validateDeliveryMode("Silent");
      assert.ok(!r.valid);
    });
  });

  // ── §2d  All known-invalid modes rejected ─────────────────────────────
  describe("rejects all known-invalid modes", () => {
    for (const mode of KNOWN_INVALID_MODES) {
      it(`rejects "${mode}"`, () => {
        const r = validateDeliveryMode(mode);
        assert.ok(!r.valid, `expected "${mode}" to be rejected`);
        assert.ok(r.error, `expected error message for "${mode}"`);
      });
    }
  });

  // ── §2e  Unknown garbage rejected ─────────────────────────────────────
  describe("rejects unknown garbage", () => {
    for (const garbage of ["nope", "yes", "true", "1", "on", "active"]) {
      it(`rejects "${garbage}"`, () => {
        const r = validateDeliveryMode(garbage);
        assert.ok(!r.valid);
      });
    }
  });

  // ── §2f  null / undefined ─────────────────────────────────────────────
  describe("handles null/undefined", () => {
    it("null delivery mode → invalid with helpful error", () => {
      const r = validateDeliveryMode(null);
      assert.ok(!r.valid);
      assert.ok(r.error.includes("null"));
    });

    it("undefined delivery mode → invalid", () => {
      const r = validateDeliveryMode(undefined);
      assert.ok(!r.valid);
    });
  });

  // ── §2g  isNoDelivery ─────────────────────────────────────────────────
  describe("isNoDelivery()", () => {
    it('"none" is no-delivery', () => {
      assert.ok(isNoDelivery("none"));
    });

    it('"NONE" is no-delivery (case-insensitive)', () => {
      assert.ok(isNoDelivery("NONE"));
    });

    it('"announce" is NOT no-delivery', () => {
      assert.ok(!isNoDelivery("announce"));
    });

    it('"silent" is NOT no-delivery', () => {
      assert.ok(!isNoDelivery("silent"));
    });
  });

  // ── §2h  Batch validation ─────────────────────────────────────────────
  describe("validateAllJobDeliveryModes()", () => {
    it("all-valid jobs → valid=true", () => {
      const jobs = [
        { id: "j1", delivery: { mode: "none" } },
        { id: "j2", delivery: { mode: "announce" } },
      ];
      const r = validateAllJobDeliveryModes(jobs);
      assert.ok(r.valid);
      assert.equal(r.results.length, 2);
    });

    it("one invalid job → valid=false", () => {
      const jobs = [
        { id: "j1", delivery: { mode: "none" } },
        { id: "j2", delivery: { mode: "silent" } },
      ];
      const r = validateAllJobDeliveryModes(jobs);
      assert.ok(!r.valid);
    });

    it("missing delivery object → invalid", () => {
      const jobs = [{ id: "j1" }];
      const r = validateAllJobDeliveryModes(jobs);
      assert.ok(!r.valid);
    });
  });
});


// =========================================================================
// §3  Cron Model Resolution
// =========================================================================
describe("Cron model resolution", () => {
  const globalConfig = {
    agents: {
      defaults: {
        model: { primary: "ollama/qwen2.5:7b" },
      },
    },
  };

  // ── §3a  Job-level override wins ──────────────────────────────────────
  it("job.model overrides everything", () => {
    const job = { id: "j1", model: "ollama/llama3:8b" };
    const agent = { model: "ollama/mistral:7b" };
    const r = resolveJobModel(job, agent, globalConfig);
    assert.equal(r.model, "ollama/llama3:8b");
    assert.equal(r.source, "job-override");
  });

  // ── §3b  Agent-level override is second ───────────────────────────────
  it("agent.model used when job has no model", () => {
    const job = { id: "j1" };
    const agent = { model: "ollama/mistral:7b" };
    const r = resolveJobModel(job, agent, globalConfig);
    assert.equal(r.model, "ollama/mistral:7b");
    assert.equal(r.source, "agent-override");
  });

  // ── §3c  Global default is fallback ───────────────────────────────────
  it("falls back to global default", () => {
    const r = resolveJobModel({ id: "j1" }, {}, globalConfig);
    assert.equal(r.model, "ollama/qwen2.5:7b");
    assert.equal(r.source, "global-default");
  });

  // ── §3d  No model anywhere → null ────────────────────────────────────
  it("returns null when nothing is configured", () => {
    const r = resolveJobModel({ id: "j1" }, {}, { agents: {} });
    assert.equal(r.model, null);
    assert.equal(r.source, "none");
  });

  // ── §3e  Chain always produced ────────────────────────────────────────
  it("resolution chain has entries for all checked levels", () => {
    const r = resolveJobModel({ id: "j1" }, {}, globalConfig);
    assert.ok(r.chain.length >= 2, "expected at least 2 chain entries");
    assert.ok(r.chain[0].includes("not set"), "first chain entry = job (not set)");
    assert.ok(r.chain[1].includes("not set"), "second chain entry = agent (not set)");
    assert.ok(r.chain[2].includes("SELECTED"), "third chain entry = global (selected)");
  });
});


// =========================================================================
// §4  Provider Extraction & Safety
// =========================================================================
describe("Provider extraction & safety", () => {
  // ── §4a  extractProvider ──────────────────────────────────────────────
  describe("extractProvider()", () => {
    it('"ollama/qwen2.5:7b" → "ollama"', () => {
      assert.equal(extractProvider("ollama/qwen2.5:7b"), "ollama");
    });

    it('"github-copilot/claude-opus-4.6" → "github-copilot"', () => {
      assert.equal(extractProvider("github-copilot/claude-opus-4.6"), "github-copilot");
    });

    it("bare model name → null", () => {
      assert.equal(extractProvider("llama3"), null);
    });

    it("null → null", () => {
      assert.equal(extractProvider(null), null);
    });

    it("empty string → null", () => {
      assert.equal(extractProvider(""), null);
    });
  });

  // ── §4b  checkProviderCronSafety ──────────────────────────────────────
  describe("checkProviderCronSafety()", () => {
    it("ollama is cron-safe", () => {
      const r = checkProviderCronSafety("ollama");
      assert.ok(r.safe);
    });

    it("llamafile is cron-safe", () => {
      const r = checkProviderCronSafety("llamafile");
      assert.ok(r.safe);
    });

    it("github-copilot is NOT cron-safe", () => {
      const r = checkProviderCronSafety("github-copilot");
      assert.ok(!r.safe);
      assert.ok(r.reason.includes("VS Code auth"));
    });

    it("copilot is NOT cron-safe", () => {
      const r = checkProviderCronSafety("copilot");
      assert.ok(!r.safe);
    });

    it("unknown provider defaults to safe with warning", () => {
      const r = checkProviderCronSafety("anthropic");
      assert.ok(r.safe);
      assert.ok(r.reason.includes("not in the known-safe"));
    });

    it("null provider → not safe", () => {
      const r = checkProviderCronSafety(null);
      assert.ok(!r.safe);
    });
  });
});


// =========================================================================
// §5  Model & Provider Validation
// =========================================================================
describe("Model & provider validation", () => {
  const providers = {
    ollama: {
      baseUrl: "http://localhost:11434",
      models: [
        { id: "qwen2.5:7b", name: "Qwen 2.5 7B" },
        { id: "llama3:8b", name: "Llama 3 8B" },
      ],
    },
    openai: {
      models: [
        { id: "gpt-4o", name: "GPT-4o" },
      ],
    },
  };

  // ── §5a  validateModelReference ───────────────────────────────────────
  describe("validateModelReference()", () => {
    it("valid model reference resolves", () => {
      const r = validateModelReference("ollama/qwen2.5:7b", providers);
      assert.ok(r.valid);
      assert.equal(r.provider, "ollama");
      assert.equal(r.modelName, "qwen2.5:7b");
    });

    it("unknown provider → invalid", () => {
      const r = validateModelReference("llamafile/tiny", providers);
      assert.ok(!r.valid);
      assert.ok(r.error.includes("not configured"));
    });

    it("unknown model in known provider → invalid", () => {
      const r = validateModelReference("ollama/nonexistent:13b", providers);
      assert.ok(!r.valid);
      assert.ok(r.error.includes("not found"));
    });

    it("no provider prefix → invalid", () => {
      const r = validateModelReference("qwen2.5:7b", providers);
      assert.ok(!r.valid);
      assert.ok(r.error.includes("no provider prefix"));
    });

    it("empty string → invalid", () => {
      const r = validateModelReference("", providers);
      assert.ok(!r.valid);
    });

    it("null → invalid", () => {
      const r = validateModelReference(null, providers);
      assert.ok(!r.valid);
    });
  });

  // ── §5b  validateProviderConfig ───────────────────────────────────────
  describe("validateProviderConfig()", () => {
    it("valid provider config passes", () => {
      const r = validateProviderConfig("ollama", providers.ollama);
      assert.ok(r.valid);
      assert.equal(r.errors.length, 0);
    });

    it("missing models array → error", () => {
      const r = validateProviderConfig("bad", { baseUrl: "http://x" });
      assert.ok(!r.valid);
      assert.ok(r.errors.some(e => e.includes("models")));
    });

    it("empty models array → warning", () => {
      const r = validateProviderConfig("empty", { models: [] });
      assert.ok(r.valid); // valid but warned
      assert.ok(r.warnings.some(w => w.includes("empty")));
    });

    it("model missing required fields → error", () => {
      const r = validateProviderConfig("bad", { models: [{ foo: "bar" }] });
      assert.ok(!r.valid);
      assert.ok(r.errors.some(e => e.includes("id") || e.includes("name")));
    });

    it("non-object config → error", () => {
      const r = validateProviderConfig("x", null);
      assert.ok(!r.valid);
    });

    it("ollama without baseUrl → warning (uses default)", () => {
      const r = validateProviderConfig("ollama", { models: [{ id: "m1", name: "M1" }] });
      assert.ok(r.valid);
      assert.ok(r.warnings.some(w => w.includes("baseUrl")));
    });
  });

  // ── §5c  validateAllProviders ─────────────────────────────────────────
  describe("validateAllProviders()", () => {
    it("all valid → valid=true", () => {
      const r = validateAllProviders(providers);
      assert.ok(r.valid);
    });

    it("null providers → invalid", () => {
      const r = validateAllProviders(null);
      assert.ok(!r.valid);
    });

    it("one broken provider → invalid", () => {
      const mixed = { ...providers, broken: "not-an-object" };
      const r = validateAllProviders(mixed);
      assert.ok(!r.valid);
    });
  });
});


// =========================================================================
// §6  Memory Config Validation
// =========================================================================
describe("Memory config validation", () => {
  // ── §6a  Disabled memory → valid with warning ─────────────────────────
  it("disabled memory → valid with warning", () => {
    const config = { agents: { defaults: { memorySearch: { enabled: false } } } };
    const r = validateMemoryConfig(config);
    assert.ok(r.valid);
    assert.ok(r.warnings.length > 0);
    assert.ok(r.warnings.some(w => w.includes("disabled")));
  });

  // ── §6b  Auto provider → error (known bug) ───────────────────────────
  it("auto provider → error (autoSelectPriority bug)", () => {
    const config = {
      agents: { defaults: { memorySearch: { enabled: true, provider: "auto" } } },
    };
    const r = validateMemoryConfig(config);
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes("autoSelectPriority")));
  });

  // ── §6c  Missing provider → error ────────────────────────────────────
  it("missing provider → error", () => {
    const config = {
      agents: { defaults: { memorySearch: { enabled: true } } },
    };
    const r = validateMemoryConfig(config);
    assert.ok(!r.valid);
  });

  // ── §6d  Explicit ollama provider with model list → valid ─────────────
  it("ollama provider with embedding model in config → valid", () => {
    const config = {
      agents: { defaults: { memorySearch: { enabled: true, provider: "ollama" } } },
      models: {
        providers: {
          ollama: {
            models: [{ id: "nomic-embed-text", name: "Nomic Embed" }],
          },
        },
      },
    };
    const r = validateMemoryConfig(config);
    assert.ok(r.valid);
    assert.equal(r.errors.length, 0);
  });

  // ── §6e  Ollama provider without Ollama config → error ────────────────
  it("ollama provider but no ollama in models.providers → error", () => {
    const config = {
      agents: { defaults: { memorySearch: { enabled: true, provider: "ollama" } } },
      models: { providers: {} },
    };
    const r = validateMemoryConfig(config);
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes("no Ollama provider")));
  });

  // ── §6f  Ollama provider without embedding model → warning ────────────
  it("ollama provider without embedding model → warning", () => {
    const config = {
      agents: { defaults: { memorySearch: { enabled: true, provider: "ollama" } } },
      models: {
        providers: {
          ollama: {
            models: [{ id: "qwen2.5:7b", name: "Qwen" }],
          },
        },
      },
    };
    const r = validateMemoryConfig(config);
    assert.ok(r.valid); // valid but warned
    assert.ok(r.warnings.some(w => w.includes("embedding")));
  });
});


// =========================================================================
// §7  Plugin Classification & Validation
// =========================================================================
describe("Plugin classification & validation", () => {
  // ── §7a  classifyPlugin ───────────────────────────────────────────────
  describe("classifyPlugin()", () => {
    it("google plugin → problematic", () => {
      const r = classifyPlugin({ name: "google", enabled: true });
      assert.ok(r.problematic);
      assert.ok(r.enabled);
    });

    it("minimax plugin → problematic", () => {
      const r = classifyPlugin({ name: "minimax", enabled: false });
      assert.ok(r.problematic);
      assert.ok(!r.enabled);
    });

    it("custom plugin → not problematic", () => {
      const r = classifyPlugin({ name: "my-plugin" });
      assert.ok(!r.problematic);
    });

    it("enabled defaults to true if not explicitly false", () => {
      const r = classifyPlugin({ name: "x" });
      assert.ok(r.enabled);
    });

    it("missing name → 'unknown'", () => {
      const r = classifyPlugin({});
      assert.equal(r.name, "unknown");
    });
  });

  // ── §7b  validatePluginConfig ─────────────────────────────────────────
  describe("validatePluginConfig()", () => {
    it("enabled problematic plugin → error", () => {
      const config = { plugins: { entries: [{ name: "google", enabled: true }] } };
      const r = validatePluginConfig(config);
      assert.ok(!r.valid);
      assert.ok(r.errors.some(e => e.includes("KNOWN PROBLEMATIC")));
    });

    it("disabled problematic plugin → valid with warning", () => {
      const config = { plugins: { entries: [{ name: "google", enabled: false }] } };
      const r = validatePluginConfig(config);
      assert.ok(r.valid);
      assert.ok(r.warnings.some(w => w.includes("correctly disabled")));
    });

    it("no plugins → valid with warning", () => {
      const config = {};
      const r = validatePluginConfig(config);
      assert.ok(r.valid);
      assert.ok(r.warnings.length > 0);
    });

    it("multiple plugins with mixed state", () => {
      const config = {
        plugins: {
          entries: [
            { name: "google", enabled: false },
            { name: "minimax", enabled: false },
            { name: "custom", enabled: true },
          ],
        },
      };
      const r = validatePluginConfig(config);
      assert.ok(r.valid);
      assert.equal(r.plugins.length, 3);
    });

    it("both google and minimax enabled → 2 errors", () => {
      const config = {
        plugins: {
          entries: [
            { name: "google", enabled: true },
            { name: "minimax", enabled: true },
          ],
        },
      };
      const r = validatePluginConfig(config);
      assert.ok(!r.valid);
      assert.equal(r.errors.length, 2);
    });
  });
});


// =========================================================================
// §8  Delivery Queue Recovery
// =========================================================================
describe("Delivery queue classification", () => {
  const validJobIds = new Set(["daily-recap", "morning-brief"]);
  const jobsMap = {
    "daily-recap": { id: "daily-recap", delivery: { mode: "none" } },
    "morning-brief": { id: "morning-brief", delivery: { mode: "announce" } },
  };

  // ── §8a  Valid entry kept ─────────────────────────────────────────────
  it("valid entry for active job → keep", () => {
    const entry = {
      valid: true,
      data: { jobId: "morning-brief", target: "@channel" },
    };
    const r = classifyQueueEntry(entry, validJobIds, jobsMap);
    assert.equal(r.action, "keep");
    assert.equal(r.reasons.length, 0);
  });

  // ── §8b  Invalid JSON → purge ────────────────────────────────────────
  it("invalid JSON entry → purge", () => {
    const entry = { valid: false, data: null, reason: "Unexpected token" };
    const r = classifyQueueEntry(entry, validJobIds, jobsMap);
    assert.equal(r.action, "purge");
    assert.ok(r.reasons.some(rr => rr.includes("Invalid JSON")));
  });

  // ── §8c  Missing jobId → purge ───────────────────────────────────────
  it("entry without jobId → purge", () => {
    const entry = { valid: true, data: { target: "@channel" } };
    const r = classifyQueueEntry(entry, validJobIds, jobsMap);
    assert.equal(r.action, "purge");
    assert.ok(r.reasons.some(rr => rr.includes("No jobId")));
  });

  // ── §8d  Unknown job → purge ─────────────────────────────────────────
  it("entry for unknown job → purge", () => {
    const entry = { valid: true, data: { jobId: "deleted-job" } };
    const r = classifyQueueEntry(entry, validJobIds, jobsMap);
    assert.equal(r.action, "purge");
    assert.ok(r.reasons.some(rr => rr.includes("unknown job")));
  });

  // ── §8e  no-delivery job queued → purge ───────────────────────────────
  it("entry for delivery=none job → purge (should never enqueue)", () => {
    const entry = { valid: true, data: { jobId: "daily-recap" } };
    const r = classifyQueueEntry(entry, validJobIds, jobsMap);
    assert.equal(r.action, "purge");
    assert.ok(r.reasons.some(rr => rr.includes('mode="none"')));
  });

  // ── §8f  @heartbeat target → purge ───────────────────────────────────
  it("@heartbeat target → purge (invalid placeholder)", () => {
    const entry = {
      valid: true,
      data: { jobId: "morning-brief", target: "@heartbeat" },
    };
    const r = classifyQueueEntry(entry, validJobIds, jobsMap);
    assert.equal(r.action, "purge");
    assert.ok(r.reasons.some(rr => rr.includes("heartbeat")));
  });

  // ── §8g  Invalid mode in entry → purge ────────────────────────────────
  it("entry with mode='silent' in payload → purge", () => {
    const entry = {
      valid: true,
      data: { jobId: "morning-brief", mode: "silent" },
    };
    const r = classifyQueueEntry(entry, validJobIds, jobsMap);
    assert.equal(r.action, "purge");
    assert.ok(r.reasons.some(rr => rr.includes("invalid mode")));
  });
});


// =========================================================================
// §9  Cron Job Full Validation (integration)
// =========================================================================
describe("Cron job full validation", () => {
  const globalConfig = {
    agents: {
      defaults: {
        model: { primary: "ollama/qwen2.5:7b" },
      },
    },
    models: {
      providers: {
        ollama: {
          baseUrl: "http://localhost:11434",
          models: [
            { id: "qwen2.5:7b", name: "Qwen 2.5 7B" },
          ],
        },
      },
    },
  };

  it("well-configured job → valid", () => {
    const job = { id: "j1", delivery: { mode: "none" } };
    const r = validateCronJob(job, {}, globalConfig, globalConfig.models.providers);
    assert.ok(r.valid, `expected valid but got errors: ${r.errors.join("; ")}`);
  });

  it("job with github-copilot model → errors", () => {
    const job = { id: "j1", model: "github-copilot/claude-opus-4.6", delivery: { mode: "none" } };
    const r = validateCronJob(job, {}, globalConfig, globalConfig.models.providers);
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes("VS Code auth")));
  });

  it("job with delivery=silent → errors", () => {
    const job = { id: "j1", delivery: { mode: "silent" } };
    const r = validateCronJob(job, {}, globalConfig, globalConfig.models.providers);
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes("delivery")));
  });

  it("job with delivery=none but target set → warning", () => {
    const job = { id: "j1", delivery: { mode: "none", target: "@user" } };
    const r = validateCronJob(job, {}, globalConfig, globalConfig.models.providers);
    assert.ok(r.valid); // valid but warned
    assert.ok(r.warnings.some(w => w.includes("target")));
  });

  it("no model anywhere → error", () => {
    const emptyConfig = { agents: { defaults: {} } };
    const job = { id: "j1", delivery: { mode: "none" } };
    const r = validateCronJob(job, {}, emptyConfig);
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes("No model resolved")));
  });

  it("diagnostics include resolution chain", () => {
    const job = { id: "j1", delivery: { mode: "none" } };
    const r = validateCronJob(job, {}, globalConfig, globalConfig.models.providers);
    assert.ok(r.diagnostics.resolutionChain.length > 0);
    assert.equal(r.diagnostics.resolvedModel, "ollama/qwen2.5:7b");
    assert.equal(r.diagnostics.modelSource, "global-default");
  });
});


// =========================================================================
// §10  Batch Cron Validation
// =========================================================================
describe("Batch cron validation", () => {
  const config = {
    agents: {
      list: [{ model: "ollama/qwen2.5:7b" }],
      defaults: {
        model: { primary: "ollama/qwen2.5:7b" },
      },
    },
    models: {
      providers: {
        ollama: {
          models: [{ id: "qwen2.5:7b", name: "Qwen" }],
        },
      },
    },
  };

  it("handles array format jobs.json", () => {
    const jobs = [
      { id: "j1", delivery: { mode: "none" } },
      { id: "j2", delivery: { mode: "none" } },
    ];
    const r = validateAllCronJobs(jobs, config);
    assert.ok(r.valid);
    assert.equal(r.results.length, 2);
  });

  it("handles {jobs: [...]} format", () => {
    const jobsData = {
      jobs: [{ id: "j1", delivery: { mode: "none" } }],
    };
    const r = validateAllCronJobs(jobsData, config);
    assert.ok(r.valid);
  });

  it("handles keyed-by-id format", () => {
    const jobsData = {
      j1: { delivery: { mode: "none" } },
      j2: { delivery: { mode: "announce" } },
    };
    const r = validateAllCronJobs(jobsData, config);
    assert.ok(r.valid);
  });
});


// =========================================================================
// §11  Startup Summary
// =========================================================================
describe("Startup summary", () => {
  it("buildStartupSummary produces readable output", () => {
    const config = {
      agents: {
        defaults: { model: { primary: "ollama/qwen2.5:7b" }, memorySearch: { enabled: true, provider: "ollama" } },
        list: [],
      },
      channels: { telegram: { enabled: true } },
    };
    const pluginResult = {
      plugins: [
        { name: "google", enabled: false, problematic: true },
        { name: "custom", enabled: true, problematic: false },
      ],
    };
    const gatewayResult = { healthy: true, latency: 42 };

    const summary = buildStartupSummary(config, pluginResult, gatewayResult);
    assert.ok(summary.includes("HEALTHY"));
    assert.ok(summary.includes("ollama/qwen2.5:7b"));
    assert.ok(summary.includes("google"));
    assert.ok(summary.includes("enabled"));
  });
});
